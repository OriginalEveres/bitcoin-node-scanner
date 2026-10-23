import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as net from "node:net";
import { socks5Connect, Socks5Error } from "../socks5.js";
import { createMockSocks5Server } from "../mockSocks5Server.js";
import { createMockBitcoinNode, closeMockNode } from "../../handshake/mockBitcoinNode.js";
import { performHandshake } from "../../handshake/handshake.js";

const ONION = "pg6mmjiyjmcrsslvykfwnntlaru7p5svn6y2ymmju6nubxndf4pscryd.onion";

describe(socks5Connect.name, () => {
	it("connects through the proxy by hostname and completes a handshake", async () => {
		const node = await createMockBitcoinNode({ behavior: "no-feefilter" });
		const proxy = await createMockSocks5Server({ targetPort: node.port });

		try {
			const socket = await socks5Connect({
				proxyPort: proxy.port,
				host: ONION,
				port: 8333,
				timeoutMs: 2000,
			});
			assert.deepEqual(proxy.requests, [{ host: ONION, port: 8333 }]);

			const result = await performHandshake(
				socket,
				{ ip: "0.0.0.0", port: 0 },
				{ ip: "0.0.0.0", port: 0 },
				{ handshakeTimeoutMs: 2000, feeFilterWaitMs: 50 },
			);
			assert.equal(result.ok, true);
			socket.destroy();
		} finally {
			proxy.server.close();
			await closeMockNode(node.server);
		}
	});

	it("surfaces the SOCKS5 reply code on failure", async () => {
		const proxy = await createMockSocks5Server({ replyCode: 4 });
		try {
			await assert.rejects(
				socks5Connect({ proxyPort: proxy.port, host: ONION, port: 8333, timeoutMs: 2000 }),
				(err: unknown) =>
					err instanceof Socks5Error &&
					err.reply === 4 &&
					/host unreachable/.test(err.message),
			);
		} finally {
			proxy.server.close();
		}
	});

	it("fails when the proxy is not listening", async () => {
		await assert.rejects(
			socks5Connect({ proxyPort: 1, host: ONION, port: 8333, timeoutMs: 2000 }),
			/ECONNREFUSED/,
		);
	});

	it("times out when the proxy never answers", async () => {
		const silent = net.createServer(() => {});
		await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
		const port = (silent.address() as net.AddressInfo).port;
		try {
			await assert.rejects(
				socks5Connect({ proxyPort: port, host: ONION, port: 8333, timeoutMs: 200 }),
				/connect timeout/,
			);
		} finally {
			silent.close();
		}
	});
});
