#!/usr/bin/env node
import { parseArgs } from "node:util";
import { crawlStream } from "../crawler/crawler.js";
import type { CrawlerOptions } from "../crawler/crawler.js";
import type { NetAddr } from "../node.js";

function parseManual(values: string[] | undefined): NetAddr[] {
  if (!values) return [];
  return values.map((v) => {
    const [ip, portStr] = v.split(":");
    if (!ip) throw new Error(`Invalid --manual value: ${v}`);
    const port = portStr ? parseInt(portStr, 10) : 8333;
    return { ip, port };
  });
}

function printHelp(): void {
  console.log(`Usage: crawl [options]

Options:
  --max-nodes <n>         Maximum unique nodes to track (default: 10000)
  --max-depth <n>         getaddr recursion depth (default: 2)
  --max-concurrent <n>    Concurrent connections (default: 50)
  --connect-timeout <ms>  TCP connect timeout (default: 5000)
  --handshake-timeout <ms>  Handshake timeout (default: 5000)
  --getaddr-timeout <ms>  getaddr response timeout (default: 10000)
  --manual <ip[:port]>    Add a manual seed (repeatable)
  --skip-dns              Skip DNS seed resolution
  --json                  Output results as JSON
  --help, -h              Show this help
`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "max-nodes": { type: "string" },
      "max-depth": { type: "string" },
      "max-concurrent": { type: "string" },
      "connect-timeout": { type: "string" },
      "handshake-timeout": { type: "string" },
      "getaddr-timeout": { type: "string" },
      manual: { type: "string", multiple: true },
      "skip-dns": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    return;
  }

  const opts: CrawlerOptions = { manualAddresses: parseManual(values.manual) };
  if (values["max-nodes"]) opts.maxNodes = parseInt(values["max-nodes"], 10);
  if (values["max-depth"]) opts.maxDepth = parseInt(values["max-depth"], 10);
  if (values["max-concurrent"])
    opts.maxConcurrent = parseInt(values["max-concurrent"], 10);
  if (values["connect-timeout"])
    opts.connectTimeoutMs = parseInt(values["connect-timeout"], 10);
  if (values["handshake-timeout"])
    opts.handshakeTimeoutMs = parseInt(values["handshake-timeout"], 10);
  if (values["getaddr-timeout"])
    opts.getaddrTimeoutMs = parseInt(values["getaddr-timeout"], 10);
  if (values["skip-dns"]) opts.skipDnsSeeds = true;

  // Allow Ctrl+C to abort gracefully
  const abortController = new AbortController();
  process.on("SIGINT", () => {
    console.error("\nAborting crawl...");
    abortController.abort();
  });

  console.error("Starting crawl...");
  const start = Date.now();

  let scanned = 0;
  let reachableCount = 0;

  const { results: stream } = crawlStream({ ...opts, signal: abortController.signal });

  if (values.json) {
    process.stdout.write("[\n");
    let first = true;
    for await (const r of stream) {
      scanned++;
      if (r.reachable && r.peerInfo) reachableCount++;
      const json = JSON.stringify(r, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      );
      process.stdout.write((first ? "" : ",\n") + "  " + json);
      first = false;
    }
    process.stdout.write("\n]\n");
  } else {
    for await (const r of stream) {
      scanned++;
      if (r.reachable && r.peerInfo) {
        reachableCount++;
        const ua = r.peerInfo.userAgent ?? "?";
        const h = r.peerInfo.startHeight ?? "?";
        console.log(
          `${r.ip}:${r.port}\t${r.latencyMs?.toFixed(0)}ms\t${h}\t${ua}`,
        );
      }
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`\nDone in ${elapsed}s`);
  console.error(`  scanned:   ${scanned}`);
  console.error(`  reachable: ${reachableCount}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
