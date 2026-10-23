export function encodeVarInt(n: number): Buffer {
	if (n < 0xfd) {
		const buf = Buffer.alloc(1);
		buf.writeUInt8(n, 0);
		return buf;
	}
	if (n <= 0xffff) {
		const buf = Buffer.alloc(3);
		buf.writeUInt8(0xfd, 0);
		buf.writeUInt16LE(n, 1);
		return buf;
	}
	if (n <= 0xffffffff) {
		const buf = Buffer.alloc(5);
		buf.writeUInt8(0xfe, 0);
		buf.writeUInt32LE(n, 1);
		return buf;
	}
	const buf = Buffer.alloc(9);
	buf.writeUInt8(0xff, 0);
	buf.writeBigUInt64LE(BigInt(n), 1);
	return buf;
}

export function decodeVarInt(buf: Buffer, offset: number): { value: number; bytesRead: number } {
	const first = buf.readUInt8(offset);

	if (first < 0xfd) {
		return { value: first, bytesRead: 1 };
	}
	if (first === 0xfd) {
		return { value: buf.readUInt16LE(offset + 1), bytesRead: 3 };
	}
	if (first === 0xfe) {
		return { value: buf.readUInt32LE(offset + 1), bytesRead: 5 };
	}
	return { value: Number(buf.readBigUInt64LE(offset + 1)), bytesRead: 9 };
}

/** CompactSize for 64-bit values such as service masks, where `number` would lose precision. */
export function encodeVarIntBigInt(n: bigint): Buffer {
	if (n <= 0xffffffffn) return encodeVarInt(Number(n));
	const buf = Buffer.alloc(9);
	buf.writeUInt8(0xff, 0);
	buf.writeBigUInt64LE(n, 1);
	return buf;
}

export function decodeVarIntBigInt(
	buf: Buffer,
	offset: number,
): { value: bigint; bytesRead: number } {
	if (buf.readUInt8(offset) !== 0xff) {
		const { value, bytesRead } = decodeVarInt(buf, offset);
		return { value: BigInt(value), bytesRead };
	}
	return { value: buf.readBigUInt64LE(offset + 1), bytesRead: 9 };
}
