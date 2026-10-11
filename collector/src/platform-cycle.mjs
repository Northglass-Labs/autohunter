#!/usr/bin/env node

import { allSourcesFailed, runPlatformFromConfig } from "./platform.mjs";
import { requestDigest } from "./digest.mjs";

const configIndex = process.argv.indexOf("--config");
const config = configIndex >= 0 ? process.argv[configIndex + 1] : process.env.AUTOHUNTER_CONFIG ?? process.env.CAR_HUNT_CONFIG ?? "./platform.example.json";

try {
  const collection = await runPlatformFromConfig(config);
  const digest = await requestDigest();
  process.stdout.write(`${JSON.stringify({ collection, digest })}\n`);
  // Reports still go out with their source-health notes; the run itself is marked failed.
  if (allSourcesFailed(collection.runs)) {
    process.stderr.write("autohunter cycle: every source failed\n");
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`autohunter cycle: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
