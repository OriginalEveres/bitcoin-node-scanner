import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as net from "node:net";
import { performHandshake } from "../handshake.js";
import { createMockBitcoinNode, closeMockNode } from "../mockBitcoinNode.js";

function connectTo(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

describe(performHandshake.name, () => {
  it("completes handshake and collects peerInfo with feefilter", async () => {
    const { server, port } = await createMockBitcoinNode({
      behavior: "normal",
      userAgent: "/Satoshi:25.0.0/",
      startHeight: 850000,
      services: 9n,
      feeFilterSatPerKb: 1000n,
    });

    try {
      const socket = await connectTo(port);
      const result = await performHandshake(
        socket,
        { ip: "127.0.0.1", port: 0 },
        { ip: "127.0.0.1", port },
        { handshakeTimeoutMs: 3000, feeFilterWaitMs: 1000 },
      );

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.value.userAgent, "/Satoshi:25.0.0/");
        assert.equal(result.value.startHeight, 850000);
        assert.equal(result.value.services.raw, 9n);
        assert.equal(result.value.protocolVersion, 70016);
        assert.equal(result.value.relay, true);
        assert.ok(result.value.feeFilter);
        assert.equal(result.value.feeFilter.satPerKb, 1000n);
      }

      socket.destroy();
    } finally {
      await closeMockNode(server);
    }
  });

  it("completes handshake without feefilter", async () => {
    const { server, port } = await createMockBitcoinNode({
      behavior: "no-feefilter",
    });

    try {
      const socket = await connectTo(port);
      const result = await performHandshake(
        socket,
        { ip: "127.0.0.1", port: 0 },
        { ip: "127.0.0.1", port },
        { handshakeTimeoutMs: 3000, feeFilterWaitMs: 200 },
      );

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.value.feeFilter, undefined);
        assert.equal(result.value.userAgent, "/MockNode:1.0.0/");
      }

      socket.destroy();
    } finally {
      await closeMockNode(server);
    }
  });

  it("times out when remote never responds", async () => {
    const { server, port } = await createMockBitcoinNode({
      behavior: "silent",
    });

    try {
      const socket = await connectTo(port);
      const result = await performHandshake(
        socket,
        { ip: "127.0.0.1", port: 0 },
        { ip: "127.0.0.1", port },
        { handshakeTimeoutMs: 300 },
      );

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.includes("timeout"), result.error);
      }

      socket.destroy();
    } finally {
      await closeMockNode(server);
    }
  });

  it("fails when remote sends version but no verack", async () => {
    const { server, port } = await createMockBitcoinNode({
      behavior: "no-verack",
    });

    try {
      const socket = await connectTo(port);
      const result = await performHandshake(
        socket,
        { ip: "127.0.0.1", port: 0 },
        { ip: "127.0.0.1", port },
        { handshakeTimeoutMs: 500 },
      );

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.includes("timeout"), result.error);
      }

      socket.destroy();
    } finally {
      await closeMockNode(server);
    }
  });

  it("handles fragmented TCP messages", async () => {
    const { server, port } = await createMockBitcoinNode({
      behavior: "fragmented",
      userAgent: "/FragTest:0.1/",
    });

    try {
      const socket = await connectTo(port);
      const result = await performHandshake(
        socket,
        { ip: "127.0.0.1", port: 0 },
        { ip: "127.0.0.1", port },
        { handshakeTimeoutMs: 3000, feeFilterWaitMs: 500 },
      );

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.value.userAgent, "/FragTest:0.1/");
      }

      socket.destroy();
    } finally {
      await closeMockNode(server);
    }
  });

  it("fails when socket is closed during handshake", async () => {
    const server = net.createServer((socket) => {
      // Close immediately without responding
      socket.destroy();
    });

    const port = await new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve((server.address() as net.AddressInfo).port);
      });
    });

    try {
      const socket = await connectTo(port);
      const result = await performHandshake(
        socket,
        { ip: "127.0.0.1", port: 0 },
        { ip: "127.0.0.1", port },
        { handshakeTimeoutMs: 2000 },
      );

      assert.equal(result.ok, false);

      socket.destroy();
    } finally {
      await closeMockNode(server);
    }
  });
});
