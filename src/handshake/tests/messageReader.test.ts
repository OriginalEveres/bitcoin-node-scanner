import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { MessageReader } from "../messageReader.js";
import { serializeMessage } from "../../protocol/message.js";
import { MAINNET_MAGIC } from "../../protocol/constants.js";

/** Helper: build a valid serialized Bitcoin message. */
function makeMessage(
  command: string,
  payload: Buffer = Buffer.alloc(0),
): Buffer {
  return serializeMessage(command, payload, MAINNET_MAGIC);
}

describe(MessageReader.name, () => {
  it("parses a single complete message", () => {
    const reader = new MessageReader();
    const payload = Buffer.from("hello");
    reader.feed(makeMessage("ping", payload));

    const msg = reader.nextMessage();
    assert.ok(msg);
    assert.equal(msg.command, "ping");
    assert.deepEqual(msg.payload, payload);
    assert.equal(reader.nextMessage(), undefined);
  });

  it("parses a message with empty payload", () => {
    const reader = new MessageReader();
    reader.feed(makeMessage("verack"));

    const msg = reader.nextMessage();
    assert.ok(msg);
    assert.equal(msg.command, "verack");
    assert.equal(msg.payload.length, 0);
  });

  it("parses multiple messages fed at once", () => {
    const reader = new MessageReader();
    const msg1 = makeMessage("version", Buffer.from([0x01, 0x02]));
    const msg2 = makeMessage("verack");
    reader.feed(Buffer.concat([msg1, msg2]));

    const parsed1 = reader.nextMessage();
    assert.ok(parsed1);
    assert.equal(parsed1.command, "version");

    const parsed2 = reader.nextMessage();
    assert.ok(parsed2);
    assert.equal(parsed2.command, "verack");

    assert.equal(reader.nextMessage(), undefined);
  });

  it("handles fragmented message across multiple feeds", () => {
    const reader = new MessageReader();
    const raw = makeMessage("ping", Buffer.from("data"));

    // Split at an arbitrary point in the middle
    const half = Math.floor(raw.length / 2);
    reader.feed(raw.subarray(0, half));
    assert.equal(reader.nextMessage(), undefined);

    reader.feed(raw.subarray(half));
    const msg = reader.nextMessage();
    assert.ok(msg);
    assert.equal(msg.command, "ping");
    assert.deepEqual(msg.payload, Buffer.from("data"));
  });

  it("handles byte-by-byte feeding", () => {
    const reader = new MessageReader();
    const raw = makeMessage("addr", Buffer.from([0xab, 0xcd]));

    for (let i = 0; i < raw.length; i++) {
      reader.feed(raw.subarray(i, i + 1));
    }

    const msg = reader.nextMessage();
    assert.ok(msg);
    assert.equal(msg.command, "addr");
    assert.deepEqual(msg.payload, Buffer.from([0xab, 0xcd]));
  });

  it("skips bytes with bad magic", () => {
    const reader = new MessageReader();
    const garbage = Buffer.from([0x00, 0x00, 0x00]);
    const valid = makeMessage("ping");
    reader.feed(Buffer.concat([garbage, valid]));

    // May need multiple nextMessage calls as it skips one byte at a time
    let msg;
    for (let i = 0; i < garbage.length + 1; i++) {
      msg = reader.nextMessage();
      if (msg) break;
    }

    assert.ok(msg);
    assert.equal(msg.command, "ping");
  });

  it("skips message with corrupted checksum", () => {
    const reader = new MessageReader();
    const raw = makeMessage("ping", Buffer.from("test"));

    // Corrupt the checksum (bytes 20-23 in the header)
    raw[20] = raw[20]! ^ 0xff;

    const valid = makeMessage("pong");
    reader.feed(Buffer.concat([raw, valid]));

    // The reader should skip past the corrupted message and find the valid one
    let msg;
    for (let i = 0; i < raw.length + 1; i++) {
      msg = reader.nextMessage();
      if (msg) break;
    }

    assert.ok(msg);
    assert.equal(msg.command, "pong");
  });

  it("returns undefined when buffer is empty", () => {
    const reader = new MessageReader();
    assert.equal(reader.nextMessage(), undefined);
  });

  it("returns undefined when buffer has partial header", () => {
    const reader = new MessageReader();
    reader.feed(MAINNET_MAGIC); // only 4 bytes, header is 24
    assert.equal(reader.nextMessage(), undefined);
  });
});
