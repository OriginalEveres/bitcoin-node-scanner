/**
 * Bounded async channel with backpressure.
 *
 * Producers call {@link push} to enqueue items — if the buffer is full they
 * suspend until the consumer drains a slot. The consumer iterates with
 * `for await...of`. Call {@link close} when no more items will be produced.
 */
export type AsyncChannel<T> = {
	push: (item: T) => Promise<void>;
	close: () => void;
	[Symbol.asyncIterator](): AsyncIterableIterator<T>;
};

export function createAsyncChannel<T>(capacity: number, signal?: AbortSignal): AsyncChannel<T> {
	const buffer: T[] = [];
	const drainWaiters: (() => void)[] = [];
	let consumerWaiter: (() => void) | null = null;
	let closed = false;
	let aborted = false;

	function wakeConsumer(): void {
		if (consumerWaiter) {
			const w = consumerWaiter;
			consumerWaiter = null;
			w();
		}
	}

	function wakeProducers(): void {
		while (drainWaiters.length > 0) {
			drainWaiters.shift()!();
		}
	}

	if (signal) {
		if (signal.aborted) {
			aborted = true;
		} else {
			signal.addEventListener(
				"abort",
				() => {
					aborted = true;
					wakeConsumer();
					wakeProducers();
				},
				{ once: true },
			);
		}
	}

	async function push(item: T): Promise<void> {
		while (buffer.length >= capacity && !aborted) {
			await new Promise<void>((resolve) => drainWaiters.push(resolve));
		}
		if (aborted) return;
		buffer.push(item);
		wakeConsumer();
	}

	function close(): void {
		closed = true;
		wakeConsumer();
	}

	async function* iterate(): AsyncIterableIterator<T> {
		while (true) {
			if (buffer.length > 0) {
				const item = buffer.shift()!;
				if (drainWaiters.length > 0) drainWaiters.shift()!();
				yield item;
				continue;
			}
			if (closed || aborted) {
				while (buffer.length > 0) yield buffer.shift()!;
				return;
			}
			await new Promise<void>((resolve) => {
				consumerWaiter = resolve;
			});
		}
	}

	return {
		push,
		close,
		[Symbol.asyncIterator]() {
			return iterate();
		},
	};
}
