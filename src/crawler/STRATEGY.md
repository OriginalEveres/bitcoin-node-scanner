# Crawler Strategy

The crawler discovers and scans Bitcoin nodes by combining multiple address sources, deduplicating them, and feeding them into the existing scanner and handshake pipeline.

## Address Sources

### 1. DNS Seeds

The primary bootstrap method. We query Bitcoin Core's official DNS seed hostnames for A (IPv4) and AAAA (IPv6) records. Each query returns a random subset of recently-seen reachable nodes.

Seed hostnames:

- `seed.bitcoin.sipa.be`
- `dnsseed.bluematt.me`
- `seed.bitcoin.jonasschnelli.ch`
- `seed.btc.petertodd.net`
- `seed.bitcoin.sprovoost.nl`
- `dnsseed.emzy.de`
- `seed.bitcoin.wiz.biz`
- `seed.mainnet.achownodes.xyz`

All resolved IPs use the default Bitcoin mainnet port **8333**. Querying all seeds yields ~100-200 unique addresses. Tagged as `source: "dns"`.

### 2. Recursive `getaddr` Crawling

After completing a handshake with a node, we send a `getaddr` message. The peer responds with up to **1,000** known addresses. We then connect to those addresses and repeat the process.

Constraints to respect:

- A node only responds to the **first** `getaddr` per connection. Subsequent requests are ignored.
- Responses are **cached for ~24 hours** on the remote side. Reconnecting to the same node within that window returns the same set.
- We must deduplicate discovered addresses before queueing them for scanning.

Flow per node: **connect -> handshake -> send getaddr -> collect addr/addrv2 response -> disconnect -> enqueue new addresses**.

Tagged as `source: "addr"`.

### 3. User-Supplied Addresses

The crawler accepts a list of IP addresses (or ip:port pairs) passed in by the user. This supports manual investigation of specific nodes or feeding in addresses from external sources.

Tagged as `source: "manual"`.

## Crawl Flow

```
User-supplied IPs ──┐
DNS seed resolution ─┤
                     ├──> Deduplicated Queue ──> Scanner + Handshake ──> Results
getaddr responses ───┘         ▲                        │
                               │                        │
                               └── new addrs from ──────┘
                                   getaddr responses
```

1. **Seed phase**: Resolve DNS seeds and enqueue all user-supplied IPs.
2. **Scan phase**: Pull addresses from the queue, scan them concurrently (TCP connect + handshake).
3. **Expand phase**: For each successful handshake, send `getaddr` and enqueue any new (unseen) addresses.
4. Repeat steps 2-3 until the queue is empty or a configured limit is reached.

## Concurrency and Limits

- Configurable max concurrent connections.
- Configurable max total nodes to scan (prevents unbounded crawling).
- Configurable max crawl depth (number of recursive getaddr hops from initial seeds).

## Deduplication

All addresses are tracked by `ip:port` in a seen-set. An address is only scanned once per crawl session regardless of how many peers report it.

## Output

Each scanned node produces a `NodeScanResult` containing reachability, latency, and optionally `PeerInfo` (protocol version, user agent, services, fee filter).

## Roadmap

- **Random IP scanning**: Scan random public IPv4 addresses on port 8333 to discover non-advertising nodes. This requires massive parallelism and very short connection timeouts due to the low hit rate (~1 in 200,000 IPs). Will be implemented as a separate address source that feeds into the same queue.
