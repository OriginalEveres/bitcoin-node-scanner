# bitcoin-node-scanner

Bitcoin node scanner and P2P network crawler. Discovers reachable BTC nodes
via DNS seeds, `addr` gossip, manual seeds, or random IPv4 probing, performs
the `version`/`verack` handshake, and collects per-node metadata (user agent,
protocol version, services, block height, fee filter, latency).

## Requirements

- Node.js >= 22
- [Yarn](https://classic.yarnpkg.com/)

## Install

```bash
git clone https://github.com/OriginalEveres/bitcoin-node-scanner.git
cd bitcoin-node-scanner
yarn install
```

## Quick start

Run a default crawl (DNS seeds + peer discovery):

```bash
yarn crawl
```

Scan a single known node:

```bash
yarn crawl --skip-dns --manual 1.2.3.4 --max-depth 0
```

Probe random IPv4 addresses on port 8333:

```bash
yarn crawl --skip-dns --random 10000 --connect-timeout 1500 --max-concurrent 200
```

Save results as JSON Lines:

```bash
yarn crawl --out results.jsonl
```

See [`src/cli/CLI.md`](./src/cli/CLI.md) for the full CLI reference.

## Use as a library

```ts
import { crawl, scanNode } from "bitcoin-node-scanner";

const result = await scanNode({ ip: "1.2.3.4", port: 8333, source: "manual" });
console.log(result);
```

Exported types and helpers cover handshake, protocol value objects (services,
fee filter, version), the crawler, and DNS seed resolution. See
[`src/index.ts`](./src/index.ts) for the full surface and
[`TERMINOLOGY.md`](./TERMINOLOGY.md) for domain vocabulary.

## Development

```bash
yarn test           # run the test suite
yarn lint           # eslint
yarn format:check   # prettier
yarn type-check     # tsc --noEmit
yarn build          # compile to ./dist
```

## License

[MIT](./LICENSE) © Matej Husak
