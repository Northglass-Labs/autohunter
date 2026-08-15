#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMarketCheckAdapter } from "./adapters/marketcheck.mjs";
import { runAutoDevAdapter } from "./adapters/autodev.mjs";
import { runMarketCheckIncentivesAdapter } from "./adapters/marketcheck-incentives.mjs";
import { enrichNhtsaSafety } from "./enrichers/nhtsa.mjs";
import { loadPlatformConfig, mergeRemoteSavedSearches } from "./platform-config.mjs";
import { readBoundedJson, validatedAppOrigin } from "./app-client.mjs";

function argumentsFrom(argv) {
  const options = { config: process.env.AUTOHUNTER_CONFIG ?? process.env.CAR_HUNT_CONFIG ?? "./platform.example.json", dryRun: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--config") options.config = argv[++index];
    else if (argv[index] === "--dry-run") options.dryRun = true;
    else if (argv[index] === "--json") options.json = true;
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return options;
}

async function ingestPayload(payload) {
  const appUrl = validatedAppOrigin(process.env.AUTOHUNTER_APP_URL ?? process.env.CAR_HUNT_APP_URL ?? process.env.CATCHT_APP_URL);
  const secret = process.env.AUTOHUNTER_INGEST_SECRET ?? process.env.CAR_HUNT_INGEST_SECRET ?? process.env.CATCHT_INGEST_SECRET;
  if (!appUrl || !secret) throw new Error("AUTOHUNTER_APP_URL and AUTOHUNTER_INGEST_SECRET are required outside dry-run mode");
  const response = await fetch(`${appUrl}/api/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`ingest endpoint returned HTTP ${response.status}`);
  const result = await readBoundedJson(response);
  if (result.accepted !== payload.candidates.length) throw new Error("ingest endpoint did not accept the complete batch");
  return result.accepted;
}

async function remoteConfig(config) {
  if (!config.collector.syncSavedSearches) return config;
  const appUrlValue = process.env.AUTOHUNTER_APP_URL ?? process.env.CAR_HUNT_APP_URL ?? process.env.CATCHT_APP_URL;
  const secret = process.env.AUTOHUNTER_INGEST_SECRET ?? process.env.CAR_HUNT_INGEST_SECRET ?? process.env.CATCHT_INGEST_SECRET;
  if (!appUrlValue && !secret) return config;
  if (!appUrlValue || !secret) throw new Error("both AUTOHUNTER_APP_URL and AUTOHUNTER_INGEST_SECRET are required to sync saved searches");
  const appUrl = validatedAppOrigin(appUrlValue);
  const response = await fetch(`${appUrl}/api/collector/config`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`collector config endpoint returned HTTP ${response.status}`);
  const payload = await readBoundedJson(response);
  if (payload.version !== 2) throw new Error("collector config endpoint returned an unsupported version");
  const merged = mergeRemoteSavedSearches(config, payload.searches);
  return { ...merged, enrichedListingIds: sanitizedEnrichedListingIds(payload.enrichedListingIds) };
}

function sanitizedEnrichedListingIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((id) => typeof id === "string" && id.length > 0 && id.length <= 200)
    .slice(0, 5_000);
}

function defaultAdapters(config) {
  const adapters = [];
  if (config.adapters.marketcheck.enabled) {
    adapters.push(({ searches }) => runMarketCheckAdapter({
      searches,
      rows: config.adapters.marketcheck.rowsPerSearch,
      maximumRadiusMiles: config.adapters.marketcheck.maximumRadiusMiles ?? 100,
      maximumSearchCalls: config.adapters.marketcheck.maximumSearchCalls ?? 13,
      detailFetchLimit: config.adapters.marketcheck.detailFetchLimit ?? 3,
      enrichedListingIds: config.enrichedListingIds ?? [],
      minimumIntervalMs: config.collector.minimumIntervalMs,
    }));
  }
  if (config.adapters.autodev.enabled) {
    adapters.push(({ searches }) => runAutoDevAdapter({
      searches,
      rows: config.adapters.autodev.rowsPerSearch,
      maximumRadiusMiles: config.adapters.autodev.maximumRadiusMiles ?? 250,
      maximumSearchCalls: config.adapters.autodev.maximumSearchCalls ?? 13,
      minimumIntervalMs: config.collector.minimumIntervalMs,
    }));
  }
  if (config.adapters.marketcheckIncentives.enabled) {
    adapters.push(({ searches }) => runMarketCheckIncentivesAdapter({
      searches,
      rows: config.adapters.marketcheckIncentives.rowsPerGroup,
      maximumSearchCalls: config.adapters.marketcheckIncentives.maximumSearchCalls ?? 13,
      minimumIntervalMs: config.collector.minimumIntervalMs,
    }));
  }
  return adapters;
}

function defaultEnrichers(config) {
  if (!config.adapters.nhtsa.enabled) return [];
  return [({ offers }) => enrichNhtsaSafety({
    offers,
    maximumModelGroups: config.adapters.nhtsa.maximumModelGroups ?? 5,
    maximumVariantsPerGroup: config.adapters.nhtsa.maximumVariantsPerGroup ?? 2,
    minimumIntervalMs: config.adapters.nhtsa.minimumIntervalMs ?? 500,
  })];
}

function offerKey(offer) {
  return `${offer.source}\u0000${offer.searchId ?? ""}\u0000${offer.sourceListingId ?? offer.url}`;
}

export async function runPlatformCollection({
  config,
  searches = config.searches.filter((search) => search.active),
  adapters = defaultAdapters(config),
  enrichers = defaultEnrichers(config),
  ingestImpl = ingestPayload,
  dryRun = false,
}) {
  const offers = [];
  const runs = [];
  const seen = new Set();
  for (const adapter of adapters) {
    const result = await adapter({ searches });
    runs.push(result.run);
    for (const offer of result.offers) {
      const key = offerKey(offer);
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(offer);
    }
  }

  let enrichedOffers = offers;
  for (const enricher of enrichers) {
    const result = await enricher({ offers: enrichedOffers, searches });
    if (!Array.isArray(result?.offers) || result.offers.length !== enrichedOffers.length) {
      throw new Error("an enricher must preserve every normalized offer");
    }
    enrichedOffers = result.offers;
    runs.push(result.run);
  }

  let ingested = 0;
  if (!dryRun) {
    if (enrichedOffers.length === 0) ingested += await ingestImpl({ candidates: [], sourceRuns: runs });
    else {
      for (let index = 0; index < enrichedOffers.length; index += 50) {
        ingested += await ingestImpl({ candidates: enrichedOffers.slice(index, index + 50), sourceRuns: index === 0 ? runs : [] });
      }
    }
  }
  const sources = runs.reduce((counts, run) => {
    counts[run.status] = (counts[run.status] ?? 0) + 1;
    return counts;
  }, {});
  return { searches: searches.length, discovered: enrichedOffers.length, ingested, sources, runs };
}

export async function runPlatformFromConfig(path, options = {}) {
  const config = await remoteConfig(await loadPlatformConfig(resolve(path)));
  return runPlatformCollection({ config, dryRun: options.dryRun });
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  const result = await runPlatformFromConfig(options.config, options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`autohunter: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
