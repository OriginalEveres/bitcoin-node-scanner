import type * as net from "node:net";
import { MAINNET_MAGIC, COMMAND_GETADDR, COMMAND_ADDR } from "../protocol/constants.js";
import { serializeMessage } from "../protocol/message.js";
import { parseAddr } from "../protocol/addr.js";
import type { AddrEntry } from "../protocol/addr.js";
import { MessageReader } from "../handshake/messageReader.js";

const DEFAULT_GETADDR_TIMEOUT_MS = 10_000;

/**
 * Send `getaddr` on an already-handshaked socket and wait for the `addr` response.
 * Returns parsed address entries, or an empty array on timeout/error.
 */
export function requestAddrs(
	socket: net.Socket,
	timeoutMs = DEFAULT_GETADDR_TIMEOUT_MS,
): Promise<AddrEntry[]> {
	return new Promise((resolve) => {
		if (socket.destroyed) {
			resolve([]);
			return;
		}

		const reader = new MessageReader();
		let settled = false;

		const settle = (entries: AddrEntry[]) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.removeListener("data", onData);
			socket.removeListener("error", onError);
			socket.removeListener("close", onClose);
			resolve(entries);
		};

		const timer = setTimeout(() => settle([]), timeoutMs);

		function onData(chunk: Buffer): void {
			reader.feed(chunk);
			let msg;
			while ((msg = reader.nextMessage())) {
				if (msg.command === COMMAND_ADDR) {
					settle(parseAddr(msg.payload));
					return;
				}
			}
		}

		function onError(): void {
			settle([]);
		}

		function onClose(): void {
			settle([]);
		}

		socket.on("data", onData);
		socket.once("error", onError);
		socket.once("close", onClose);

		// Send getaddr (empty payload)
		const msg = serializeMessage(COMMAND_GETADDR, Buffer.alloc(0), MAINNET_MAGIC);
		socket.write(msg);
	});
}
