# Terms & names
Naming can be really hard and it's often that different people use different words for the same concept, or the same word for different concepts. This document attempts to clarify the terminology used in this project.

| Term | Meaning |
|------|---------|
| **Node** | A Bitcoin client accessible on an IP and port. May or may not be connected to us. |
| **Peer** | A node that has successfully completed the P2P handshake (`version` + `verack`) with us. |
| **Node Scan** | A single attempt to connect to a node, perform handshake, and collect metadata. |
| **Crawl** | Recursive network exploration using DNS seeds and `addr`/`addrv2` gossip. |
| **Discovery Source** | How a node was found: `dns`, `manual`, `addr`, `random`, or `bootstrap`. |
| **Services** | A 64-bit bitfield from the `version` message describing node capabilities (e.g., NODE_NETWORK, NODE_WITNESS). |
| **Feefilter** | Advertised minimum feerate (sat/kvB) from the `feefilter` message (BIP133). |
| **Node Policy** | P2P-observable behavior affecting transaction relay (feefilter, relay flag, services). |
| **Scan Result** | Structured output of a node scan, including reachability and peer metadata. |
| **Node Address** | Normalized representation of a target: IP, port, and discovery source. |
| **Timeout** | Max duration allowed for TCP connect + handshake before classifying node as unreachable. |