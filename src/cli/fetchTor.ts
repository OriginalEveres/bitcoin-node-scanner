#!/usr/bin/env node
import { fetchTor } from "../tor/fetchTor.js";

fetchTor({ log: (message) => console.error(message) })
	.then((binary) => console.error(`Tor binary ready: ${binary}`))
	.catch((err: unknown) => {
		console.error("Error:", err instanceof Error ? err.message : err);
		process.exit(1);
	});
