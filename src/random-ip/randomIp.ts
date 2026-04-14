/**
 * Check whether an IPv4 address (given as four octets) is publicly routable.
 * Returns false for private, reserved, loopback, multicast, and other
 * non-routable ranges.
 */
export function isRoutable(a: number, b: number, c: number, d: number): boolean {
	if (a === 0) return false; // 0.0.0.0/8
	if (a === 10) return false; // 10.0.0.0/8
	if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10
	if (a === 127) return false; // 127.0.0.0/8
	if (a === 169 && b === 254) return false; // 169.254.0.0/16
	if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
	if (a === 192 && b === 0 && c === 0) return false; // 192.0.0.0/24
	if (a === 192 && b === 0 && c === 2) return false; // 192.0.2.0/24 (TEST-NET-1)
	if (a === 192 && b === 88 && c === 99) return false; // 192.88.99.0/24
	if (a === 192 && b === 168) return false; // 192.168.0.0/16
	if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15
	if (a === 198 && b === 51 && c === 100) return false; // 198.51.100.0/24 (TEST-NET-2)
	if (a === 203 && b === 0 && c === 113) return false; // 203.0.113.0/24 (TEST-NET-3)
	if (a >= 224) return false; // 224.0.0.0/4 + 240.0.0.0/4
	return true;
}

/**
 * Generate a single random routable public IPv4 address.
 * Uses Math.random() for speed — cryptographic randomness is not needed.
 */
export function generateRandomIp(): string {
	while (true) {
		const a = Math.floor(Math.random() * 256);
		const b = Math.floor(Math.random() * 256);
		const c = Math.floor(Math.random() * 256);
		const d = Math.floor(Math.random() * 256);
		if (isRoutable(a, b, c, d)) {
			return `${a}.${b}.${c}.${d}`;
		}
	}
}
