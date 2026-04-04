import { createHash } from "node:crypto";
import { HEADER_SIZE } from "./constants.js";

export type MessageHeader = {
  command: string;
  payloadLength: number;
  checksum: Buffer;
};

export function computeChecksum(payload: Buffer): Buffer {
  const first = createHash("sha256").update(payload).digest();
  const second = createHash("sha256").update(first).digest();
  return second.subarray(0, 4);
}

export function serializeMessage(
  command: string,
  payload: Buffer,
  magic: Buffer,
): Buffer {
  const header = Buffer.alloc(HEADER_SIZE);

  // Magic (4 bytes)
  magic.copy(header, 0);

  // Command (12 bytes, null-padded)
  const cmdBuf = Buffer.alloc(12);
  Buffer.from(command, "ascii").copy(cmdBuf);
  cmdBuf.copy(header, 4);

  // Payload length (4 bytes LE)
  header.writeUInt32LE(payload.length, 16);

  // Checksum (4 bytes)
  computeChecksum(payload).copy(header, 20);

  return Buffer.concat([header, payload]);
}

export function parseHeader(
  buf: Buffer,
  magic: Buffer,
): MessageHeader | undefined {
  if (buf.length < HEADER_SIZE) {
    return undefined;
  }

  // Validate magic
  if (!buf.subarray(0, 4).equals(magic)) {
    return undefined;
  }

  // Read command (strip null padding)
  const cmdRaw = buf.subarray(4, 16);
  const nullIdx = cmdRaw.indexOf(0);
  const command = cmdRaw
    .subarray(0, nullIdx === -1 ? 12 : nullIdx)
    .toString("ascii");

  const payloadLength = buf.readUInt32LE(16);
  const checksum = Buffer.from(buf.subarray(20, 24));

  return { command, payloadLength, checksum };
}
