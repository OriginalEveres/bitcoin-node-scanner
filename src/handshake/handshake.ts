import type * as net from "node:net";
import {
  MAINNET_MAGIC,
  PROTOCOL_VERSION,
  COMMAND_VERSION,
  COMMAND_VERACK,
  COMMAND_FEEFILTER,
} from "../protocol/constants.js";
import { serializeMessage } from "../protocol/message.js";
import { serializeVersion, parseVersion } from "../protocol/version.js";
import { parseFeeFilter } from "../protocol/feefilter.js";
import type { PeerInfo } from "./peerInfo.js";
import {
  DEFAULT_HANDSHAKE_TIMEOUT_MS,
  FEEFILTER_WAIT_MS,
} from "./constants.js";
import { ok, fail } from "../result.js";
import type { Result } from "../result.js";
import { MessageReader } from "./messageReader.js";
import type { ParsedMessage } from "./messageReader.js";
import type { NetAddr } from "../node.js";

export type HandshakeResult = Result<PeerInfo>;

export type HandshakeOptions = {
  handshakeTimeoutMs?: number;
  feeFilterWaitMs?: number;
};

/**
 * Perform a Bitcoin P2P handshake on an already-connected socket.
 *
 * Flow:
 * 1. Send our version message
 * 2. Receive remote's version message
 * 3. Receive remote's verack
 * 4. Send our verack
 * 5. Optionally wait for feefilter
 */
export function performHandshake(
  socket: net.Socket,
  localAddr: NetAddr,
  remoteAddr: NetAddr,
  options?: HandshakeOptions,
): Promise<HandshakeResult> {
  const handshakeTimeoutMs =
    options?.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
  const feeFilterWaitMs = options?.feeFilterWaitMs ?? FEEFILTER_WAIT_MS;

  return new Promise((resolve) => {
    let settled = false;
    const reader = new MessageReader();

    let gotVersion = false;
    let gotVerack = false;
    let peerInfo: PeerInfo | undefined;
    let feeFilterTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (result: HandshakeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(handshakeTimer);
      if (feeFilterTimer) clearTimeout(feeFilterTimer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
      resolve(result);
    };

    const handshakeTimer = setTimeout(() => {
      settle(fail(`Handshake timeout after ${handshakeTimeoutMs}ms`));
    }, handshakeTimeoutMs);

    function processMessages(): void {
      let msg: ParsedMessage | undefined;
      while ((msg = reader.nextMessage())) {
        handleMessage(msg);
        if (settled) return;
      }
    }

    function handleMessage(msg: ParsedMessage): void {
      if (msg.command === COMMAND_VERSION && !gotVersion) {
        gotVersion = true;
        const version = parseVersion(msg.payload);

        peerInfo = {
          protocolVersion: version.protocolVersion,
          userAgent: version.userAgent,
          startHeight: version.startHeight,
          services: version.services,
          relay: version.relay,
        };

        // Send our verack in response to their version
        const verackMsg = serializeMessage(
          COMMAND_VERACK,
          Buffer.alloc(0),
          MAINNET_MAGIC,
        );
        socket.write(verackMsg);

        checkComplete();
      } else if (msg.command === COMMAND_VERACK && !gotVerack) {
        gotVerack = true;
        checkComplete();
      } else if (msg.command === COMMAND_FEEFILTER && peerInfo) {
        peerInfo = { ...peerInfo, feeFilter: parseFeeFilter(msg.payload) };
        // Got feefilter, we're fully done
        if (feeFilterTimer) clearTimeout(feeFilterTimer);
        settle(ok(peerInfo));
      }
    }

    function checkComplete(): void {
      if (gotVersion && gotVerack && peerInfo) {
        // Handshake complete — wait briefly for optional feefilter
        feeFilterTimer = setTimeout(() => {
          // No feefilter arrived, settle with what we have
          settle(ok(peerInfo!));
        }, feeFilterWaitMs);
      }
    }

    function onData(chunk: Buffer): void {
      reader.feed(chunk);
      processMessages();
    }

    function onError(err: Error): void {
      settle(fail(`Socket error during handshake: ${err.message}`));
    }

    function onClose(): void {
      settle(fail("Socket closed during handshake"));
    }

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);

    // Send our version message
    const now = BigInt(Math.floor(Date.now() / 1000));
    const nonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

    const versionPayload = serializeVersion({
      protocolVersion: PROTOCOL_VERSION,
      services: { raw: 0n }, // We don't serve anything
      timestamp: now,
      receiverServices: { raw: 1n },
      receiverIp: remoteAddr.ip,
      receiverPort: remoteAddr.port,
      senderServices: { raw: 0n },
      senderIp: localAddr.ip,
      senderPort: localAddr.port,
      nonce,
      userAgent: "/bitcoin-node-scanner:0.1.0/",
      startHeight: 0,
      relay: false,
    });

    const versionMsg = serializeMessage(
      COMMAND_VERSION,
      versionPayload,
      MAINNET_MAGIC,
    );
    socket.write(versionMsg);
  });
}
