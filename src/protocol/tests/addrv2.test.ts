import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parseAddrV2 } from "../addrv2.js";
import { encodeVarInt } from "../varInt.js";
import { buildAddrV2Payload } from "../../handshake/mockBitcoinNode.js";

// Tor spec (rend-spec-v3) example address and its ed25519 public key.
const TOR_PUBKEY = Buffer.from(
	"79bcc625184b05194975c28b66b66b0469f7f6556fb1ac3189a79b40dda32f1f",
	"hex",
);
const TOR_ONION = "pg6mmjiyjmcrsslvykfwnntlaru7p5svn6y2ymmju6nubxndf4pscryd.onion";

// Bitcoin Core netbase_tests I2P vector.
const I2P_HASH = Buffer.from(
	"a2894dabaec08c0051a481a6dac88b64f98232ae42d4b6fd2fa81952dfe36a87",
	"hex",
);
const I2P_ADDRESS = "ukeu3k5oycgaauneqgtnvselmt4yemvoilkln7jpvamvfx7dnkdq.b32.i2p";

const IPV6 = Buffer.from("20010db8000000000000000000000001", "hex");
const CJDNS = Buffer.from("fc000001000200030004000500060007", "hex");

describe(parseAddrV2.name, () => {
	it("parses every supported network", () => {
		const entries = parseAddrV2(
			buildAddrV2Payload([
				{
					networkId: 1,
					address: Buffer.from([1, 2, 3, 4]),
					port: 8333,
					services: 9n,
					timestamp: 1700000000,
				},
				{ networkId: 2, address: IPV6, port: 8334 },
				{ networkId: 4, address: TOR_PUBKEY, port: 8335 },
				{ networkId: 5, address: I2P_HASH, port: 0 },
				{ networkId: 6, address: CJDNS, port: 8337 },
			]),
		);

		assert.deepEqual(
			entries.map((e) => [e.network, e.ip, e.port]),
			[
				["ipv4", "1.2.3.4", 8333],
				["ipv6", "2001:db8:0:0:0:0:0:1", 8334],
				["tor", TOR_ONION, 8335],
				["i2p", I2P_ADDRESS, 0],
				["cjdns", "fc00:1:2:3:4:5:6:7", 8337],
			],
		);
		assert.equal(entries[0]!.services.raw, 9n);
		assert.equal(entries[0]!.timestamp, 1700000000);
	});

	it("skips Tor v2, unknown network ids and wrong address lengths", () => {
		const entries = parseAddrV2(
			buildAddrV2Payload([
				{ networkId: 3, address: Buffer.alloc(10), port: 8333 },
				{ networkId: 7, address: Buffer.alloc(5), port: 8333 },
				{ networkId: 4, address: Buffer.alloc(31), port: 8333 },
				{ networkId: 1, address: Buffer.from([5, 6, 7, 8]), port: 8333 },
			]),
		);

		assert.deepEqual(
			entries.map((e) => e.ip),
			["5.6.7.8"],
		);
	});

	it("returns the complete entries of a truncated payload", () => {
		const payload = buildAddrV2Payload([
			{ networkId: 1, address: Buffer.from([1, 2, 3, 4]), port: 8333 },
			{ networkId: 4, address: TOR_PUBKEY, port: 8333 },
		]);

		const entries = parseAddrV2(payload.subarray(0, payload.length - 5));
		assert.deepEqual(
			entries.map((e) => e.ip),
			["1.2.3.4"],
		);
	});

	it("returns empty array for an empty payload", () => {
		assert.deepEqual(parseAddrV2(Buffer.alloc(0)), []);
		assert.deepEqual(parseAddrV2(encodeVarInt(0)), []);
	});
});
