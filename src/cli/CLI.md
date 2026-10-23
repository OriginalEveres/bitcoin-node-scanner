# btc-crawl CLI

Discover and scan Bitcoin nodes on the P2P network.

## Usage

```bash
tsx src/cli/crawl.ts [options]
# or, if installed globally:
btc-crawl [options]
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--max-nodes <n>` | Maximum unique nodes to track | 10000 |
| `--max-depth <n>` | Recursive `getaddr` hops (0 = seeds only) | 2 |
| `--max-concurrent <n>` | Simultaneous TCP connections | 50 |
| `--connect-timeout <ms>` | TCP connect timeout | 5000 |
| `--handshake-timeout <ms>` | Version/verack handshake timeout | 5000 |
| `--getaddr-timeout <ms>` | Wait time for `addr`/`addrv2` response | 10000 |
| `--manual <ip[:port]>` | Add a manual seed address (repeatable) | — |
| `--skip-dns` | Skip DNS seed resolution | false |
| `--random <n>` | Probe `n` random public IPv4 addresses on port 8333 | — |
| `--out <path>` | Write results as JSONL to a file (appends) | — |
| `--json` | Output results as a JSON array to stdout | false |
| `--help`, `-h` | Show help | — |

## Examples

### Default crawl (DNS seeds + peer discovery)

```bash
tsx src/cli/crawl.ts
```

### Scan a specific node

```bash
tsx src/cli/crawl.ts --skip-dns --manual 1.2.3.4 --max-depth 0
```

### Crawl with results saved to a file

```bash
tsx src/cli/crawl.ts --out results.jsonl
```

### Random IP scanning with short timeouts

```bash
tsx src/cli/crawl.ts --skip-dns --random 10000 --connect-timeout 1500 --max-concurrent 200
```

### JSON output piped to jq

```bash
tsx src/cli/crawl.ts --json --max-nodes 100 | jq '.[].peerInfo.userAgent'
```

### Combine sources with file output

```bash
tsx src/cli/crawl.ts --manual 1.2.3.4 --random 5000 --out crawl.jsonl
```

## Output

**Default mode** prints reachable nodes with peer info to stdout (tab-separated):

```
1.2.3.4:8333    42ms    850123    /Satoshi:27.0.0/
```

**`--json` mode** writes a JSON array to stdout.

**`--out` mode** writes one JSON object per line (JSONL) to the specified file. The file is opened in append mode, so multiple runs accumulate results.

## Signals

Press `Ctrl+C` to abort gracefully. In-flight connections will complete, then the crawl stops and prints a summary.
