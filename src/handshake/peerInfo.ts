import type { Services } from "../protocol/services.js";
import type { FeeFilter } from "../protocol/feefilter.js";

export type PeerInfo = {
	protocolVersion: number;
	userAgent: string;
	startHeight: number;
	services: Services;
	relay: boolean;
	feeFilter?: FeeFilter;
};
