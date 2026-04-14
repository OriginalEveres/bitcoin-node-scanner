import * as net from "node:net";
import {
	MAINNET_MAGIC,
	HEADER_SIZE,
	COMMAND_VERSION,
	COMMAND_VERACK,
	COMMAND_FEEFILTER,
	COMMAND_GETADDR,
	COMMAND_ADDR,
} from "../protocol/constants.js";
import { serializeMessage, parseHeader } from "../protocol/message.js";
import { serializeVersion } from "../protocol/version.js";
import { serializeFeeFilter } from "../protocol/feefilter.js";
import { ipToBytes } from "../protocol/ip.js";
import { encodeVarInt } from "../protocol/varInt.js";

export type MockBehavior = "normal" | "no-verack" | "no-feefilter" | "silent" | "fragmented";

export type MockAddrEntry = {
	ip: string;
	port: number;
	services?: bigint;
	timestamp?: number;
};

export type MockNodeOptions = {
	behavior: MockBehavior;
	protocolVersion?: number;
	userAgent?: string;
	startHeight?: number;
	services?: bigint;
	feeFilterSatPerKb?: bigint;
	addrResponses?: MockAddrEntry[];
};

/**
 * Creates a TCP server that simulates a Bitcoin node for testing.
 * Returns the server and the port it's listening on.
 */
export async function createMockBitcoinNode(
	opts: MockNodeOptions,
): Promise<{ server: net.Server; port: number }> {
	const server = net.createServer((socket) => {
		let buf = Buffer.alloc(0);

		socket.on("data", (chunk) => {
			buf = Buffer.concat([buf, chunk]);

			// Process all complete messages in the buffer
			while (buf.length >= HEADER_SIZE) {
				const header = parseHeader(buf, MAINNET_MAGIC);
				if (!header) break;

				const totalLen = HEADER_SIZE + header.payloadLength;
				if (buf.length < totalLen) break;

				const payload = buf.subarray(HEADER_SIZE, totalLen);
				buf = buf.subarray(totalLen);

				if (header.command === COMMAND_VERSION) {
					if (opts.behavior === "silent") return;

					// Send our version response
					const versionPayload = serializeVersion({
						protocolVersion: opts.protocolVersion ?? 70016,
						services: { raw: opts.services ?? 9n },
						timestamp: BigInt(Math.floor(Date.now() / 1000)),
						receiverServices: { raw: 0n },
						receiverIp: "127.0.0.1",
						receiverPort: 0,
						senderServices: { raw: opts.services ?? 9n },
						senderIp: "127.0.0.1",
						senderPort: 0,
						nonce: 99999n,
						userAgent: opts.userAgent ?? "/MockNode:1.0.0/",
						startHeight: opts.startHeight ?? 850000,
						relay: true,
					});

					const versionMsg = serializeMessage(
						COMMAND_VERSION,
						versionPayload,
						MAINNET_MAGIC,
					);
					const verackMsg = serializeMessage(
						COMMAND_VERACK,
						Buffer.alloc(0),
						MAINNET_MAGIC,
					);

					if (opts.behavior === "fragmented") {
						// Send version in small chunks
						const allData = Buffer.concat([
							versionMsg,
							...(opts.behavior === "fragmented" ? [verackMsg] : []),
						]);
						sendFragmented(socket, allData);
					} else {
						socket.write(versionMsg);

						if (opts.behavior !== "no-verack") {
							socket.write(verackMsg);
						}
					}

					// Send feefilter if applicable
					if (
						opts.behavior !== "no-verack" &&
						opts.behavior !== "no-feefilter" &&
						opts.behavior !== "fragmented"
					) {
						const feePayload = serializeFeeFilter({
							satPerKb: opts.feeFilterSatPerKb ?? 1000n,
						});
						const feeMsg = serializeMessage(
							COMMAND_FEEFILTER,
							feePayload,
							MAINNET_MAGIC,
						);
						// Small delay to simulate real-world timing
						setTimeout(() => {
							if (!socket.destroyed) {
								socket.write(feeMsg);
							}
						}, 50);
					}
				} else if (header.command === COMMAND_GETADDR && opts.addrResponses) {
					const entries = opts.addrResponses;
					const countBuf = encodeVarInt(entries.length);
					const entryBufs: Buffer[] = [countBuf];

					for (const entry of entries) {
						const entryBuf = Buffer.alloc(30);
						// timestamp (4 bytes LE)
						entryBuf.writeUInt32LE(entry.timestamp ?? Math.floor(Date.now() / 1000), 0);
						// services (8 bytes LE)
						entryBuf.writeBigUInt64LE(entry.services ?? 1n, 4);
						// ip (16 bytes)
						ipToBytes(entry.ip).copy(entryBuf, 12);
						// port (2 bytes BE)
						entryBuf.writeUInt16BE(entry.port, 28);
						entryBufs.push(entryBuf);
					}

					const addrPayload = Buffer.concat(entryBufs);
					const addrMsg = serializeMessage(COMMAND_ADDR, addrPayload, MAINNET_MAGIC);
					socket.write(addrMsg);
				}
			}
		});

		socket.on("error", () => {
			// Ignore errors in mock
		});
	});

	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as net.AddressInfo;
			resolve({ server, port: addr.port });
		});
	});
}

function sendFragmented(socket: net.Socket, data: Buffer): void {
	// Send in 10-byte chunks with small delays
	let offset = 0;
	const sendNext = () => {
		if (offset >= data.length || socket.destroyed) return;
		const end = Math.min(offset + 10, data.length);
		socket.write(data.subarray(offset, end));
		offset = end;
		if (offset < data.length) {
			setTimeout(sendNext, 5);
		}
	};
	sendNext();
}

export function closeMockNode(server: net.Server): Promise<void> {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}
