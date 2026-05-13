import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as net from "node:net";
import { scanNode } from "../nodeScanner.js";
import { createMockBitcoinNode, closeMockNode } from "../../handshake/mockBitcoinNode.js";

/** Helper: create a TCP server on a random port and return it + assigned port. */
function listen(server: net.Server): Promise<number> {
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as net.AddressInfo;
			resolve(addr.port);
		});
	});
}

/** Helper: close a server, ignoring errors if already closed. */
function close(server: net.Server): Promise<void> {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}

describe(scanNode.name, () => {
	it("reports reachable for an open TCP port", async () => {
		const server = net.createServer();
		const port = await listen(server);

		try {
			const result = await scanNode({
				address: { ip: "127.0.0.1", port, source: "manual" },
				options: { connectTimeoutMs: 2000, overallTimeoutMs: 3000 },
			});

			assert.equal(result.reachable, true);
			assert.equal(result.ip, "127.0.0.1");
			assert.equal(result.port, port);
			assert.equal(result.source, "manual");
			assert.equal(typeof result.latencyMs, "number");
			assert.ok(result.latencyMs! >= 0, "latency should be non-negative");
			assert.equal(result.error, undefined);
		} finally {
			await close(server);
		}
	});

	it("reports CONNECTION_REFUSED when nothing is listening", async () => {
		// Bind and immediately close to get a port we know is free
		const server = net.createServer();
		const port = await listen(server);
		await close(server);

		const result = await scanNode({
			address: { ip: "127.0.0.1", port, source: "dns" },
			options: { connectTimeoutMs: 2000, overallTimeoutMs: 3000 },
		});

		assert.equal(result.reachable, false);
		assert.equal(result.error?.code, "CONNECTION_REFUSED");
	});

	it("times out when connection cannot be established", async () => {
		// Create a server that listens but never accepts (backlog = 0 + pause)
		// Use a non-routable IP to guarantee a timeout
		const result = await scanNode({
			address: { ip: "192.0.2.1", port: 8333, source: "random" },
			options: { connectTimeoutMs: 200, overallTimeoutMs: 500 },
		});

		assert.equal(result.reachable, false);
		assert.equal(result.error?.code, "TIMEOUT");
	});

	it("passes through source and port correctly", async () => {
		const server = net.createServer();
		const port = await listen(server);

		try {
			const result = await scanNode({
				address: { ip: "127.0.0.1", port, source: "bootstrap" },
				options: { connectTimeoutMs: 2000, overallTimeoutMs: 3000 },
			});

			assert.equal(result.source, "bootstrap");
			assert.equal(result.port, port);
		} finally {
			await close(server);
		}
	});

	it("respects overall timeout", async () => {
		// Use non-routable IP with a very short overall timeout
		const start = performance.now();

		const result = await scanNode({
			address: { ip: "192.0.2.1", port: 1234, source: "manual" },
			options: { connectTimeoutMs: 5000, overallTimeoutMs: 300 },
		});

		const elapsed = performance.now() - start;

		assert.equal(result.reachable, false);
		assert.equal(result.error?.code, "TIMEOUT");
		// Should have timed out around 300ms, not 5000ms
		assert.ok(
			elapsed < 1000,
			`Overall timeout should fire before connect timeout (took ${elapsed}ms)`,
		);
	});

	it("does not include peerInfo when handshake is disabled", async () => {
		const server = net.createServer();
		const port = await listen(server);

		try {
			const result = await scanNode({
				address: { ip: "127.0.0.1", port, source: "manual" },
				options: { connectTimeoutMs: 2000, overallTimeoutMs: 3000 },
			});

			assert.equal(result.reachable, true);
			assert.equal(result.peerInfo, undefined);
		} finally {
			await close(server);
		}
	});

	it("collects peerInfo when handshake is enabled", async () => {
		const { server, port } = await createMockBitcoinNode({
			behavior: "normal",
			userAgent: "/TestNode:1.0/",
			startHeight: 840000,
			services: 9n,
			feeFilterSatPerKb: 1000n,
		});

		try {
			const result = await scanNode({
				address: { ip: "127.0.0.1", port, source: "manual" },
				options: {
					connectTimeoutMs: 2000,
					overallTimeoutMs: 10000,
					handshake: true,
					handshakeOptions: { handshakeTimeoutMs: 3000, feeFilterWaitMs: 1000 },
				},
			});

			assert.equal(result.reachable, true);
			assert.ok(result.peerInfo);
			assert.equal(result.peerInfo.userAgent, "/TestNode:1.0/");
			assert.equal(result.peerInfo.startHeight, 840000);
			assert.equal(result.peerInfo.services.raw, 9n);
			assert.ok(result.peerInfo.feeFilter);
			assert.equal(result.peerInfo.feeFilter.satPerKb, 1000n);
			assert.equal(result.error, undefined);
		} finally {
			await closeMockNode(server);
		}
	});

	it("reports HANDSHAKE_FAILED but still reachable when handshake fails", async () => {
		// A plain TCP server that doesn't speak Bitcoin protocol
		const server = net.createServer((socket) => {
			socket.write("HTTP/1.1 200 OK\r\n\r\n");
			socket.destroy();
		});
		const port = await listen(server);

		try {
			const result = await scanNode({
				address: { ip: "127.0.0.1", port, source: "manual" },
				options: {
					connectTimeoutMs: 2000,
					overallTimeoutMs: 5000,
					handshake: true,
					handshakeOptions: { handshakeTimeoutMs: 500 },
				},
			});

			assert.equal(result.reachable, true);
			assert.ok(result.latencyMs! >= 0);
			assert.equal(result.error?.code, "HANDSHAKE_FAILED");
			assert.equal(result.peerInfo, undefined);
		} finally {
			await close(server);
		}
	});
});
