import type { Services } from "./services.js";
import { encodeVarInt, decodeVarInt } from "./varInt.js";
import { ipToBytes, bytesToIp } from "./ip.js";

export type VersionMessage = {
  protocolVersion: number;
  services: Services;
  timestamp: bigint;
  receiverServices: Services;
  receiverIp: string;
  receiverPort: number;
  senderServices: Services;
  senderIp: string;
  senderPort: number;
  nonce: bigint;
  userAgent: string;
  startHeight: number;
  relay: boolean;
};

function writeNetworkAddress(
  buf: Buffer,
  offset: number,
  services: Services,
  ip: string,
  port: number,
): void {
  buf.writeBigUInt64LE(services.raw, offset);
  ipToBytes(ip).copy(buf, offset + 8);
  buf.writeUInt16BE(port, offset + 24); // port is big-endian
}

export function serializeVersion(msg: VersionMessage): Buffer {
  const userAgentBytes = Buffer.from(msg.userAgent, "utf-8");
  const varIntBytes = encodeVarInt(userAgentBytes.length);

  // Fixed: 4 + 8 + 8 + 26 + 26 + 8 = 80
  // Variable: varInt + userAgent + 4 (startHeight) + 1 (relay)
  const size = 80 + varIntBytes.length + userAgentBytes.length + 4 + 1;
  const buf = Buffer.alloc(size);
  let offset = 0;

  // protocol_version (4 bytes LE)
  buf.writeInt32LE(msg.protocolVersion, offset);
  offset += 4;

  // services (8 bytes LE)
  buf.writeBigUInt64LE(msg.services.raw, offset);
  offset += 8;

  // timestamp (8 bytes LE)
  buf.writeBigInt64LE(msg.timestamp, offset);
  offset += 8;

  // addr_recv (26 bytes: 8 services + 16 ip + 2 port)
  writeNetworkAddress(
    buf,
    offset,
    msg.receiverServices,
    msg.receiverIp,
    msg.receiverPort,
  );
  offset += 26;

  // addr_from (26 bytes)
  writeNetworkAddress(
    buf,
    offset,
    msg.senderServices,
    msg.senderIp,
    msg.senderPort,
  );
  offset += 26;

  // nonce (8 bytes LE)
  buf.writeBigUInt64LE(msg.nonce, offset);
  offset += 8;

  // user_agent (var_str)
  varIntBytes.copy(buf, offset);
  offset += varIntBytes.length;
  userAgentBytes.copy(buf, offset);
  offset += userAgentBytes.length;

  // start_height (4 bytes LE)
  buf.writeInt32LE(msg.startHeight, offset);
  offset += 4;

  // relay (1 byte)
  buf.writeUInt8(msg.relay ? 1 : 0, offset);

  return buf;
}

export function parseVersion(payload: Buffer): VersionMessage {
  let offset = 0;

  const protocolVersion = payload.readInt32LE(offset);
  offset += 4;

  const services: Services = { raw: payload.readBigUInt64LE(offset) };
  offset += 8;

  const timestamp = payload.readBigInt64LE(offset);
  offset += 8;

  // addr_recv
  const receiverServices: Services = {
    raw: payload.readBigUInt64LE(offset),
  };
  offset += 8;
  const receiverIp = bytesToIp(payload, offset);
  offset += 16;
  const receiverPort = payload.readUInt16BE(offset);
  offset += 2;

  // addr_from
  const senderServices: Services = { raw: payload.readBigUInt64LE(offset) };
  offset += 8;
  const senderIp = bytesToIp(payload, offset);
  offset += 16;
  const senderPort = payload.readUInt16BE(offset);
  offset += 2;

  const nonce = payload.readBigUInt64LE(offset);
  offset += 8;

  // user_agent (var_str)
  const { value: uaLen, bytesRead } = decodeVarInt(payload, offset);
  offset += bytesRead;
  const userAgent = payload.subarray(offset, offset + uaLen).toString("utf-8");
  offset += uaLen;

  const startHeight = payload.readInt32LE(offset);
  offset += 4;

  // relay byte is optional (protocol version >= 70001)
  const relay = offset < payload.length ? payload.readUInt8(offset) !== 0 : true;

  return {
    protocolVersion,
    services,
    timestamp,
    receiverServices,
    receiverIp,
    receiverPort,
    senderServices,
    senderIp,
    senderPort,
    nonce,
    userAgent,
    startHeight,
    relay,
  };
}
