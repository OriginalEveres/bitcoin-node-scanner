import * as dns from "node:dns";
import type { NetAddr } from "../node.js";

const DEFAULT_PORT = 8333;

/**
 * DNS taken from bitcoinc core repo:
 * https://github.com/bitcoin/bitcoin/blob/master/src/kernel/chainparams.cpp
 */
export const DNS_SEEDS: readonly string[] = [
	"seed.bitcoin.sipa.be",
	"dnsseed.bluematt.me",
	"dnsseed.bitcoin.dashjr-list-of-p2p-nodes.us",
	"seed.bitcoinstats.com",
	"seed.bitcoin.jonasschnelli.ch",
	"seed.btc.petertodd.net",
	"seed.bitcoin.sprovoost.nl",
	"dnsseed.emzy.de",
	"seed.bitcoin.wiz.biz",
	"seed.mainnet.achownodes.xyz",
];

type DnsResolvers = {
	resolve4: (seed: string) => Promise<string[]>;
	resolve6: (seed: string) => Promise<string[]>;
};

const defaultResolvers: DnsResolvers = {
	resolve4: (seed) =>
		new Promise<string[]>((resolve, reject) => {
			dns.resolve4(seed, (err, addresses) => {
				if (err) reject(err);
				else resolve(addresses);
			});
		}),
	resolve6: (seed) =>
		new Promise<string[]>((resolve, reject) => {
			dns.resolve6(seed, (err, addresses) => {
				if (err) reject(err);
				else resolve(addresses);
			});
		}),
};

/**
 * Resolve all DNS seeds and return deduplicated NetAddr list.
 * Individual seed failures are silently ignored.
 */
export async function resolveDnsSeeds(
	resolvers: DnsResolvers = defaultResolvers,
): Promise<NetAddr[]> {
	const results = await Promise.allSettled(
		DNS_SEEDS.flatMap((seed) => [resolvers.resolve4(seed), resolvers.resolve6(seed)]),
	);

	const seen = new Set<string>();
	const addrs: NetAddr[] = [];

	for (const result of results) {
		if (result.status !== "fulfilled") continue;
		for (const ip of result.value) {
			const key = `${ip}:${DEFAULT_PORT}`;
			if (seen.has(key)) continue;
			seen.add(key);
			addrs.push({ ip, port: DEFAULT_PORT });
		}
	}

	return addrs;
}
