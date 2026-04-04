import { scanNode } from "./scanner/nodeScanner.js";
import { describeServices } from "./protocol/services.js";

async function main() {
  const [, , ip, portArg] = process.argv;
  if (!ip) {
    console.error("Usage: tsx src/scan-test.ts <ip> [port]");
    process.exit(1);
  }

  const port = portArg ? Number(portArg) : 8333;

  const result = await scanNode({
    address: {
      ip,
      port,
      source: "manual",
    },
    options: {
      connectTimeoutMs: 5000,
      overallTimeoutMs: 15000,
      handshake: true,
      handshakeOptions: {
        handshakeTimeoutMs: 5000,
        feeFilterWaitMs: 2000,
      },
    },
  });

  // Serialize BigInt values for JSON output
  const output = JSON.stringify(
    result,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  console.log(output);

  if (result.peerInfo) {
    const { peerInfo } = result;
    console.log("\n--- Peer Info ---");
    console.log(`  User Agent:   ${peerInfo.userAgent}`);
    console.log(`  Protocol:     ${peerInfo.protocolVersion}`);
    console.log(`  Start Height: ${peerInfo.startHeight}`);
    console.log(`  Services:     ${describeServices(peerInfo.services).join(", ")}`);
    console.log(`  Relay:        ${peerInfo.relay}`);
    if (peerInfo.feeFilter) {
      console.log(`  Fee Filter:   ${peerInfo.feeFilter.satPerKb} sat/kB`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
