import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Write an executable shell script that stands in for the tor binary and return its path. */
export function fakeTor(script: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-tor-"));
	const binary = path.join(dir, "tor");
	fs.writeFileSync(binary, `#!/bin/sh\n${script}\n`, { mode: 0o700 });
	return binary;
}
