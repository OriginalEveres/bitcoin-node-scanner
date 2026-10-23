import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { startTor } from "../torProcess.js";
import { fakeTor } from "./fakeTor.js";

const BOOTSTRAP_OK = [
	'echo "Oct 24 00:00:00.000 [notice] Opening Socks listener on 127.0.0.1:0"',
	'echo "Oct 24 00:00:00.000 [notice] Socks listener listening on port 46123."',
	'echo "Oct 24 00:00:00.000 [notice] Bootstrapped 5% (conn): Connecting to a relay"',
	'echo "Oct 24 00:00:01.000 [notice] Bootstrapped 100% (done): Done"',
	"sleep 30",
].join("\n");

describe(startTor.name, () => {
	it("resolves the SOCKS port once bootstrapped and stops the process", async () => {
		const tor = startTor({ binary: fakeTor(BOOTSTRAP_OK) });
		assert.equal(await tor.ready, 46123);
		await tor.stop();
	});

	it("passes a data directory and automatic SOCKS port", async () => {
		const binary = fakeTor(`echo "$@" > "$(dirname "$0")/args"\n${BOOTSTRAP_OK}`);
		const tor = startTor({ binary });
		await tor.ready;
		await tor.stop();

		const args = fs.readFileSync(path.join(path.dirname(binary), "args"), "utf8");
		assert.match(args, /--DataDirectory \S+btc-crawl-tor-/);
		assert.match(args, /--SocksPort auto/);
	});

	it("rejects with recent output when tor exits before bootstrapping", async () => {
		const tor = startTor({
			binary: fakeTor('echo "[warn] Could not bind to 127.0.0.1:9050"\nexit 1'),
		});
		await assert.rejects(tor.ready, /exited before bootstrap \(1\)[\s\S]*Could not bind/);
	});

	it("rejects and kills tor when bootstrap times out", async () => {
		const tor = startTor({
			binary: fakeTor('echo "Socks listener listening on port 1."\nsleep 30'),
			bootstrapTimeoutMs: 200,
		});
		await assert.rejects(tor.ready, /did not bootstrap within 200ms/);
	});

	it("throws immediately when the binary is missing", () => {
		assert.throws(
			() => startTor({ binary: "/nonexistent/tor" }),
			/Tor binary not found[\s\S]*yarn fetch-tor/,
		);
	});
});
