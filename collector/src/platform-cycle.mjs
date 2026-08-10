#!/usr/bin/env node

import { runPlatformFromConfig } from "./platform.mjs";
import { requestDigest } from "./digest.mjs";

const configIndex = process.argv.indexOf("--config");
const config = configIndex >= 0 ? process.argv[configIndex + 1] : process.env.AUTOHUNTER_CONFIG ?? process.env.CAR_HUNT_CONFIG ?? "./platform.example.json";

try {
  const collection = await runPlatformFromConfig(config);
  const digest = await requestDigest();
  process.stdout.write(`${JSON.stringify({ collection, digest })}\n`);
} catch (error) {
  process.stderr.write(`autohunter cycle: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
