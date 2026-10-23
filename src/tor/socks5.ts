import * as net from "node:net";

const SOCKS_VERSION = 5;
const NO_AUTH = 0;
const CMD_CONNECT = 1;
const ATYP_IPV4 = 1;
const ATYP_DOMAIN = 3;
const ATYP_IPV6 = 4;

const REPLY_MESSAGES: Record<number, string> = {
	1: "general failure",
	2: "connection not allowed",
	3: "network unreachable",
	4: "host unreachable",
	5: "connection refused",
	6: "TTL expired",
	7: "command not supported",
	8: "address type not supported",
};

export class Socks5Error extends Error {
	constructor(
		message: string,
		readonly reply?: number,
	) {
		super(message);
		this.name = "Socks5Error";
	}
}

export type Socks5ConnectOptions = {
	proxyPort: number;
	proxyHost?: string;
	host: string;
	port: number;
	timeoutMs: number;
};

function boundAddressLength(reply: Buffer): number | undefined {
	switch (reply[3]) {
		case ATYP_IPV4:
			return 4;
		case ATYP_IPV6:
			return 16;
		case ATYP_DOMAIN:
			return reply.length > 4 ? reply[4]! + 1 : undefined;
		default:
			return undefined;
	}
}

/**
 * Open a TCP connection to `host:port` through a SOCKS5 proxy using no
 * authentication and hostname addressing, so `.onion` names are resolved by Tor.
 * Resolves with the socket once the proxy reports success.
 */
export function socks5Connect(options: Socks5ConnectOptions): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const socket = net.connect({
			host: options.proxyHost ?? "127.0.0.1",
			port: options.proxyPort,
		});
		let buffer = Buffer.alloc(0);
		let greeted = false;

		const fail = (err: Error): void => {
			clearTimeout(timer);
			socket.destroy();
			reject(err);
		};

		const timer = setTimeout(() => fail(new Socks5Error("connect timeout")), options.timeoutMs);

		const onClose = (): void => fail(new Socks5Error("proxy closed the connection"));

		const onData = (chunk: Buffer): void => {
			buffer = Buffer.concat([buffer, chunk]);

			if (!greeted) {
				if (buffer.length < 2) return;
				if (buffer[0] !== SOCKS_VERSION || buffer[1] !== NO_AUTH) {
					fail(new Socks5Error(`proxy rejected no-auth method (${buffer[1]})`));
					return;
				}
				greeted = true;
				buffer = buffer.subarray(2);

				const host = Buffer.from(options.host, "ascii");
				const port = Buffer.alloc(2);
				port.writeUInt16BE(options.port, 0);
				socket.write(
					Buffer.concat([
						Buffer.from([SOCKS_VERSION, CMD_CONNECT, 0, ATYP_DOMAIN, host.length]),
						host,
						port,
					]),
				);
			}

			if (buffer.length < 4) return;
			if (buffer[0] !== SOCKS_VERSION) {
				fail(new Socks5Error("malformed SOCKS5 reply"));
				return;
			}
			const reply = buffer[1]!;
			if (reply !== 0) {
				fail(new Socks5Error(`SOCKS5 ${REPLY_MESSAGES[reply] ?? `reply ${reply}`}`, reply));
				return;
			}

			const addressLength = boundAddressLength(buffer);
			if (addressLength === undefined) {
				if (buffer[3] !== ATYP_DOMAIN) fail(new Socks5Error("malformed SOCKS5 reply"));
				return;
			}
			if (buffer.length < 4 + addressLength + 2) return;

			clearTimeout(timer);
			socket.removeListener("data", onData);
			socket.removeListener("error", fail);
			socket.removeListener("close", onClose);
			resolve(socket);
		};

		socket.on("data", onData);
		socket.once("error", fail);
		socket.once("close", onClose);
		socket.once("connect", () => socket.write(Buffer.from([SOCKS_VERSION, 1, NO_AUTH])));
	});
}
