import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { isRoutable, generateRandomIp } from "../randomIp.js";

describe("isRoutable", () => {
	const nonRoutable: [string, number, number, number, number][] = [
		["0.0.0.0/8", 0, 0, 0, 1],
		["10.0.0.0/8", 10, 1, 2, 3],
		["100.64.0.0/10", 100, 64, 0, 1],
		["100.127.0.0/10", 100, 127, 255, 255],
		["127.0.0.0/8", 127, 0, 0, 1],
		["169.254.0.0/16", 169, 254, 1, 1],
		["172.16.0.0/12", 172, 16, 0, 1],
		["172.31.0.0/12", 172, 31, 255, 255],
		["192.0.0.0/24", 192, 0, 0, 1],
		["192.0.2.0/24 (TEST-NET-1)", 192, 0, 2, 1],
		["192.88.99.0/24", 192, 88, 99, 1],
		["192.168.0.0/16", 192, 168, 1, 1],
		["198.18.0.0/15", 198, 18, 0, 1],
		["198.19.0.0/15", 198, 19, 255, 255],
		["198.51.100.0/24 (TEST-NET-2)", 198, 51, 100, 1],
		["203.0.113.0/24 (TEST-NET-3)", 203, 0, 113, 1],
		["224.0.0.0/4 (multicast)", 224, 0, 0, 1],
		["240.0.0.0/4 (reserved)", 240, 0, 0, 1],
		["255.255.255.255 (broadcast)", 255, 255, 255, 255],
	];

	for (const [label, a, b, c, d] of nonRoutable) {
		it(`rejects ${label} (${a}.${b}.${c}.${d})`, () => {
			assert.equal(isRoutable(a, b, c, d), false);
		});
	}

	const routable: [string, number, number, number, number][] = [
		["8.8.8.8", 8, 8, 8, 8],
		["1.1.1.1", 1, 1, 1, 1],
		["104.16.0.1", 104, 16, 0, 1],
		["185.199.108.1", 185, 199, 108, 1],
		["100.63.255.255 (just below CGN)", 100, 63, 255, 255],
		["100.128.0.0 (just above CGN)", 100, 128, 0, 0],
		["172.15.255.255 (just below private)", 172, 15, 255, 255],
		["172.32.0.0 (just above private)", 172, 32, 0, 0],
		["223.255.255.255 (last before multicast)", 223, 255, 255, 255],
	];

	for (const [label, a, b, c, d] of routable) {
		it(`accepts ${label} (${a}.${b}.${c}.${d})`, () => {
			assert.equal(isRoutable(a, b, c, d), true);
		});
	}
});

describe("generateRandomIp", () => {
	it("returns a valid dotted-quad string", () => {
		const ip = generateRandomIp();
		assert.match(ip, /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
	});

	it("never generates non-routable addresses (10,000 samples)", () => {
		for (let i = 0; i < 10_000; i++) {
			const ip = generateRandomIp();
			const parts = ip.split(".").map(Number);
			assert.equal(
				isRoutable(parts[0]!, parts[1]!, parts[2]!, parts[3]!),
				true,
				`Generated non-routable IP: ${ip}`,
			);
		}
	});

	it("generates diverse IPs (not stuck in a loop)", () => {
		const ips = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ips.add(generateRandomIp());
		}
		assert.ok(ips.size > 90, `Expected diverse IPs, got ${ips.size} unique out of 100`);
	});
});
