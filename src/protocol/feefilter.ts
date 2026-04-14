export type FeeFilter = {
	satPerKb: bigint;
};

export function parseFeeFilter(payload: Buffer): FeeFilter {
	if (payload.length < 8) {
		throw new Error(`feefilter payload too short: expected 8 bytes, got ${payload.length}`);
	}
	return { satPerKb: payload.readBigInt64LE(0) };
}

export function serializeFeeFilter(ff: FeeFilter): Buffer {
	const buf = Buffer.alloc(8);
	buf.writeBigInt64LE(ff.satPerKb, 0);
	return buf;
}
