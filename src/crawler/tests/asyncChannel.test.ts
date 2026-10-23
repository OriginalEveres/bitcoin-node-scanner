import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { createAsyncChannel } from "../asyncChannel.js";

describe(createAsyncChannel.name, () => {
	it("delivers buffered items before throwing the failure", async () => {
		const channel = createAsyncChannel<number>(8);
		await channel.push(1);
		await channel.push(2);
		channel.fail(new Error("tor died"));

		const received: number[] = [];
		await assert.rejects(async () => {
			for await (const item of channel) received.push(item);
		}, /tor died/);
		assert.deepEqual(received, [1, 2]);
	});
});
