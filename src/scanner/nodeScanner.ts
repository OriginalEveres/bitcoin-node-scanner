import * as net from "node:net";
import type {
  NodeScanResult,
  DiscoverySource,
  ScanError,
} from "./NodeScanResult.js";
import type { Node } from "../node.js";
import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_OVERALL_TIMEOUT_MS,
} from "./constants.js";
import { performHandshake } from "../handshake/handshake.js";
import type { HandshakeOptions } from "../handshake/handshake.js";

type NodeAddress = Node & {
  source: DiscoverySource;
};

type ScanNodeParams = {
  address: NodeAddress;
  options: {
    connectTimeoutMs: number;
    overallTimeoutMs: number;
    handshake?: boolean;
    handshakeOptions?: HandshakeOptions;
  };
};

/**
 * Scan a single Bitcoin node:
 * - Try to open a TCP connection and measure latency.
 * - Optionally perform a Bitcoin P2P handshake to collect peer metadata.
 */
export async function scanNode({
  address,
  options,
}: ScanNodeParams): Promise<NodeScanResult> {
  const connectTimeoutMs =
    options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const overallTimeoutMs =
    options.overallTimeoutMs ?? DEFAULT_OVERALL_TIMEOUT_MS;

  const { ip, port, source } = address;

  const start = performance.now();

  return new Promise<NodeScanResult>((resolve) => {
    const socket = new net.Socket();

    let settled = false;

    const settle = (result: NodeScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const overallTimer = setTimeout(() => {
      const error: ScanError = {
        code: "TIMEOUT",
        message: `Overall scan timeout after ${overallTimeoutMs} ms`,
      };
      settle({
        ip,
        port,
        source,
        reachable: false,
        error,
      });
    }, overallTimeoutMs);

    // Connection timeout
    socket.setTimeout(connectTimeoutMs, () => {
      const error: ScanError = {
        code: "TIMEOUT",
        message: `Connect timeout after ${connectTimeoutMs} ms`,
      };
      clearTimeout(overallTimer);
      settle({
        ip,
        port,
        source,
        reachable: false,
        error,
      });
    });

    const onError = (err: NodeJS.ErrnoException) => {
      clearTimeout(overallTimer);

      const error: ScanError = {
        code: mapErrorCode(err),
        message: err.message,
      };

      settle({
        ip,
        port,
        source,
        reachable: false,
        error,
      });
    };

    socket.once("connect", async () => {
      const latencyMs = performance.now() - start;

      // Disable the connect timeout now that we're connected
      socket.setTimeout(0);

      if (!options.handshake) {
        clearTimeout(overallTimer);
        settle({
          ip,
          port,
          source,
          reachable: true,
          latencyMs,
        });
        return;
      }

      // Remove scanNode's error listener — the handshake manages socket errors from here
      socket.removeListener("error", onError);

      // Perform Bitcoin P2P handshake
      const handshakeResult = await performHandshake(
        socket,
        { ip: "0.0.0.0", port: 0 },
        { ip, port },
        options.handshakeOptions,
      );

      clearTimeout(overallTimer);

      if (handshakeResult.ok) {
        settle({
          ip,
          port,
          source,
          reachable: true,
          latencyMs,
          peerInfo: handshakeResult.value,
        });
      } else {
        settle({
          ip,
          port,
          source,
          reachable: true,
          latencyMs,
          error: {
            code: "HANDSHAKE_FAILED",
            message: handshakeResult.error,
          },
        });
      }
    });

    socket.once("error", onError);

    socket.connect(port, ip);
  });
}

function mapErrorCode(err: NodeJS.ErrnoException): ScanError["code"] {
  switch (err.code) {
    case "ECONNREFUSED":
      return "CONNECTION_REFUSED";
    case "ENETUNREACH":
    case "EHOSTUNREACH":
      return "UNREACHABLE";
    default:
      return "UNKNOWN";
  }
}
