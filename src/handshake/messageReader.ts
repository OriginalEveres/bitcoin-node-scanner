import { MAINNET_MAGIC, HEADER_SIZE } from "../protocol/constants.js";
import { parseHeader, computeChecksum } from "../protocol/message.js";

export type ParsedMessage = {
  command: string;
  payload: Buffer;
};

/**
 * Buffer accumulator that handles TCP stream framing.
 * Messages may arrive fragmented across multiple chunks or
 * multiple messages may arrive in a single chunk.
 */
export class MessageReader {
  private buf = Buffer.alloc(0);

  feed(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
  }

  nextMessage(): ParsedMessage | undefined {
    // Need at least a header
    if (this.buf.length < HEADER_SIZE) {
      return undefined;
    }

    const header = parseHeader(this.buf, MAINNET_MAGIC);
    if (!header) {
      // Bad magic — skip one byte and try again
      this.buf = this.buf.subarray(1);
      return undefined;
    }

    const totalLen = HEADER_SIZE + header.payloadLength;
    if (this.buf.length < totalLen) {
      // Incomplete message, wait for more data
      return undefined;
    }

    const payload = Buffer.from(this.buf.subarray(HEADER_SIZE, totalLen));

    // Validate checksum
    const expectedChecksum = computeChecksum(payload);
    if (!header.checksum.equals(expectedChecksum)) {
      // Bad checksum — skip this header and try again
      this.buf = this.buf.subarray(1);
      return undefined;
    }

    // Consume the message from the buffer
    this.buf = this.buf.subarray(totalLen);

    return { command: header.command, payload };
  }
}
