export function ipToBytes(ip: string): Buffer {
	// IPv4-mapped IPv6: ::ffff:a.b.c.d
	const buf = Buffer.alloc(16);
	const parts = ip.split(".");
	if (parts.length === 4) {
		// IPv4 → mapped IPv6
		buf[10] = 0xff;
		buf[11] = 0xff;
		buf[12] = parseInt(parts[0]!, 10);
		buf[13] = parseInt(parts[1]!, 10);
		buf[14] = parseInt(parts[2]!, 10);
		buf[15] = parseInt(parts[3]!, 10);
	}
	return buf;
}

export function bytesToIp(buf: Buffer, offset: number): string {
	// Check for IPv4-mapped IPv6
	const isV4Mapped =
		buf.readBigUInt64LE(offset) === 0n &&
		buf.readUInt16LE(offset + 8) === 0 &&
		buf.readUInt16BE(offset + 10) === 0xffff;

	if (isV4Mapped) {
		return `${buf[offset + 12]}.${buf[offset + 13]}.${buf[offset + 14]}.${buf[offset + 15]}`;
	}

	// Full IPv6
	const parts: string[] = [];
	for (let i = 0; i < 16; i += 2) {
		parts.push(buf.readUInt16BE(offset + i).toString(16));
	}
	return parts.join(":");
}
