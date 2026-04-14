/** Maximum number of simultaneous outbound connections during a crawl. */
export const MAX_CONCURRENT = 50;

/** Upper bound on the total number of unique nodes the crawler will track. */
export const MAX_NODES = 10_000;

/** How many hops of `getaddr` discovery to follow (0 = seeds only, 1 = their peers, etc.). */
export const MAX_DEPTH = 2;

/** How long to wait for an `addr` response after sending `getaddr`. */
export const GETADDR_TIMEOUT_MS = 10_000;

/** How long to wait for a TCP connection to be established. */
export const CONNECT_TIMEOUT_MS = 5_000;

/** How long to wait for the version/verack handshake to complete. */
export const HANDSHAKE_TIMEOUT_MS = 5_000;

/**
 * Maximum number of unread results buffered between the worker pool and the
 * consumer. When exceeded, workers pause until the consumer drains the buffer.
 * This provides backpressure so a slow consumer doesn't cause unbounded memory growth.
 */
export const RESULT_BUFFER_SIZE = 256;

/**
 * How many random IPs to keep queued ahead of the worker pool.
 * The feeder tops up to `maxConcurrent * 2` pending entries.
 */
export const RANDOM_QUEUE_REFILL = 100;
