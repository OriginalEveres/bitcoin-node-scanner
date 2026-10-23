import { gzipSync } from "node:zlib";

export type FixtureEntry = { name: string; mode?: number; type?: "0" | "5"; data?: Buffer };

function octal(value: number, length: number): Buffer {
	return Buffer.from(value.toString(8).padStart(length - 1, "0") + "\0", "ascii");
}

/** Build a minimal ustar archive for tests. */
export function buildTar(entries: FixtureEntry[]): Buffer {
	const blocks: Buffer[] = [];

	for (const entry of entries) {
		const data = entry.data ?? Buffer.alloc(0);
		const header = Buffer.alloc(512);
		header.write(entry.name, 0, "utf8");
		octal(entry.mode ?? (entry.type === "5" ? 0o755 : 0o644), 8).copy(header, 100);
		octal(0, 8).copy(header, 108);
		octal(0, 8).copy(header, 116);
		octal(data.length, 12).copy(header, 124);
		octal(0, 12).copy(header, 136);
		header.write(entry.type ?? "0", 156, "ascii");
		header.write("ustar\0" + "00", 257, "ascii");

		header.fill(" ", 148, 156);
		let sum = 0;
		for (const byte of header) sum += byte;
		header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");

		blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
	}

	blocks.push(Buffer.alloc(1024));
	return Buffer.concat(blocks);
}

export function buildTarGz(entries: FixtureEntry[]): Buffer {
	return gzipSync(buildTar(entries));
}
