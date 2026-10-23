import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as net from "node:net";
import { performHandshake } from "../../handshake/handshake.js";
import { createMockBitcoinNode, closeMockNode } from "../../handshake/mockBitcoinNode.js";
import { requestAddrs } from "../getaddr.js";

function connectTo(port: number): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
			resolve(socket);
		});
		socket.once("error", reject);
	});
}

describe("requestAddrs", () => {
	it("receives addr entries from mock node after getaddr", async () => {
		const { server, port } = await createMockBitcoinNode({
			behavior: "normal",
			addrResponses: [
				{ ip: "10.0.0.1", port: 8333, services: 9n },
				{ ip: "10.0.0.2", port: 8333, services: 1n },
				{ ip: "192.168.1.100", port: 18333, services: 0n },
			],
		});

		try {
			const socket = await connectTo(port);

			// First complete the handshake
			const hsResult = await performHandshake(
				socket,
				{ ip: "127.0.0.1", port: 0 },
				{ ip: "127.0.0.1", port },
				{ handshakeTimeoutMs: 3000, feeFilterWaitMs: 200 },
			);
			assert.equal(hsResult.ok, true);

			// Now request addresses
			const entries = await requestAddrs(socket, 3000);

			assert.equal(entries.length, 3);
			assert.equal(entries[0]!.ip, "10.0.0.1");
			assert.equal(entries[0]!.port, 8333);
			assert.equal(entries[0]!.services.raw, 9n);
			assert.equal(entries[1]!.ip, "10.0.0.2");
			assert.equal(entries[2]!.ip, "192.168.1.100");
			assert.equal(entries[2]!.port, 18333);

			socket.destroy();
		} finally {
			await closeMockNode(server);
		}
	});

	it("returns empty array on timeout when no addr response", async () => {
		const { server, port } = await createMockBitcoinNode({
			behavior: "normal",
			// No addrResponses configured — mock won't reply to getaddr
		});

		try {
			const socket = await connectTo(port);

			const hsResult = await performHandshake(
				socket,
				{ ip: "127.0.0.1", port: 0 },
				{ ip: "127.0.0.1", port },
				{ handshakeTimeoutMs: 3000, feeFilterWaitMs: 200 },
			);
			assert.equal(hsResult.ok, true);

			const entries = await requestAddrs(socket, 300);
			assert.equal(entries.length, 0);

			socket.destroy();
		} finally {
			await closeMockNode(server);
		}
	});

	it("returns empty array when socket is already destroyed", async () => {
		const socket = new net.Socket();
		socket.destroy();

		const entries = await requestAddrs(socket, 300);
		assert.equal(entries.length, 0);
	});

	it("receives addrv2 entries when the mock node supports it", async () => {
		const { server, port } = await createMockBitcoinNode({
			behavior: "normal",
			addrResponses: [{ ip: "10.0.0.1", port: 8333 }],
			addrV2Responses: [
				{ networkId: 1, address: Buffer.from([10, 0, 0, 2]), port: 8333, services: 9n },
				{ networkId: 4, address: Buffer.alloc(32, 7), port: 8333 },
			],
		});

		try {
			const socket = await connectTo(port);

			const hsResult = await performHandshake(
				socket,
				{ ip: "127.0.0.1", port: 0 },
				{ ip: "127.0.0.1", port },
				{ handshakeTimeoutMs: 3000, feeFilterWaitMs: 200 },
			);
			assert.equal(hsResult.ok, true);

			const entries = await requestAddrs(socket, 3000);

			assert.equal(entries.length, 2);
			assert.equal(entries[0]!.ip, "10.0.0.2");
			assert.equal(entries[0]!.network, "ipv4");
			assert.equal(entries[0]!.services.raw, 9n);
			assert.equal(entries[1]!.network, "tor");
			assert.ok(entries[1]!.ip.endsWith(".onion"));

			socket.destroy();
		} finally {
			await closeMockNode(server);
		}
	});
});
