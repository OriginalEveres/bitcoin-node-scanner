import * as net from "node:net";
import type { NetAddr, Network } from "../node.js";
import type { NodeScanResult, DiscoverySource, ScanErrorCode } from "../scanner/NodeScanResult.js";
import { performHandshake } from "../handshake/handshake.js";
import { requestAddrs } from "./getaddr.js";
import { resolveDnsSeeds } from "./resolveDnsSeeds.js";
import { createAsyncChannel } from "./asyncChannel.js";
import { generateRandomIp } from "../random-ip/randomIp.js";
import { socks5Connect, Socks5Error } from "../tor/socks5.js";
import { startTor } from "../tor/torProcess.js";
import type { TorProcess } from "../tor/torProcess.js";
import {
	MAX_CONCURRENT,
	MAX_NODES,
	MAX_DEPTH,
	CONNECT_TIMEOUT_MS,
	HANDSHAKE_TIMEOUT_MS,
	GETADDR_TIMEOUT_MS,
	RESULT_BUFFER_SIZE,
	TOR_CONNECT_TIMEOUT_MS,
	TOR_MAX_CONCURRENT,
} from "./constants.js";

const SOCKS_REPLY_CODES: Record<number, ScanErrorCode> = {
	3: "UNREACHABLE",
	4: "UNREACHABLE",
	5: "CONNECTION_REFUSED",
	6: "TIMEOUT",
};

function mapError(err: unknown): { code: ScanErrorCode; message: string } {
	if (!(err instanceof Error)) {
		return { code: "UNKNOWN", message: String(err) };
	}
	const msg = err.message;
	const sysCode = (err as NodeJS.ErrnoException).code;

	if (err instanceof Socks5Error && err.reply !== undefined) {
		return { code: SOCKS_REPLY_CODES[err.reply] ?? "UNKNOWN", message: msg };
	}
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

export type TorOptions = {
	enabled: boolean;
	/** SOCKS5 connect timeout through Tor. Defaults to {@link TOR_CONNECT_TIMEOUT_MS}. */
	connectTimeoutMs?: number;
	/** Simultaneous Tor connections, independent of `maxConcurrent`. Defaults to {@link TOR_MAX_CONCURRENT}. */
	maxConcurrent?: number;
	/** Reuse a SOCKS5 listener on 127.0.0.1 instead of starting the bundled Tor binary. */
	socksPort?: number;
	/** Path of the `tor` binary to start. Defaults to the bundle fetched by `yarn fetch-tor`. */
	binary?: string;
};

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
	/** Dial `.onion` peers through the bundled Tor client. Off by default; onion peers are then reported as `SKIPPED`. */
	tor?: TorOptions;
};

export type CrawlResult = {
	results: NodeScanResult[];
	totalScanned: number;
	totalDiscovered: number;
};

type QueueEntry = NetAddr & {
	source: DiscoverySource;
	depth: number;
};

type WorkerPool = {
	queue: QueueEntry[];
	next: number;
	active: number;
	max: number;
};

function hasPending(pool: WorkerPool): boolean {
	return pool.next < pool.queue.length;
}

function isClearnet(network?: Network): boolean {
	return network === undefined || network === "ipv4" || network === "ipv6";
}

function connectTcp(ip: string, port: number, timeoutMs: number): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const socket = new net.Socket();
		const connectTimer = setTimeout(() => {
			socket.destroy();
			reject(new Error("connect timeout"));
		}, timeoutMs);

		socket.once("error", (err) => {
			clearTimeout(connectTimer);
			socket.destroy();
			reject(err);
		});

		socket.connect(port, ip, () => {
			clearTimeout(connectTimer);
			socket.removeAllListeners("error");
			resolve(socket);
		});
	});
}

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
 *
 * With `tor.enabled`, the bundled Tor client is started up front and onion
 * peers are dialed through it from a separate pool. If Tor fails to start or
 * bootstrap, the stream throws after delivering the results collected so far.
 */
export function crawlStream(options: CrawlerOptions = {}): {
	results: AsyncIterable<NodeScanResult>;
	totalDiscovered: () => number;
} {
	const maxNodes = options.maxNodes ?? MAX_NODES;
	const maxDepth = options.maxDepth ?? MAX_DEPTH;
	const connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
	const handshakeTimeoutMs = options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS;
	const getaddrTimeoutMs = options.getaddrTimeoutMs ?? GETADDR_TIMEOUT_MS;
	const resultBufferSize = options.resultBufferSize ?? RESULT_BUFFER_SIZE;
	const signal = options.signal;
	const tor = options.tor?.enabled ? options.tor : undefined;
	const torConnectTimeoutMs = tor?.connectTimeoutMs ?? TOR_CONNECT_TIMEOUT_MS;

	const seen = new Set<string>();
	// TODO: Old queue entries (indices < pool.next) are never freed. At current
	// scale (~10k nodes) this is negligible. Consider a circular buffer if maxNodes grows.
	const clearnet: WorkerPool = {
		queue: [],
		next: 0,
		active: 0,
		max: options.maxConcurrent ?? MAX_CONCURRENT,
	};
	const torPool: WorkerPool = {
		queue: [],
		next: 0,
		active: 0,
		max: tor?.maxConcurrent ?? TOR_MAX_CONCURRENT,
	};
	let torProcess: TorProcess | undefined;
	let socksPort = tor?.socksPort;
	let aborted = signal?.aborted ?? false;
	let randomFeeding = false;
	let finished = false;

	const channel = createAsyncChannel<NodeScanResult>(resultBufferSize, signal);

	function enqueue(addr: NetAddr, source: DiscoverySource, depth: number): void {
		const key = `${addr.ip}:${addr.port}`;
		if (seen.has(key)) return;
		if (seen.size >= maxNodes) return;
		seen.add(key);
		const pool = tor && addr.network === "tor" ? torPool : clearnet;
		pool.queue.push({ ...addr, source, depth });
	}

	function dial(entry: QueueEntry): Promise<net.Socket> {
		if (entry.network === "tor") {
			return socks5Connect({
				proxyPort: socksPort!,
				host: entry.ip,
				port: entry.port,
				timeoutMs: torConnectTimeoutMs,
			});
		}
		return connectTcp(entry.ip, entry.port, connectTimeoutMs);
	}

	async function processNode(entry: QueueEntry): Promise<void> {
		const { source, depth, ...addr } = entry;
		const { ip, port, network } = addr;

		if (!isClearnet(network) && !(network === "tor" && tor)) {
			await channel.push({
				...addr,
				source,
				reachable: false,
				error: { code: "SKIPPED", message: `${network} connectivity not enabled` },
			});
			return;
		}

		const start = performance.now();
		let socket: net.Socket | undefined;

		try {
			socket = await dial(entry);
			const latencyMs = performance.now() - start;

			// Onion peers never learn our address, and we must not leak theirs in clear.
			const remoteAddr = network === "tor" ? { ip: "0.0.0.0", port: 0 } : { ip, port };
			const handshakeResult = await performHandshake(
				socket,
				{ ip: "0.0.0.0", port: 0 },
				remoteAddr,
				{ handshakeTimeoutMs, feeFilterWaitMs: 200 },
			);

			if (!handshakeResult.ok) {
				await channel.push({
					...addr,
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
				...addr,
				source,
				reachable: true,
				latencyMs,
				peerInfo: handshakeResult.value,
			});

			if (depth < maxDepth && !aborted) {
				const addrs = await requestAddrs(socket, getaddrTimeoutMs);
				for (const found of addrs) {
					enqueue(found, "addr", depth + 1);
				}
			}

			socket.destroy();
		} catch (err: unknown) {
			socket?.destroy();
			await channel.push({
				...addr,
				source,
				reachable: false,
				error: mapError(err),
			});
		}
	}

	function isDone(): boolean {
		return (
			clearnet.active === 0 &&
			torPool.active === 0 &&
			!hasPending(clearnet) &&
			!hasPending(torPool) &&
			!randomFeeding
		);
	}

	async function finish(): Promise<void> {
		if (finished) return;
		finished = true;
		await torProcess?.stop();
		channel.close();
	}

	function fail(err: Error): void {
		if (finished) return;
		finished = true;
		aborted = true;
		channel.fail(err);
	}

	function spawnFrom(pool: WorkerPool): void {
		while (pool.active < pool.max && hasPending(pool)) {
			const entry = pool.queue[pool.next]!;
			pool.next++;
			pool.active++;
			const done = (): void => {
				pool.active--;
				trySpawn();
			};
			processNode(entry).then(done, done);
		}
	}

	function trySpawn(): void {
		if (aborted) {
			void finish();
			return;
		}
		spawnFrom(clearnet);
		if (socksPort !== undefined) spawnFrom(torPool);

		if (isDone()) {
			void finish();
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
				void finish();
			},
			{ once: true },
		);
	}

	// Kick off seeding and spawning asynchronously.
	(async () => {
		if (tor && socksPort === undefined) {
			try {
				torProcess = startTor(tor.binary === undefined ? {} : { binary: tor.binary });
			} catch (err) {
				fail(err as Error);
				return;
			}
			torProcess.ready.then(
				(port) => {
					socksPort = port;
					trySpawn();
				},
				(err: Error) => fail(err),
			);
		}

		if (!options.skipDnsSeeds) {
			const dnsAddrs = await resolveDnsSeeds();
			for (const addr of dnsAddrs) {
				enqueue(addr, "dns", 0);
			}
		}

		if (options.manualAddresses) {
			for (const addr of options.manualAddresses) {
				enqueue(addr, "manual", 0);
			}
		}

		// Continuously feed random IPs into the queue, keeping it topped up.
		if (options.randomScan) {
			const limit = typeof options.randomScan === "number" ? options.randomScan : Infinity;
			let generated = 0;
			randomFeeding = true;

			const feedRandom = () => {
				const pending = clearnet.queue.length - clearnet.next;
				while (
					!aborted &&
					generated < limit &&
					seen.size < maxNodes &&
					pending + generated - clearnet.next < clearnet.max * 2
				) {
					enqueue({ ip: generateRandomIp(), port: 8333 }, "random", 0);
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
