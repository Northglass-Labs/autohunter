#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { readBoundedJson, validatedAppOrigin } from "./app-client.mjs";

export async function requestDigest({ env = process.env, fetchImpl = fetch } = {}) {
  const appUrlValue = env.AUTOHUNTER_APP_URL ?? env.CAR_HUNT_APP_URL ?? env.CATCHT_APP_URL;
  const secret = env.AUTOHUNTER_CRON_SECRET ?? env.CAR_HUNT_CRON_SECRET ?? env.CATCHT_CRON_SECRET;
  if (!appUrlValue || !secret) {
    throw new Error("AUTOHUNTER_APP_URL and AUTOHUNTER_CRON_SECRET are required for digest delivery");
  }

  const appUrl = validatedAppOrigin(appUrlValue);
  const response = await fetchImpl(`${appUrl}/api/cron/digest`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`digest endpoint returned HTTP ${response.status}`);
  return readBoundedJson(response);
}

async function main() {
  const result = await requestDigest();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`autohunter digest: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
