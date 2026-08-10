#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { selectCandidates } from "./autotempest.mjs";
import { createCamoufoxBrowser } from "./browser.mjs";
import { buildAutoTempestUrl, loadConfig, mergeRemoteSearchConfig } from "./config.mjs";
import { readBoundedJson, validatedAppOrigin } from "./app-client.mjs";

export const LEGACY_BROWSER_AUTHORIZATION = "written-source-permission-confirmed";

export function requireLegacyBrowserAuthorization(env = process.env) {
  if (env.AUTOHUNTER_LEGACY_BROWSER_AUTHORIZATION !== LEGACY_BROWSER_AUTHORIZATION) {
    throw new Error(
      "Legacy browser collection is disabled. It requires written source permission and " +
      `AUTOHUNTER_LEGACY_BROWSER_AUTHORIZATION=${LEGACY_BROWSER_AUTHORIZATION}.`,
    );
  }
}

function argumentsFrom(argv) {
  const options = { config: process.env.CATCHT_CONFIG ?? "./config.example.json", dryRun: false, discoverOnly: false, json: false, limit: null, model: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--config") options.config = argv[++index];
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--discover-only") options.discoverOnly = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--limit") options.limit = Number(argv[++index]);
    else if (argument === "--model") options.model = argv[++index];
    else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function withinPolicy(candidate, policy) {
  return candidate.price <= policy.maxPrice && candidate.mileage <= policy.maxMileage && candidate.distanceMiles <= policy.radiusMiles;
}

function mergeDetail(candidate, detail) {
  const merged = {
    ...candidate,
    title: detail.facts.title ?? candidate.title,
    vin: detail.facts.vin ?? null,
    price: detail.facts.price ?? candidate.price,
    mileage: detail.facts.mileage ?? candidate.mileage,
    transmissionClaim: detail.facts.transmissionClaim ?? candidate.transmissionClaim,
    imageUrls: detail.images,
    primaryImageUrl: detail.images[0] ?? null,
  };
  if (detail.images.length === 0) merged.manualEvidence = [];
  return merged;
}

async function ingest(candidates) {
  const appUrl = validatedAppOrigin(process.env.CATCHT_APP_URL);
  const secret = process.env.CATCHT_INGEST_SECRET;
  if (!appUrl || !secret) throw new Error("CATCHT_APP_URL and CATCHT_INGEST_SECRET are required outside dry-run mode");
  const response = await fetch(`${appUrl}/api/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ candidates }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`ingest endpoint returned HTTP ${response.status}`);
  const result = await readBoundedJson(response);
  if (result.accepted !== candidates.length) throw new Error("ingest endpoint did not accept the complete batch");
  return result.accepted;
}

async function syncRemoteSearchConfig(config) {
  if (!config.collector.syncWatchModels) return config;
  const appUrlValue = process.env.CATCHT_APP_URL;
  const secret = process.env.CATCHT_INGEST_SECRET;
  if (!appUrlValue && !secret) return config;
  if (!appUrlValue || !secret) {
    throw new Error("both CATCHT_APP_URL and CATCHT_INGEST_SECRET are required to sync the dashboard watchlist");
  }
  const appUrl = validatedAppOrigin(appUrlValue);
  const response = await fetch(`${appUrl}/api/collector/config`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`collector config endpoint returned HTTP ${response.status}`);
  const payload = await readBoundedJson(response);
  return mergeRemoteSearchConfig(config, payload.search);
}

export async function runCollection(options) {
  requireLegacyBrowserAuthorization();
  const config = await syncRemoteSearchConfig(await loadConfig(resolve(options.config)));
  const models = config.search.models.filter((model) => !options.model || `${model.make} ${model.model}`.toLowerCase() === options.model.toLowerCase());
  if (models.length === 0) throw new Error("no configured model matched --model");
  const browser = await createCamoufoxBrowser({ minimumIntervalMs: config.collector.minimumIntervalMs });
  const summary = { models: models.length, discovered: 0, browserChecked: 0, photos: 0, photoReady: 0, pending: 0, challenged: 0, rejected: 0, ingested: 0 };
  const ready = [];
  try {
    for (const model of models) {
      const discovery = await browser.discover(buildAutoTempestUrl(config, model));
      if (discovery.status === "challenged") {
        summary.challenged += 1;
        continue;
      }
      const candidates = selectCandidates(discovery.items, {
        model,
        policy: config.search,
        includeAuctions: config.collector.includeAuctions,
        limit: options.limit ?? config.collector.maxCandidatesPerModel,
      });
      summary.discovered += candidates.length;
      if (options.discoverOnly) continue;
      for (const candidate of candidates) {
        const detail = await browser.inspectListing(candidate.url, { openGallery: true });
        summary.browserChecked += 1;
        if (detail.status === "challenged") {
          summary.challenged += 1;
          continue;
        }
        const merged = mergeDetail(candidate, detail);
        summary.photos += merged.imageUrls.length;
        if (!withinPolicy(merged, config.search) || /\b(automatic|cvt|dct|dual[- ]clutch)\b/i.test(merged.transmissionClaim ?? "")) {
          summary.rejected += 1;
          continue;
        }
        if (merged.imageUrls.length === 0) summary.pending += 1;
        else summary.photoReady += 1;
        ready.push(merged);
      }
    }
    if (!options.dryRun) {
      for (let index = 0; index < ready.length; index += 50) summary.ingested += await ingest(ready.slice(index, index + 50));
    }
    return summary;
  } finally {
    await browser.close();
  }
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  const summary = await runCollection(options);
  const output = options.json ? JSON.stringify(summary) : [
    "AutoHunter collector complete",
    `models=${summary.models}`,
    `discovered=${summary.discovered}`,
    `browser_checked=${summary.browserChecked}`,
    `photos=${summary.photos}`,
    `photo_ready=${summary.photoReady}`,
    `pending=${summary.pending}`,
    `challenged=${summary.challenged}`,
    `rejected=${summary.rejected}`,
    `ingested=${summary.ingested}`,
  ].join(" ");
  process.stdout.write(`${output}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`autohunter: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
