export type DiscoverySource = "dns" | "manual" | "addr" | "random" | "bootstrap";

export type ScanErrorCode =
	| "TIMEOUT"
	| "CONNECTION_REFUSED"
	| "UNREACHABLE"
	| "HANDSHAKE_FAILED"
	| "UNKNOWN";

export type ScanError = {
	code: ScanErrorCode;
	message: string;
};

import type { PeerInfo } from "../handshake/peerInfo.js";
import type { NetAddr } from "../node.js";

export type NodeScanResult = NetAddr & {
	source?: DiscoverySource;

	reachable: boolean;
	latencyMs?: number;
	error?: ScanError;
	peerInfo?: PeerInfo;
};
