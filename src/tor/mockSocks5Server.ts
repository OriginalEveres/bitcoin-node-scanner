import * as net from "node:net";

export type MockSocks5Options = {
	/** Where CONNECT requests are forwarded, regardless of the requested host. */
	targetPort?: number;
	/** When set, every CONNECT is answered with this SOCKS5 reply code instead. */
	replyCode?: number;
};

export type MockSocks5Request = { host: string; port: number };

/**
 * Minimal SOCKS5 server for tests: accepts the no-auth method, records each
 * CONNECT request and pipes the client to `targetPort` (or fails with `replyCode`).
 */
export async function createMockSocks5Server(
	opts: MockSocks5Options = {},
): Promise<{ server: net.Server; port: number; requests: MockSocks5Request[] }> {
	const requests: MockSocks5Request[] = [];

	const server = net.createServer((client) => {
		let buf = Buffer.alloc(0);
		let greeted = false;

		const onData = (chunk: Buffer): void => {
			buf = Buffer.concat([buf, chunk]);

			if (!greeted) {
				if (buf.length < 2 || buf.length < 2 + buf[1]!) return;
				buf = buf.subarray(2 + buf[1]!);
				greeted = true;
				client.write(Buffer.from([5, 0]));
			}

			if (buf.length < 5) return;
			const atyp = buf[3];
			const hostLength = atyp === 1 ? 4 : atyp === 4 ? 16 : buf[4]! + 1;
			const total = 4 + hostLength + 2;
			if (buf.length < total) return;

			const hostBytes = buf.subarray(4, 4 + hostLength);
			const host =
				atyp === 1
					? Array.from(hostBytes).join(".")
					: atyp === 4
						? hostBytes.toString("hex")
						: hostBytes.subarray(1).toString("ascii");
			const port = buf.readUInt16BE(4 + hostLength);
			requests.push({ host, port });

			const rest = buf.subarray(total);
			client.removeListener("data", onData);

			if (opts.replyCode !== undefined || opts.targetPort === undefined) {
				client.end(Buffer.from([5, opts.replyCode ?? 1, 0, 1, 0, 0, 0, 0, 0, 0]));
				return;
			}

			const target = net.connect({ host: "127.0.0.1", port: opts.targetPort }, () => {
				client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
				if (rest.length > 0) target.write(rest);
				client.pipe(target).pipe(client);
			});
			target.on("error", () => client.destroy());
			client.on("error", () => target.destroy());
		};

		client.on("data", onData);
		client.on("error", () => {});
	});

	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as net.AddressInfo;
			resolve({ server, port: addr.port, requests });
		});
	});
}
