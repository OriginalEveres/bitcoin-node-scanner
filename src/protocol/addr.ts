import type { NetAddr } from "../node.js";
import type { Services } from "./services.js";
import { bytesToIp } from "./ip.js";
import { decodeVarInt } from "./varInt.js";

export type AddrEntry = NetAddr & {
	timestamp: number;
	services: Services;
};

const ADDR_ENTRY_SIZE = 30; // 4 timestamp + 8 services + 16 ip + 2 port

/**
 * Parse a Bitcoin `addr` message payload.
 * Format: varint count, then count × 30-byte entries.
 */
export function parseAddr(payload: Buffer): AddrEntry[] {
	const { value: count, bytesRead } = decodeVarInt(payload, 0);
	let offset = bytesRead;

	const entries: AddrEntry[] = [];

	for (let i = 0; i < count; i++) {
		if (offset + ADDR_ENTRY_SIZE > payload.length) break;

		const timestamp = payload.readUInt32LE(offset);
		offset += 4;

		const services: Services = { raw: payload.readBigUInt64LE(offset) };
		offset += 8;

		const ip = bytesToIp(payload, offset);
		offset += 16;

		const port = payload.readUInt16BE(offset);
		offset += 2;

		entries.push({ timestamp, services, ip, port });
	}

	return entries;
}
