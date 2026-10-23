import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { extractTarGz } from "./tar.js";
import { TOR_BUNDLES, TOR_VERSION, VENDOR_DIR, platformKey, torBinaryPath } from "./torBinary.js";

export type FetchTorOptions = {
	vendorDir?: string;
	key?: string;
	bundles?: Record<string, { file: string; sha256: string }>;
	download?: (url: string) => Promise<Buffer>;
	sign?: (files: string[]) => Promise<void>;
	log?: (message: string) => void;
};

async function downloadBuffer(url: string): Promise<Buffer> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
	return Buffer.from(await response.arrayBuffer());
}

// Expert Bundle binaries ship unsigned and Apple Silicon refuses to execute unsigned arm64 code.
async function adHocSign(files: string[]): Promise<void> {
	await promisify(execFile)("codesign", ["--sign", "-", "--force", ...files]);
}

function machOFiles(torDir: string): string[] {
	return fs
		.readdirSync(torDir)
		.filter((name) => name === "tor" || name.endsWith(".dylib"))
		.map((name) => path.join(torDir, name));
}

/**
 * Download the Tor Expert Bundle for this platform, verify its pinned SHA-256 and
 * unpack it into `vendor/tor/<platform>-<arch>/`. Returns the path of the `tor` binary.
 */
export async function fetchTor(options: FetchTorOptions = {}): Promise<string> {
	const key = options.key ?? platformKey();
	const vendorDir = options.vendorDir ?? VENDOR_DIR;
	const log = options.log ?? (() => {});

	const bundles = options.bundles ?? TOR_BUNDLES;
	const bundle = bundles[key];
	if (!bundle) {
		throw new Error(
			`No Tor Expert Bundle for ${key}. Supported: ${Object.keys(bundles).join(", ")}`,
		);
	}

	const url = `https://dist.torproject.org/torbrowser/${TOR_VERSION}/${bundle.file}`;
	log(`Downloading ${url}`);
	const archive = await (options.download ?? downloadBuffer)(url);

	const digest = createHash("sha256").update(archive).digest("hex");
	if (digest !== bundle.sha256) {
		throw new Error(
			`Checksum mismatch for ${bundle.file}: expected ${bundle.sha256}, got ${digest}`,
		);
	}

	const dest = path.join(vendorDir, key);
	fs.rmSync(dest, { recursive: true, force: true });
	extractTarGz(archive, dest);

	if (key.startsWith("darwin-")) {
		await (options.sign ?? adHocSign)(machOFiles(path.join(dest, "tor")));
	}

	return torBinaryPath(vendorDir, key);
}
