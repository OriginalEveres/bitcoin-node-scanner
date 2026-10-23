import * as net from "node:net";
import {
	MAINNET_MAGIC,
	HEADER_SIZE,
	COMMAND_VERSION,
	COMMAND_VERACK,
	COMMAND_FEEFILTER,
	COMMAND_GETADDR,
	COMMAND_ADDR,
	COMMAND_SENDADDRV2,
	COMMAND_ADDRV2,
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

/** Raw BIP 155 entry so tests can send any network id, including unknown ones. */
export type MockAddrV2Entry = {
	networkId: number;
	address: Buffer;
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
	/** Sent instead of `addrResponses` once the client has sent `sendaddrv2`. */
	addrV2Responses?: MockAddrV2Entry[];
	/** Called with every command received, in order. */
	onCommand?: (command: string) => void;
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
		let gotSendAddrV2 = false;

		socket.on("data", (chunk) => {
			buf = Buffer.concat([buf, chunk]);

			// Process all complete messages in the buffer
			while (buf.length >= HEADER_SIZE) {
				const header = parseHeader(buf, MAINNET_MAGIC);
				if (!header) break;

				const totalLen = HEADER_SIZE + header.payloadLength;
				if (buf.length < totalLen) break;

				buf = buf.subarray(totalLen);
				opts.onCommand?.(header.command);

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
				} else if (header.command === COMMAND_SENDADDRV2) {
					gotSendAddrV2 = true;
				} else if (
					header.command === COMMAND_GETADDR &&
					gotSendAddrV2 &&
					opts.addrV2Responses
				) {
					socket.write(
						serializeMessage(
							COMMAND_ADDRV2,
							buildAddrV2Payload(opts.addrV2Responses),
							MAINNET_MAGIC,
						),
					);
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

export function buildAddrV2Payload(entries: MockAddrV2Entry[]): Buffer {
	const parts: Buffer[] = [encodeVarInt(entries.length)];

	for (const entry of entries) {
		const time = Buffer.alloc(4);
		time.writeUInt32LE(entry.timestamp ?? Math.floor(Date.now() / 1000), 0);
		const port = Buffer.alloc(2);
		port.writeUInt16BE(entry.port, 0);
		parts.push(
			time,
			encodeVarInt(Number(entry.services ?? 1n)),
			Buffer.from([entry.networkId]),
			encodeVarInt(entry.address.length),
			entry.address,
			port,
		);
	}

	return Buffer.concat(parts);
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
