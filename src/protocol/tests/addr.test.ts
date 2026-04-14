import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parseAddr } from "../addr.js";
import { ipToBytes } from "../ip.js";
import { encodeVarInt } from "../varInt.js";

function buildAddrPayload(
	entries: { timestamp: number; services: bigint; ip: string; port: number }[],
): Buffer {
	const countBuf = encodeVarInt(entries.length);
	const entryBufs: Buffer[] = [countBuf];

	for (const e of entries) {
		const buf = Buffer.alloc(30);
		buf.writeUInt32LE(e.timestamp, 0);
		buf.writeBigUInt64LE(e.services, 4);
		ipToBytes(e.ip).copy(buf, 12);
		buf.writeUInt16BE(e.port, 28);
		entryBufs.push(buf);
	}

	return Buffer.concat(entryBufs);
}

describe("parseAddr", () => {
	it("parses a single addr entry", () => {
		const payload = buildAddrPayload([
			{ timestamp: 1700000000, services: 9n, ip: "1.2.3.4", port: 8333 },
		]);

		const entries = parseAddr(payload);
		assert.equal(entries.length, 1);
		assert.equal(entries[0]!.ip, "1.2.3.4");
		assert.equal(entries[0]!.port, 8333);
		assert.equal(entries[0]!.timestamp, 1700000000);
		assert.equal(entries[0]!.services.raw, 9n);
	});

	it("parses multiple addr entries", () => {
		const payload = buildAddrPayload([
			{ timestamp: 1700000000, services: 1n, ip: "10.0.0.1", port: 8333 },
			{ timestamp: 1700000001, services: 9n, ip: "10.0.0.2", port: 18333 },
			{ timestamp: 1700000002, services: 0n, ip: "192.168.1.1", port: 8333 },
		]);

		const entries = parseAddr(payload);
		assert.equal(entries.length, 3);
		assert.equal(entries[0]!.ip, "10.0.0.1");
		assert.equal(entries[1]!.ip, "10.0.0.2");
		assert.equal(entries[1]!.port, 18333);
		assert.equal(entries[2]!.ip, "192.168.1.1");
	});

	it("returns empty array for empty payload", () => {
		const payload = encodeVarInt(0);
		const entries = parseAddr(payload);
		assert.equal(entries.length, 0);
	});

	it("handles truncated payload gracefully", () => {
		// Claim 2 entries but only provide 1
		const countBuf = encodeVarInt(2);
		const entryBuf = Buffer.alloc(30);
		entryBuf.writeUInt32LE(1700000000, 0);
		entryBuf.writeBigUInt64LE(1n, 4);
		ipToBytes("1.2.3.4").copy(entryBuf, 12);
		entryBuf.writeUInt16BE(8333, 28);

		const payload = Buffer.concat([countBuf, entryBuf]);
		const entries = parseAddr(payload);
		// Should parse only the 1 complete entry
		assert.equal(entries.length, 1);
		assert.equal(entries[0]!.ip, "1.2.3.4");
	});
});
