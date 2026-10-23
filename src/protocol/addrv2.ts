import { createHash } from "node:crypto";
import type { Network } from "../node.js";
import type { AddrEntry } from "./addr.js";
import { bytesToIp } from "./ip.js";
import { decodeVarInt } from "./varInt.js";
import { encodeBase32 } from "./base32.js";

const TORV3_VERSION = Buffer.from([3]);

function onionAddress(pubkey: Buffer): string {
	const checksum = createHash("sha3-256")
		.update(".onion checksum")
		.update(pubkey)
		.update(TORV3_VERSION)
		.digest()
		.subarray(0, 2);
	return `${encodeBase32(Buffer.concat([pubkey, checksum, TORV3_VERSION]))}.onion`;
}

type NetworkSpec = {
	network: Network;
	addressLength: number;
	render: (address: Buffer) => string;
};

// BIP 155 network ids. Tor v2 (id 3) is intentionally absent so its entries are dropped.
const NETWORKS: Record<number, NetworkSpec> = {
	1: { network: "ipv4", addressLength: 4, render: (a) => Array.from(a).join(".") },
	2: { network: "ipv6", addressLength: 16, render: (a) => bytesToIp(a, 0) },
	4: { network: "tor", addressLength: 32, render: onionAddress },
	5: { network: "i2p", addressLength: 32, render: (a) => `${encodeBase32(a)}.b32.i2p` },
	6: { network: "cjdns", addressLength: 16, render: (a) => bytesToIp(a, 0) },
};

/**
 * Parse a Bitcoin `addrv2` message payload (BIP 155).
 * Format: varint count, then entries of
 * `u32 time, varint services, u8 network id, varint length, address bytes, u16be port`.
 * Unknown network ids and malformed lengths are skipped; a truncated tail ends the parse.
 */
export function parseAddrV2(payload: Buffer): AddrEntry[] {
	const entries: AddrEntry[] = [];

	try {
		const { value: count, bytesRead } = decodeVarInt(payload, 0);
		let offset = bytesRead;

		for (let i = 0; i < count; i++) {
			const timestamp = payload.readUInt32LE(offset);
			offset += 4;

			const services = decodeVarInt(payload, offset);
			offset += services.bytesRead;

			const networkId = payload.readUInt8(offset);
			offset += 1;

			const length = decodeVarInt(payload, offset);
			offset += length.bytesRead;

			const address = payload.subarray(offset, offset + length.value);
			offset += length.value;

			const port = payload.readUInt16BE(offset);
			offset += 2;

			const spec = NETWORKS[networkId];
			if (!spec || address.length !== spec.addressLength) continue;

			entries.push({
				timestamp,
				services: { raw: BigInt(services.value) },
				ip: spec.render(address),
				port,
				network: spec.network,
			});
		}
	} catch (err) {
		if (!(err instanceof RangeError)) throw err;
	}

	return entries;
}
