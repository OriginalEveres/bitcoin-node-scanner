import * as fs from "node:fs";
import * as path from "node:path";
import { gunzipSync } from "node:zlib";

const BLOCK_SIZE = 512;

export type TarEntry = {
	name: string;
	mode: number;
	type: string;
	data: Buffer;
};

function readField(block: Buffer, offset: number, length: number): string {
	const field = block.subarray(offset, offset + length);
	const end = field.indexOf(0);
	return field.subarray(0, end === -1 ? length : end).toString("utf8");
}

function readOctal(block: Buffer, offset: number, length: number): number {
	const text = readField(block, offset, length).trim();
	return text ? parseInt(text, 8) : 0;
}

/** Iterate the entries of an uncompressed ustar archive. */
export function* readTar(tar: Buffer): Generator<TarEntry> {
	let offset = 0;
	while (offset + BLOCK_SIZE <= tar.length) {
		const header = tar.subarray(offset, offset + BLOCK_SIZE);
		if (header.every((byte) => byte === 0)) return;

		const name = readField(header, 0, 100);
		const prefix = readField(header, 345, 155);
		const size = readOctal(header, 124, 12);
		const dataStart = offset + BLOCK_SIZE;

		yield {
			name: prefix ? `${prefix}/${name}` : name,
			mode: readOctal(header, 100, 8),
			type: readField(header, 156, 1) || "0",
			data: tar.subarray(dataStart, dataStart + size),
		};

		offset = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
	}
}

/** Extract regular files and directories from a .tar.gz into `destDir`. */
export function extractTarGz(archive: Buffer, destDir: string): void {
	const root = path.resolve(destDir);

	for (const entry of readTar(gunzipSync(archive))) {
		const target = path.resolve(root, entry.name);
		if (target !== root && !target.startsWith(root + path.sep)) {
			throw new Error(`Refusing to extract outside destination: ${entry.name}`);
		}

		if (entry.type === "5") {
			fs.mkdirSync(target, { recursive: true });
		} else if (entry.type === "0") {
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, entry.data);
			fs.chmodSync(target, entry.mode & 0o777);
		}
	}
}
