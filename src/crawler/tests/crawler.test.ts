import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  createMockBitcoinNode,
  closeMockNode,
} from "../../handshake/mockBitcoinNode.js";
import { crawl, crawlStream } from "../crawler.js";

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
      assert.deepEqual(ports, [port1, port2].sort((a, b) => a - b));
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
});
