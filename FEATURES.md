# relaymap.com — Feature List

## Data collected per node

- IP address (IPv4 / IPv6 / Tor)
- Port
- Discovery source (DNS seed, addr gossip, random scan, manual)
- Reachability (up / down)
- Latency (ms)
- Protocol version
- User agent (client software + version)
- Block height
- Service flags (NODE_NETWORK, NODE_BLOOM, NODE_WITNESS, NODE_COMPACT_FILTERS, NODE_NETWORK_LIMITED)
- Relay flag (transaction relay enabled / disabled)
- Fee filter (minimum relay fee in sat/kB)

---

## Dashboard — Network Overview

- Total reachable nodes
- Total unreachable nodes (scanned but failed)
- Network churn since last snapshot (+new / -dropped)
- Current consensus block height
- Percentage of nodes at consensus height

---

## Address Type Distribution

- IPv4 node count + percentage
- IPv6 node count + percentage
- Tor (.onion) node count + percentage (requires Tor support)
- Non-standard port usage count + percentage

---

## Client Version Analysis

- User agent distribution (pie/bar chart)
- Top 10 client versions by node count
- Non-Satoshi clients (btcd, Knots, Libbitcoin, etc.)
- Version age breakdown:
  - Current (< 6 months)
  - Aging (6–12 months)
  - Old (1–2 years)
  - Outdated (> 2 years)
- Upgrade adoption curve after new release (time-series)

---

## Service Flag Breakdown

- NODE_NETWORK (full blockchain) — count + percentage
- NODE_WITNESS (SegWit) — count + percentage
- NODE_BLOOM (BIP37 bloom filters, legacy SPV) — count + percentage
- NODE_COMPACT_FILTERS (BIP157/158, modern light clients) — count + percentage
- NODE_NETWORK_LIMITED (pruned node) — count + percentage
- Full node vs pruned node ratio
- Service flag combinations (e.g. how many have WITNESS + COMPACT_FILTERS but not BLOOM)

---

## Relay & Fee Policy (unique to relaymap)

- Relay enabled vs disabled (blocks-only mode) — count + percentage
- Fee filter distribution:
  - 1 sat/vB (100 sat/kB) — default
  - 10 sat/vB (1000 sat/kB) — elevated
  - Custom values
- Fee filter histogram
- Implications: nodes with high fee filters drop low-fee transactions from mempool relay

---

## Latency Analysis

- Median, mean, p95, p99 latency
- Latency histogram (buckets: <25ms, 25–50ms, 50–100ms, 100–250ms, 250–500ms, 500ms+)
- Latency by discovery source (DNS vs addr vs random)
- Latency by address type (IPv4 vs IPv6)

---

## Block Height Consensus

- Percentage of nodes at the tip (highest observed height)
- Nodes 1–2 blocks behind (normal propagation delay)
- Nodes 3–10 blocks behind (slow sync)
- Nodes 10+ blocks behind (stale / stuck)
- Height distribution histogram

---

## Discovery Source Analysis

- DNS seed vs addr gossip vs random scan breakdown
- Nodes found only via DNS (well-known)
- Nodes found only via addr gossip (less visible)
- Nodes found only via random scan (unlisted)

---

## Geographic Distribution (requires GeoIP)

- Node count by country (top 20 + world map)
- Node count by continent
- Node count by city (top 50)
- Map visualization with lat/lng markers

---

## Network / ASN Analysis (requires GeoIP)

- Top hosting providers by node count (Hetzner, AWS, OVH, DigitalOcean, etc.)
- Residential vs datacenter ratio
- ASN concentration — what percentage of nodes run on the top 3 / top 10 ASNs
- Decentralization score based on ASN diversity

---

## Peer Topology (requires storing getaddr edges)

- Who peers with whom — directed graph
- Most connected nodes (highest peer count from addr responses)
- Network clustering — tightly connected subgroups
- Shortest path between any two nodes
- Single points of failure — nodes whose removal would partition the graph

---

## Historical Trends (requires periodic snapshots)

- Total node count over time
- IPv4 / IPv6 / Tor ratio over time
- Client version adoption curves
- Fee filter distribution changes over time
- Relay flag trends (is blocks-only mode growing?)
- Geographic shifts
- ASN concentration trends
- Latency trends

---

## Individual Node Detail Page

- IP, port, address type
- Current status (up / down)
- User agent + protocol version
- Block height + sync status
- Service flags (human-readable)
- Relay flag
- Fee filter policy
- Latency (current + trend if historical data exists)
- Discovery source
- Geographic location + ASN (with GeoIP)
- Uptime history (with periodic snapshots)
