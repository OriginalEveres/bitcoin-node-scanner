import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const TOR_VERSION = "15.0.26";

/**
 * Tor Expert Bundles by `${process.platform}-${process.arch}`. Checksums come from
 * https://dist.torproject.org/torbrowser/15.0.26/sha256sums-signed-build.txt.
 * The Tor Project publishes no Linux arm64 bundle.
 */
export const TOR_BUNDLES: Record<string, { file: string; sha256: string }> = {
	"darwin-arm64": {
		file: `tor-expert-bundle-macos-aarch64-${TOR_VERSION}.tar.gz`,
		sha256: "a3febb6179152b0b4f56a0f5cc57bf5cc8ecef7db35e7c3e9d5a044c8158c26c",
	},
	"darwin-x64": {
		file: `tor-expert-bundle-macos-x86_64-${TOR_VERSION}.tar.gz`,
		sha256: "e1ae4d4a734d28bb590839188511deb3cebc26fcbce9df66d01b2c452060fe95",
	},
	"linux-x64": {
		file: `tor-expert-bundle-linux-x86_64-${TOR_VERSION}.tar.gz`,
		sha256: "19cf18726eecb362e0f21d27afa9ea9efe5da928bfdfbb1ceb5fe54519e87f4a",
	},
};

export const VENDOR_DIR = fileURLToPath(new URL("../../vendor/tor/", import.meta.url));

export function platformKey(): string {
	return `${process.platform}-${process.arch}`;
}

export function torBinaryPath(vendorDir = VENDOR_DIR, key = platformKey()): string {
	return path.join(vendorDir, key, "tor", "tor");
}
