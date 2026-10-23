import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fetchTor } from "../fetchTor.js";
import { buildTarGz } from "./tarFixture.js";

const archive = buildTarGz([
	{ name: "tor/", type: "5", mode: 0o700 },
	{ name: "tor/tor", mode: 0o700, data: Buffer.from("#!/bin/sh\n") },
	{ name: "tor/libevent-2.1.7.dylib", mode: 0o700, data: Buffer.from("lib") },
	{ name: "tor/pluggable_transports/lyrebird", mode: 0o700, data: Buffer.from("pt") },
]);
const sha256 = createHash("sha256").update(archive).digest("hex");

function setup(key: string) {
	const vendorDir = fs.mkdtempSync(path.join(os.tmpdir(), "fetch-tor-test-"));
	const signed: string[][] = [];
	const urls: string[] = [];
	const options = {
		vendorDir,
		key,
		bundles: { [key]: { file: "bundle.tar.gz", sha256 } },
		download: async (url: string) => {
			urls.push(url);
			return archive;
		},
		sign: async (files: string[]) => {
			signed.push(files);
		},
	};
	return { vendorDir, signed, urls, options };
}

describe(fetchTor.name, () => {
	it("downloads, verifies, unpacks and signs on macOS", async () => {
		const { vendorDir, signed, urls, options } = setup("darwin-arm64");

		const binary = await fetchTor(options);

		assert.equal(binary, path.join(vendorDir, "darwin-arm64", "tor", "tor"));
		assert.equal(fs.statSync(binary).mode & 0o777, 0o700);
		assert.match(
			urls[0]!,
			/^https:\/\/dist\.torproject\.org\/torbrowser\/[\d.]+\/bundle\.tar\.gz$/,
		);
		assert.deepEqual(signed, [
			[
				path.join(vendorDir, "darwin-arm64", "tor", "libevent-2.1.7.dylib"),
				path.join(vendorDir, "darwin-arm64", "tor", "tor"),
			],
		]);
	});

	it("does not sign on Linux", async () => {
		const { signed, options } = setup("linux-x64");
		await fetchTor(options);
		assert.deepEqual(signed, []);
	});

	it("rejects a checksum mismatch and writes nothing", async () => {
		const { vendorDir, options } = setup("linux-x64");
		options.bundles["linux-x64"]!.sha256 = "0".repeat(64);

		await assert.rejects(fetchTor(options), /Checksum mismatch/);
		assert.deepEqual(fs.readdirSync(vendorDir), []);
	});

	it("rejects an unsupported platform", async () => {
		const { options } = setup("linux-x64");
		await assert.rejects(
			fetchTor({ ...options, key: "freebsd-x64" }),
			/No Tor Expert Bundle for freebsd-x64/,
		);
	});
});
