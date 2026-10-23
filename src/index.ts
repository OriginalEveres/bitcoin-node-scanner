// Result type
export type { Result, Ok, Fail } from "./result.js";
export { ok, fail } from "./result.js";

// Scanner
export { scanNode } from "./scanner/nodeScanner.js";
export type {
	NodeScanResult,
	DiscoverySource,
	ScanError,
	ScanErrorCode,
} from "./scanner/NodeScanResult.js";

// Handshake
export { performHandshake } from "./handshake/handshake.js";
export type { HandshakeResult, HandshakeOptions } from "./handshake/handshake.js";
export type { PeerInfo } from "./handshake/peerInfo.js";

// Protocol value objects
export type { Services } from "./protocol/services.js";
export {
	hasService,
	describeServices,
	NODE_NETWORK,
	NODE_BLOOM,
	NODE_WITNESS,
	NODE_COMPACT_FILTERS,
	NODE_NETWORK_LIMITED,
} from "./protocol/services.js";
export type { FeeFilter } from "./protocol/feefilter.js";
export type { VersionMessage } from "./protocol/version.js";

// Domain types
export type { Node, NetAddr, Network } from "./node.js";

// Crawler
export { crawl, crawlStream } from "./crawler/crawler.js";
export type { CrawlerOptions, CrawlResult, TorOptions } from "./crawler/crawler.js";
export { resolveDnsSeeds } from "./crawler/resolveDnsSeeds.js";
export type { AddrEntry } from "./protocol/addr.js";

// Tor
export { fetchTor } from "./tor/fetchTor.js";
