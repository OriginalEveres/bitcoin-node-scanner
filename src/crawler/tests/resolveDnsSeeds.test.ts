import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { resolveDnsSeeds } from "../resolveDnsSeeds.js";

describe("resolveDnsSeeds (unit)", () => {
	it("resolves IPv4 and IPv6 addresses from DNS seeds", async () => {
		const addrs = await resolveDnsSeeds({
			resolve4: async () => ["1.2.3.4", "5.6.7.8"],
			resolve6: async () => ["2001:db8::1"],
		});

		// Should have 3 unique addresses (deduplicated across all seeds)
		assert.equal(addrs.length, 3);
		assert.ok(addrs.some((a) => a.ip === "1.2.3.4"));
		assert.ok(addrs.some((a) => a.ip === "5.6.7.8"));
		assert.ok(addrs.some((a) => a.ip === "2001:db8::1"));

		for (const addr of addrs) {
			assert.equal(addr.port, 8333);
		}
	});

	it("handles individual seed failures gracefully", async () => {
		let v4CallCount = 0;
		const addrs = await resolveDnsSeeds({
			resolve4: async () => {
				v4CallCount++;
				if (v4CallCount === 1) return ["10.0.0.1"];
				throw new Error("SERVFAIL");
			},
			resolve6: async () => {
				throw new Error("no AAAA");
			},
		});

		assert.ok(addrs.length >= 1);
		assert.equal(addrs[0]!.ip, "10.0.0.1");
		assert.equal(addrs[0]!.port, 8333);
	});

	it("returns empty array when all seeds fail", async () => {
		const addrs = await resolveDnsSeeds({
			resolve4: async () => {
				throw new Error("SERVFAIL");
			},
			resolve6: async () => {
				throw new Error("SERVFAIL");
			},
		});

		assert.equal(addrs.length, 0);
	});
});

describe("resolveDnsSeeds (integration)", () => {
	it("resolves at least some DNS seeds to IP addresses", async () => {
		const addrs = await resolveDnsSeeds();

		assert.ok(addrs.length > 0, `Expected addresses, got ${addrs.length}`);

		for (const addr of addrs) {
			assert.equal(addr.port, 8333);
		}

		const keys = addrs.map((a) => `${a.ip}:${a.port}`);
		const unique = new Set(keys);
		assert.equal(keys.length, unique.size, "Addresses should be deduplicated");
	});
});
