import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { encodeBase32 } from "../base32.js";

describe(encodeBase32.name, () => {
	// RFC 4648 section 10 vectors, lowercased with padding stripped.
	const vectors: [string, string][] = [
		["", ""],
		["f", "my"],
		["fo", "mzxq"],
		["foo", "mzxw6"],
		["foob", "mzxw6yq"],
		["fooba", "mzxw6ytb"],
		["foobar", "mzxw6ytboi"],
	];

	for (const [input, expected] of vectors) {
		it(`encodes ${JSON.stringify(input)} as ${JSON.stringify(expected)}`, () => {
			assert.equal(encodeBase32(Buffer.from(input, "ascii")), expected);
		});
	}

	it("encodes 32 bytes as 52 characters and 35 bytes as 56", () => {
		assert.equal(encodeBase32(Buffer.alloc(32, 0xff)).length, 52);
		assert.equal(encodeBase32(Buffer.alloc(35, 0xff)).length, 56);
		assert.equal(encodeBase32(Buffer.alloc(5, 0xff)), "77777777");
	});
});
