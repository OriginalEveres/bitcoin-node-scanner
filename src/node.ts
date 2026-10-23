export type Network = "ipv4" | "ipv6" | "tor" | "i2p" | "cjdns";

export type NetAddr = {
	ip: string;
	port: number;
	/** Set for addresses learned via `addrv2`; undefined means a clearnet IP. */
	network?: Network;
};

export type Node = NetAddr & {
	label?: string;
};
