import * as net from "node:net";
import type { NetAddr } from "../node.js";
import type { NodeScanResult, DiscoverySource, ScanErrorCode } from "../scanner/NodeScanResult.js";
import { performHandshake } from "../handshake/handshake.js";
import { requestAddrs } from "./getaddr.js";
import { resolveDnsSeeds } from "./resolveDnsSeeds.js";
import { createAsyncChannel } from "./asyncChannel.js";
import { generateRandomIp } from "../random-ip/randomIp.js";
import {
	MAX_CONCURRENT,
	MAX_NODES,
	MAX_DEPTH,
	CONNECT_TIMEOUT_MS,
	HANDSHAKE_TIMEOUT_MS,
	GETADDR_TIMEOUT_MS,
	RESULT_BUFFER_SIZE,
} from "./constants.js";

function mapError(err: unknown): { code: ScanErrorCode; message: string } {
	if (!(err instanceof Error)) {
		return { code: "UNKNOWN", message: String(err) };
	}
	const msg = err.message;
	const sysCode = (err as NodeJS.ErrnoException).code;

	if (sysCode === "ECONNREFUSED" || msg.includes("ECONNREFUSED")) {
		return { code: "CONNECTION_REFUSED", message: msg };
	}
	if (sysCode === "ETIMEDOUT" || msg.includes("connect timeout")) {
		return { code: "TIMEOUT", message: msg };
	}
	if (sysCode === "EHOSTUNREACH" || sysCode === "ENETUNREACH" || sysCode === "ECONNRESET") {
		return { code: "UNREACHABLE", message: msg };
	}
	return { code: "UNKNOWN", message: msg };
}

export type CrawlerOptions = {
	maxConcurrent?: number;
	maxNodes?: number;
	maxDepth?: number;
	connectTimeoutMs?: number;
	handshakeTimeoutMs?: number;
	getaddrTimeoutMs?: number;
	manualAddresses?: NetAddr[];
	skipDnsSeeds?: boolean;
	/** AbortSignal to stop the crawl early (for continuous crawling). */
	signal?: AbortSignal;
	/**
	 * Max unread results buffered between workers and the consumer.
	 * When full, workers pause until the consumer drains. Defaults to
	 * {@link RESULT_BUFFER_SIZE}.
	 */
	resultBufferSize?: number;
	/** Enable random IPv4 scanning. Number of random IPs to probe, or true for unlimited. */
	randomScan?: number | boolean;
};

export type CrawlResult = {
	results: NodeScanResult[];
	totalScanned: number;
	totalDiscovered: number;
};

type QueueEntry = {
	ip: string;
	port: number;
	source: DiscoverySource;
	depth: number;
};

/**
 * Stream nodes as they are scanned. Returns an async iterable that yields
 * each `NodeScanResult` as soon as the worker pool finishes processing it.
 * Backpressure-aware via a bounded {@link createAsyncChannel}.
 *
 * Use this for long-running or continuous crawls where you want to process
 * results incrementally (write to DB, log, forward, etc.) instead of waiting
 * for the entire crawl to complete.
 *
 * The returned `totalDiscovered` callback reports how many unique addresses
 * were seen (including ones not yet scanned or unreachable).
 */
export function crawlStream(options: CrawlerOptions = {}): {
	results: AsyncIterable<NodeScanResult>;
	totalDiscovered: () => number;
} {
	const maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT;
	const maxNodes = options.maxNodes ?? MAX_NODES;
	const maxDepth = options.maxDepth ?? MAX_DEPTH;
	const connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
	const handshakeTimeoutMs = options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS;
	const getaddrTimeoutMs = options.getaddrTimeoutMs ?? GETADDR_TIMEOUT_MS;
	const resultBufferSize = options.resultBufferSize ?? RESULT_BUFFER_SIZE;
	const signal = options.signal;

	const seen = new Set<string>();
	// TODO: Old queue entries (indices < queueIdx) are never freed. At current
	// scale (~10k nodes) this is negligible. Consider a circular buffer if maxNodes grows.
	const queue: QueueEntry[] = [];
	let activeCount = 0;
	let queueIdx = 0;
	let aborted = signal?.aborted ?? false;
	let randomFeeding = false;

	const channel = createAsyncChannel<NodeScanResult>(resultBufferSize, signal);

	function enqueue(ip: string, port: number, source: DiscoverySource, depth: number): void {
		const key = `${ip}:${port}`;
		if (seen.has(key)) return;
		if (seen.size >= maxNodes) return;
		seen.add(key);
		queue.push({ ip, port, source, depth });
	}

	async function processNode(entry: QueueEntry): Promise<void> {
		const { ip, port, source, depth } = entry;
		const start = performance.now();
		const socket = new net.Socket();

		try {
			await new Promise<void>((res, rej) => {
				const connectTimer = setTimeout(() => {
					socket.destroy();
					rej(new Error("connect timeout"));
				}, connectTimeoutMs);

				socket.once("error", (err) => {
					clearTimeout(connectTimer);
					rej(err);
				});

				socket.connect(port, ip, () => {
					clearTimeout(connectTimer);
					socket.removeAllListeners("error");
					res();
				});
			});

			const latencyMs = performance.now() - start;

			const handshakeResult = await performHandshake(
				socket,
				{ ip: "0.0.0.0", port: 0 },
				{ ip, port },
				{ handshakeTimeoutMs, feeFilterWaitMs: 200 },
			);

			if (!handshakeResult.ok) {
				await channel.push({
					ip,
					port,
					source,
					reachable: true,
					latencyMs,
					error: { code: "HANDSHAKE_FAILED", message: handshakeResult.error },
				});
				socket.destroy();
				return;
			}

			// Push result immediately so the consumer sees it without waiting for getaddr.
			await channel.push({
				ip,
				port,
				source,
				reachable: true,
				latencyMs,
				peerInfo: handshakeResult.value,
			});

			if (depth < maxDepth && !aborted) {
				const addrs = await requestAddrs(socket, getaddrTimeoutMs);
				for (const addr of addrs) {
					enqueue(addr.ip, addr.port, "addr", depth + 1);
				}
			}

			socket.destroy();
		} catch (err: unknown) {
			socket.destroy();
			const mapped = mapError(err);
			await channel.push({
				ip,
				port,
				source,
				reachable: false,
				error: mapped,
			});
		}
	}

	function isDone(): boolean {
		return activeCount === 0 && queueIdx >= queue.length && !randomFeeding;
	}

	function onWorkerDone(): void {
		activeCount--;
		trySpawn();
		if (isDone() || aborted) {
			channel.close();
		}
	}

	function trySpawn(): void {
		if (aborted) return;
		while (activeCount < maxConcurrent && queueIdx < queue.length) {
			const entry = queue[queueIdx]!;
			queueIdx++;
			activeCount++;
			processNode(entry).then(onWorkerDone, onWorkerDone);
		}

		if (isDone()) {
			channel.close();
		}
	}

	// Wire abort
	// TODO: When signal fires, in-flight connections run to completion. A full
	// fix would require tracking active sockets and destroying them on abort.
	if (signal && !signal.aborted) {
		signal.addEventListener(
			"abort",
			() => {
				aborted = true;
			},
			{ once: true },
		);
	}

	// Kick off seeding and spawning asynchronously.
	(async () => {
		if (!options.skipDnsSeeds) {
			const dnsAddrs = await resolveDnsSeeds();
			for (const addr of dnsAddrs) {
				enqueue(addr.ip, addr.port, "dns", 0);
			}
		}

		if (options.manualAddresses) {
			for (const addr of options.manualAddresses) {
				enqueue(addr.ip, addr.port, "manual", 0);
			}
		}

		// Continuously feed random IPs into the queue, keeping it topped up.
		if (options.randomScan) {
			const limit = typeof options.randomScan === "number" ? options.randomScan : Infinity;
			let generated = 0;
			randomFeeding = true;

			const feedRandom = () => {
				const pending = queue.length - queueIdx;
				while (
					!aborted &&
					generated < limit &&
					seen.size < maxNodes &&
					pending + generated - queueIdx < maxConcurrent * 2
				) {
					enqueue(generateRandomIp(), 8333, "random", 0);
					generated++;
				}
				trySpawn();
				if (!aborted && generated < limit && seen.size < maxNodes) {
					setTimeout(feedRandom, 50);
				} else {
					randomFeeding = false;
				}
			};
			feedRandom();
		}

		trySpawn();
	})();

	return {
		results: channel,
		totalDiscovered: () => seen.size,
	};
}

/**
 * Convenience wrapper that collects all results from {@link crawlStream}.
 * Prefer `crawlStream` for large or long-running crawls.
 */
export async function crawl(options: CrawlerOptions = {}): Promise<CrawlResult> {
	const { results: stream, totalDiscovered } = crawlStream(options);
	const results: NodeScanResult[] = [];

	for await (const result of stream) {
		results.push(result);
	}

	return {
		results,
		totalScanned: results.length,
		totalDiscovered: totalDiscovered(),
	};
}
