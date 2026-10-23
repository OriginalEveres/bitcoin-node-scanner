import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { createMockBitcoinNode, closeMockNode } from "../../handshake/mockBitcoinNode.js";
import { crawl, crawlStream } from "../crawler.js";
import { createMockSocks5Server } from "../../tor/mockSocks5Server.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ONION = "pg6mmjiyjmcrsslvykfwnntlaru7p5svn6y2ymmju6nubxndf4pscryd.onion";

describe("crawl", () => {
	it("scans a single mock node with maxDepth 0", async () => {
		const { server, port } = await createMockBitcoinNode({
			behavior: "normal",
		});

		try {
			const result = await crawl({
				skipDnsSeeds: true,
				manualAddresses: [{ ip: "127.0.0.1", port }],
				maxDepth: 0,
				maxConcurrent: 1,
			});

			assert.equal(result.results.length, 1);
			assert.equal(result.totalScanned, 1);
			const r = result.results[0]!;
			assert.equal(r.reachable, true);
			assert.ok(r.peerInfo);
			assert.equal(r.source, "manual");
		} finally {
			await closeMockNode(server);
		}
	});

	it("reports HANDSHAKE_FAILED for no-verack node", async () => {
		const { server, port } = await createMockBitcoinNode({
			behavior: "no-verack",
		});

		try {
			const result = await crawl({
				skipDnsSeeds: true,
				manualAddresses: [{ ip: "127.0.0.1", port }],
				maxDepth: 0,
				handshakeTimeoutMs: 1000,
			});

			assert.equal(result.results.length, 1);
			const r = result.results[0]!;
			assert.equal(r.reachable, true);
			assert.equal(r.error?.code, "HANDSHAKE_FAILED");
		} finally {
			await closeMockNode(server);
		}
	});

	it("reports error for unreachable port", async () => {
		const result = await crawl({
			skipDnsSeeds: true,
			manualAddresses: [{ ip: "127.0.0.1", port: 1 }],
			maxDepth: 0,
			connectTimeoutMs: 1000,
		});

		assert.equal(result.results.length, 1);
		const r = result.results[0]!;
		assert.equal(r.reachable, false);
		assert.ok(r.error);
	});
});

describe("crawlStream", () => {
	it("yields results incrementally", async () => {
		const { server, port } = await createMockBitcoinNode({
			behavior: "normal",
		});

		try {
			const results = [];
			const { results: stream } = crawlStream({
				skipDnsSeeds: true,
				manualAddresses: [{ ip: "127.0.0.1", port }],
				maxDepth: 0,
			});
			for await (const result of stream) {
				results.push(result);
			}

			assert.equal(results.length, 1);
			assert.equal(results[0]!.reachable, true);
		} finally {
			await closeMockNode(server);
		}
	});

	it("discovers peers via getaddr at depth 1", async () => {
		// Second mock node that will be discovered via getaddr
		const { server: server2, port: port2 } = await createMockBitcoinNode({
			behavior: "normal",
		});

		// First mock node that advertises server2
		const { server: server1, port: port1 } = await createMockBitcoinNode({
			behavior: "normal",
			addrResponses: [{ ip: "127.0.0.1", port: port2 }],
		});

		try {
			const result = await crawl({
				skipDnsSeeds: true,
				manualAddresses: [{ ip: "127.0.0.1", port: port1 }],
				maxDepth: 1,
				maxConcurrent: 1,
			});

			// Should have scanned both nodes
			assert.equal(result.results.length, 2);
			const ports = result.results.map((r) => r.port).sort((a, b) => a - b);
			assert.deepEqual(
				ports,
				[port1, port2].sort((a, b) => a - b),
			);
		} finally {
			await closeMockNode(server1);
			await closeMockNode(server2);
		}
	});

	it("respects abort signal", async () => {
		const { server, port } = await createMockBitcoinNode({
			behavior: "normal",
		});

		try {
			const controller = new AbortController();
			controller.abort();

			const result = await crawl({
				skipDnsSeeds: true,
				manualAddresses: [{ ip: "127.0.0.1", port }],
				maxDepth: 0,
				signal: controller.signal,
			});

			assert.ok(result.results.length <= 1);
		} finally {
			await closeMockNode(server);
		}
	});

	it("totalDiscovered includes peers found via getaddr", async () => {
		const { server, port } = await createMockBitcoinNode({
			behavior: "normal",
			addrResponses: [
				{ ip: "10.0.0.1", port: 8333 },
				{ ip: "10.0.0.2", port: 8333 },
			],
		});

		try {
			const result = await crawl({
				skipDnsSeeds: true,
				manualAddresses: [{ ip: "127.0.0.1", port }],
				maxDepth: 1,
				maxNodes: 10,
				connectTimeoutMs: 500,
			});

			// totalDiscovered includes the seed node + discovered addrs,
			// even if the discovered addrs are unreachable.
			assert.ok(
				result.totalDiscovered >= result.totalScanned,
				`totalDiscovered (${result.totalDiscovered}) should be >= totalScanned (${result.totalScanned})`,
			);
		} finally {
			await closeMockNode(server);
		}
	});

	it("enqueues onion peers, reports them as skipped and counts them", async () => {
		const { server, port } = await createMockBitcoinNode({
			behavior: "normal",
			addrV2Responses: [{ networkId: 4, address: Buffer.alloc(32, 7), port: 8333 }],
		});

		try {
			const result = await crawl({
				skipDnsSeeds: true,
				manualAddresses: [{ ip: "127.0.0.1", port }],
				maxDepth: 1,
				maxConcurrent: 1,
			});

			assert.equal(result.totalDiscovered, 2);
			assert.equal(result.results.length, 2);

			const onion = result.results.find((r) => r.network === "tor");
			assert.ok(onion);
			assert.ok(onion.ip.endsWith(".onion"));
			assert.equal(onion.source, "addr");
			assert.equal(onion.reachable, false);
			assert.equal(onion.error?.code, "SKIPPED");
		} finally {
			await closeMockNode(server);
		}
	});
});

describe("crawl with tor", () => {
	it("dials onion peers through the SOCKS5 proxy and follows their getaddr", async () => {
		const onionNode = await createMockBitcoinNode({
			behavior: "normal",
			addrV2Responses: [{ networkId: 4, address: Buffer.alloc(32, 9), port: 8333 }],
		});
		const proxy = await createMockSocks5Server({ targetPort: onionNode.port });

		try {
			const result = await crawl({
				skipDnsSeeds: true,
				manualAddresses: [{ ip: ONION, port: 8333, network: "tor" }],
				maxDepth: 1,
				tor: { enabled: true, socksPort: proxy.port },
			});

			assert.equal(result.results.length, 2);
			assert.equal(result.totalDiscovered, 2);
			for (const r of result.results) {
				assert.equal(r.network, "tor");
				assert.equal(r.reachable, true);
				assert.ok(r.peerInfo);
			}
			assert.deepEqual(
				proxy.requests.map((r) => r.host.endsWith(".onion")),
				[true, true],
			);
			assert.equal(proxy.requests[0]!.host, ONION);
		} finally {
			proxy.server.close();
			await closeMockNode(onionNode.server);
		}
	});

	it("never routes clearnet peers through the proxy", async () => {
		const node = await createMockBitcoinNode({ behavior: "normal" });
		const proxy = await createMockSocks5Server({ targetPort: node.port });

		try {
			const result = await crawl({
				skipDnsSeeds: true,
				manualAddresses: [{ ip: "127.0.0.1", port: node.port }],
				maxDepth: 0,
				tor: { enabled: true, socksPort: proxy.port },
			});

			assert.equal(result.results[0]!.reachable, true);
			assert.deepEqual(proxy.requests, []);
		} finally {
			proxy.server.close();
			await closeMockNode(node.server);
		}
	});

	it("maps SOCKS5 reply codes to scan error codes", async () => {
		for (const [replyCode, expected] of [
			[4, "UNREACHABLE"],
			[5, "CONNECTION_REFUSED"],
		] as const) {
			const proxy = await createMockSocks5Server({ replyCode });
			try {
				const result = await crawl({
					skipDnsSeeds: true,
					manualAddresses: [{ ip: ONION, port: 8333, network: "tor" }],
					maxDepth: 0,
					tor: { enabled: true, socksPort: proxy.port },
				});
				assert.equal(result.results[0]!.reachable, false);
				assert.equal(result.results[0]!.error?.code, expected);
			} finally {
				proxy.server.close();
			}
		}
	});

	it("respects the tor concurrency limit independently of maxConcurrent", async () => {
		const node = await createMockBitcoinNode({ behavior: "no-feefilter" });
		const proxy = await createMockSocks5Server({ targetPort: node.port });
		const onions = Array.from({ length: 4 }, (_, i) => ({
			ip: `${"a".repeat(55)}${i}.onion`,
			port: 8333,
			network: "tor" as const,
		}));

		try {
			let inFlight = 0;
			let peak = 0;
			proxy.server.on("connection", (socket) => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				socket.on("close", () => inFlight--);
			});

			const result = await crawl({
				skipDnsSeeds: true,
				manualAddresses: onions,
				maxDepth: 0,
				maxConcurrent: 50,
				tor: { enabled: true, socksPort: proxy.port, maxConcurrent: 1 },
			});

			assert.equal(result.results.length, 4);
			assert.equal(peak, 1);
		} finally {
			proxy.server.close();
			await closeMockNode(node.server);
		}
	});

	it("fails the crawl when the tor binary is missing", async () => {
		await assert.rejects(
			crawl({
				skipDnsSeeds: true,
				manualAddresses: [{ ip: ONION, port: 8333, network: "tor" }],
				tor: { enabled: true, binary: "/nonexistent/tor" },
			}),
			/Tor binary not found/,
		);
	});

	it("fails the crawl after delivering clearnet results when tor exits early", async () => {
		const node = await createMockBitcoinNode({ behavior: "normal" });
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-tor-"));
		const binary = path.join(dir, "tor");
		fs.writeFileSync(binary, "#!/bin/sh\nsleep 0.3\nexit 1\n", { mode: 0o700 });

		try {
			const { results } = crawlStream({
				skipDnsSeeds: true,
				manualAddresses: [
					{ ip: "127.0.0.1", port: node.port },
					{ ip: ONION, port: 8333, network: "tor" },
				],
				maxDepth: 0,
				tor: { enabled: true, binary },
			});

			const seen: string[] = [];
			await assert.rejects(async () => {
				for await (const r of results) seen.push(r.ip);
			}, /exited before bootstrap/);
			assert.deepEqual(seen, ["127.0.0.1"]);
		} finally {
			await closeMockNode(node.server);
		}
	});
});
