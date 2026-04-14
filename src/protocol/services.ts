export type Services = {
	raw: bigint;
};

export const NODE_NETWORK = 1n;
export const NODE_BLOOM = 4n;
export const NODE_WITNESS = 8n;
export const NODE_COMPACT_FILTERS = 64n;
export const NODE_NETWORK_LIMITED = 1024n;

const SERVICE_NAMES: ReadonlyArray<readonly [bigint, string]> = [
	[NODE_NETWORK, "NODE_NETWORK"],
	[NODE_BLOOM, "NODE_BLOOM"],
	[NODE_WITNESS, "NODE_WITNESS"],
	[NODE_COMPACT_FILTERS, "NODE_COMPACT_FILTERS"],
	[NODE_NETWORK_LIMITED, "NODE_NETWORK_LIMITED"],
];

export function hasService(services: Services, flag: bigint): boolean {
	return (services.raw & flag) !== 0n;
}

export function describeServices(services: Services): string[] {
	const result: string[] = [];
	for (const [flag, name] of SERVICE_NAMES) {
		if ((services.raw & flag) !== 0n) {
			result.push(name);
		}
	}
	return result;
}
