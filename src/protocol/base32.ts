const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** RFC 4648 base32, lowercase, unpadded (as used by Tor and I2P addresses). */
export function encodeBase32(data: Buffer): string {
	let bits = 0;
	let value = 0;
	let out = "";

	for (const byte of data) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}

	if (bits > 0) {
		out += ALPHABET[(value << (5 - bits)) & 31];
	}

	return out;
}
