import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { platformKey, torBinaryPath } from "./torBinary.js";

export const TOR_BOOTSTRAP_TIMEOUT_MS = 120_000;
const STOP_GRACE_MS = 5_000;

export type TorProcess = {
	/** Resolves with the SOCKS5 port once Tor reports `Bootstrapped 100%`. */
	ready: Promise<number>;
	stop: () => Promise<void>;
};

export type StartTorOptions = {
	binary?: string;
	bootstrapTimeoutMs?: number;
};

export function resolveTorBinary(binary = torBinaryPath()): string {
	if (!fs.existsSync(binary)) {
		throw new Error(
			`Tor binary not found for ${platformKey()} at ${binary}. Run \`yarn fetch-tor\` to download it.`,
		);
	}
	return binary;
}

/**
 * Spawn the bundled Tor client with a throwaway data directory and a random
 * SOCKS port. The process is killed on {@link TorProcess.stop} and on exit of
 * this process.
 */
export function startTor(options: StartTorOptions = {}): TorProcess {
	const binary = resolveTorBinary(options.binary);
	const bootstrapTimeoutMs = options.bootstrapTimeoutMs ?? TOR_BOOTSTRAP_TIMEOUT_MS;
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "btc-crawl-tor-"));
	const libDir = path.dirname(binary);

	const child = spawn(
		binary,
		[
			"--DataDirectory",
			dataDir,
			"--SocksPort",
			"auto",
			"--ClientOnly",
			"1",
			"--Log",
			"notice stdout",
			// Tor exits by itself if this process dies without running exit handlers (e.g. SIGTERM).
			"--__OwningControllerProcess",
			String(process.pid),
		],
		{
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"),
			},
		},
	);

	const killOnExit = (): void => {
		child.kill("SIGKILL");
	};
	process.once("exit", killOnExit);

	let exited = false;
	child.once("exit", () => {
		exited = true;
		process.removeListener("exit", killOnExit);
		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	const stop = (): Promise<void> =>
		new Promise((resolve) => {
			if (exited) {
				resolve();
				return;
			}
			const forceKill = setTimeout(() => child.kill("SIGKILL"), STOP_GRACE_MS);
			child.once("exit", () => {
				clearTimeout(forceKill);
				resolve();
			});
			child.kill("SIGTERM");
		});

	const ready = new Promise<number>((resolve, reject) => {
		let socksPort: number | undefined;
		let settled = false;
		const recentLines: string[] = [];
		let pending = "";

		const fail = (message: string): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			void stop().then(() => reject(new Error(message)));
		};

		const timer = setTimeout(
			() =>
				fail(
					`Tor did not bootstrap within ${bootstrapTimeoutMs}ms\n${recentLines.join("\n")}`,
				),
			bootstrapTimeoutMs,
		);

		const onLine = (line: string): void => {
			recentLines.push(line);
			if (recentLines.length > 10) recentLines.shift();

			const port = /Socks listener listening on port (\d+)/.exec(line);
			if (port) socksPort = Number(port[1]);

			if (line.includes("Bootstrapped 100%") && socksPort !== undefined && !settled) {
				settled = true;
				clearTimeout(timer);
				resolve(socksPort);
			}
		};

		child.stdout.on("data", (chunk: Buffer) => {
			pending += chunk.toString();
			const lines = pending.split("\n");
			pending = lines.pop() ?? "";
			lines.forEach(onLine);
		});
		child.stderr.on("data", (chunk: Buffer) => onLine(chunk.toString().trimEnd()));
		child.once("error", (err) => fail(`Failed to start tor: ${err.message}`));
		child.once("exit", (code, signal) =>
			fail(`tor exited before bootstrap (${code ?? signal})\n${recentLines.join("\n")}`),
		);
	});

	return { ready, stop };
}
