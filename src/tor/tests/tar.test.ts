import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { extractTarGz, readTar } from "../tar.js";
import { buildTar, buildTarGz } from "./tarFixture.js";

function tmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "tar-test-"));
}

describe(readTar.name, () => {
	it("yields directories and files with their mode and data", () => {
		const entries = [
			...readTar(
				buildTar([
					{ name: "tor/", type: "5", mode: 0o700 },
					{ name: "tor/tor", mode: 0o700, data: Buffer.from("binary") },
					{ name: "data/geoip", data: Buffer.alloc(600, 1) },
				]),
			),
		];

		assert.deepEqual(
			entries.map((e) => [e.name, e.type, e.mode, e.data.length]),
			[
				["tor/", "5", 0o700, 0],
				["tor/tor", "0", 0o700, 6],
				["data/geoip", "0", 0o644, 600],
			],
		);
		assert.equal(entries[1]!.data.toString(), "binary");
	});

	it("stops at the end-of-archive marker", () => {
		assert.deepEqual([...readTar(Buffer.alloc(1024))], []);
	});
});

describe(extractTarGz.name, () => {
	it("writes files with their permission bits", () => {
		const dest = tmpDir();
		extractTarGz(
			buildTarGz([
				{ name: "tor/", type: "5", mode: 0o700 },
				{ name: "tor/tor", mode: 0o700, data: Buffer.from("#!/bin/sh\n") },
				{ name: "tor/lib.dylib", mode: 0o600, data: Buffer.from("lib") },
			]),
			dest,
		);

		assert.equal(fs.readFileSync(path.join(dest, "tor/tor"), "utf8"), "#!/bin/sh\n");
		assert.equal(fs.statSync(path.join(dest, "tor/tor")).mode & 0o777, 0o700);
		assert.equal(fs.statSync(path.join(dest, "tor/lib.dylib")).mode & 0o777, 0o600);
	});

	it("refuses entries that escape the destination", () => {
		const dest = tmpDir();
		assert.throws(
			() => extractTarGz(buildTarGz([{ name: "../escape", data: Buffer.from("x") }]), dest),
			/outside destination/,
		);
		assert.equal(fs.existsSync(path.join(dest, "..", "escape")), false);
	});
});
