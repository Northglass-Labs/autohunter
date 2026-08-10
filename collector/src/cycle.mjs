#!/usr/bin/env node

import { runCollection } from "./collect.mjs";
import { readBoundedJson, validatedAppOrigin } from "./app-client.mjs";

function configPath() {
  const index = process.argv.indexOf("--config");
  return index >= 0 ? process.argv[index + 1] : process.env.CATCHT_CONFIG ?? "./config.example.json";
}

async function runDigest() {
  const appUrl = validatedAppOrigin(process.env.CATCHT_APP_URL);
  const secret = process.env.CATCHT_CRON_SECRET;
  if (!appUrl || !secret) throw new Error("CATCHT_APP_URL and CATCHT_CRON_SECRET are required for digest delivery");
  const response = await fetch(`${appUrl}/api/cron/digest`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`digest endpoint returned HTTP ${response.status}`);
  return readBoundedJson(response);
}

try {
  const collection = await runCollection({ config: configPath(), dryRun: false, discoverOnly: false, json: true, limit: null, model: null });
  const digest = await runDigest();
  process.stdout.write(`${JSON.stringify({ collection, digest })}\n`);
} catch (error) {
  process.stderr.write(`autohunter cycle: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
