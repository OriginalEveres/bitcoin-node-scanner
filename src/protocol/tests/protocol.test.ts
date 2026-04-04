import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { encodeVarInt, decodeVarInt } from "../varInt.js";
import {
  hasService,
  describeServices,
  NODE_NETWORK,
  NODE_WITNESS,
  NODE_BLOOM,
  NODE_COMPACT_FILTERS,
  NODE_NETWORK_LIMITED,
} from "../services.js";
import { parseFeeFilter, serializeFeeFilter } from "../feefilter.js";
import {
  computeChecksum,
  serializeMessage,
  parseHeader,
} from "../message.js";
import { serializeVersion, parseVersion } from "../version.js";
import type { VersionMessage } from "../version.js";
import { MAINNET_MAGIC, COMMAND_VERSION, COMMAND_VERACK } from "../constants.js";

describe("varInt", () => {
  const cases: Array<[number, number]> = [
    [0, 1],
    [0xfc, 1],
    [0xfd, 3],
    [0xffff, 3],
    [0x10000, 5],
    [0xffffffff, 5],
  ];

  for (const [value, expectedBytes] of cases) {
    it(`round-trips ${value} in ${expectedBytes} byte(s)`, () => {
      const encoded = encodeVarInt(value);
      assert.equal(encoded.length, expectedBytes);
      const decoded = decodeVarInt(encoded, 0);
      assert.equal(decoded.value, value);
      assert.equal(decoded.bytesRead, expectedBytes);
    });
  }

  it("decodes at a non-zero offset", () => {
    const prefix = Buffer.alloc(5, 0xaa);
    const encoded = encodeVarInt(300);
    const combined = Buffer.concat([prefix, encoded]);
    const decoded = decodeVarInt(combined, 5);
    assert.equal(decoded.value, 300);
  });
});

describe("services", () => {
  it("detects individual service flags", () => {
    const services = { raw: 9n }; // NODE_NETWORK | NODE_WITNESS
    assert.equal(hasService(services, NODE_NETWORK), true);
    assert.equal(hasService(services, NODE_WITNESS), true);
    assert.equal(hasService(services, NODE_BLOOM), false);
  });

  it("describes combined flags", () => {
    const services = { raw: NODE_NETWORK | NODE_WITNESS | NODE_COMPACT_FILTERS };
    const names = describeServices(services);
    assert.deepEqual(names, [
      "NODE_NETWORK",
      "NODE_WITNESS",
      "NODE_COMPACT_FILTERS",
    ]);
  });

  it("returns empty array for no services", () => {
    assert.deepEqual(describeServices({ raw: 0n }), []);
  });
});

describe("feefilter", () => {
  it("round-trips a fee rate", () => {
    const original = { satPerKb: 1000n };
    const serialized = serializeFeeFilter(original);
    assert.equal(serialized.length, 8);
    const parsed = parseFeeFilter(serialized);
    assert.equal(parsed.satPerKb, 1000n);
  });

  it("throws on short payload", () => {
    assert.throws(() => parseFeeFilter(Buffer.alloc(4)), /too short/);
  });
});

describe("message", () => {
  it("computes correct checksum for empty payload", () => {
    const checksum = computeChecksum(Buffer.alloc(0));
    assert.equal(checksum.length, 4);
    // Known: SHA256(SHA256("")) first 4 bytes = 0x5df6e0e2
    assert.deepEqual(checksum, Buffer.from([0x5d, 0xf6, 0xe0, 0xe2]));
  });

  it("round-trips a verack message header", () => {
    const msg = serializeMessage(COMMAND_VERACK, Buffer.alloc(0), MAINNET_MAGIC);
    assert.equal(msg.length, 24); // header only, no payload

    const header = parseHeader(msg, MAINNET_MAGIC);
    assert.ok(header);
    assert.equal(header.command, "verack");
    assert.equal(header.payloadLength, 0);
  });

  it("round-trips a message with payload", () => {
    const payload = Buffer.from("hello");
    const msg = serializeMessage("ping", payload, MAINNET_MAGIC);
    assert.equal(msg.length, 24 + 5);

    const header = parseHeader(msg, MAINNET_MAGIC);
    assert.ok(header);
    assert.equal(header.command, "ping");
    assert.equal(header.payloadLength, 5);

    // Verify checksum
    const expectedChecksum = computeChecksum(payload);
    assert.deepEqual(header.checksum, expectedChecksum);
  });

  it("returns undefined for wrong magic", () => {
    const msg = serializeMessage("ping", Buffer.alloc(0), MAINNET_MAGIC);
    const header = parseHeader(msg, Buffer.from([0x00, 0x00, 0x00, 0x00]));
    assert.equal(header, undefined);
  });

  it("returns undefined for buffer too short", () => {
    assert.equal(parseHeader(Buffer.alloc(10), MAINNET_MAGIC), undefined);
  });
});

describe("version", () => {
  const sampleVersion: VersionMessage = {
    protocolVersion: 70016,
    services: { raw: 9n },
    timestamp: 1700000000n,
    receiverServices: { raw: 1n },
    receiverIp: "192.168.1.1",
    receiverPort: 8333,
    senderServices: { raw: 9n },
    senderIp: "10.0.0.1",
    senderPort: 8333,
    nonce: 12345678n,
    userAgent: "/TestAgent:0.1.0/",
    startHeight: 800000,
    relay: true,
  };

  it("round-trips a version message", () => {
    const serialized = serializeVersion(sampleVersion);
    const parsed = parseVersion(serialized);

    assert.equal(parsed.protocolVersion, sampleVersion.protocolVersion);
    assert.equal(parsed.services.raw, sampleVersion.services.raw);
    assert.equal(parsed.timestamp, sampleVersion.timestamp);
    assert.equal(parsed.receiverIp, sampleVersion.receiverIp);
    assert.equal(parsed.receiverPort, sampleVersion.receiverPort);
    assert.equal(parsed.senderIp, sampleVersion.senderIp);
    assert.equal(parsed.senderPort, sampleVersion.senderPort);
    assert.equal(parsed.nonce, sampleVersion.nonce);
    assert.equal(parsed.userAgent, sampleVersion.userAgent);
    assert.equal(parsed.startHeight, sampleVersion.startHeight);
    assert.equal(parsed.relay, true);
  });

  it("handles relay=false", () => {
    const msg = { ...sampleVersion, relay: false };
    const parsed = parseVersion(serializeVersion(msg));
    assert.equal(parsed.relay, false);
  });

  it("handles empty user agent", () => {
    const msg = { ...sampleVersion, userAgent: "" };
    const parsed = parseVersion(serializeVersion(msg));
    assert.equal(parsed.userAgent, "");
  });

  it("handles long user agent", () => {
    const msg = { ...sampleVersion, userAgent: "/Satoshi:25.0.0/some-extra-info/" };
    const parsed = parseVersion(serializeVersion(msg));
    assert.equal(parsed.userAgent, "/Satoshi:25.0.0/some-extra-info/");
  });

  it("wraps in a full message envelope and parses header", () => {
    const payload = serializeVersion(sampleVersion);
    const fullMsg = serializeMessage(COMMAND_VERSION, payload, MAINNET_MAGIC);

    const header = parseHeader(fullMsg, MAINNET_MAGIC);
    assert.ok(header);
    assert.equal(header.command, "version");
    assert.equal(header.payloadLength, payload.length);

    // Extract payload from full message and parse version
    const extractedPayload = fullMsg.subarray(24, 24 + header.payloadLength);
    const parsed = parseVersion(extractedPayload);
    assert.equal(parsed.userAgent, sampleVersion.userAgent);
  });
});
