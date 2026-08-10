import test from "node:test";
import assert from "node:assert/strict";
import { mergeRemoteSavedSearches, validatePlatformConfig } from "../src/platform-config.mjs";
import { runPlatformCollection } from "../src/platform.mjs";

const config = {
  version: 2,
  searches: [{
    id: "11111111-1111-4111-8111-111111111111",
    name: "New GR86",
    offerKind: "new",
    make: "Toyota",
    model: "GR86",
    zip: "10001",
    radiusMiles: 150,
    transmission: "any",
    maxPrice: 40_000,
    maxMileage: 500,
    active: true,
  }],
  adapters: {
    marketcheck: { enabled: true, rowsPerSearch: 20, maximumRadiusMiles: 100, maximumSearchCalls: 13, detailFetchLimit: 3 },
    autodev: { enabled: true, rowsPerSearch: 20, maximumRadiusMiles: 250, maximumSearchCalls: 13 },
    marketcheckIncentives: { enabled: true, rowsPerGroup: 10, maximumSearchCalls: 13 },
    nhtsa: { enabled: false, maximumModelGroups: 5, maximumVariantsPerGroup: 2, minimumIntervalMs: 500 },
    leasehackr: { enabled: false, mode: "manual_import" },
  },
  collector: { minimumIntervalMs: 1_000, syncSavedSearches: true },
};

test("validates a reusable v2 platform profile and rejects scheduled Leasehackr collection", () => {
  assert.equal(validatePlatformConfig(structuredClone(config)).version, 2);
  assert.throws(
    () => validatePlatformConfig({
      ...structuredClone(config),
      adapters: { ...config.adapters, leasehackr: { enabled: true, mode: "rss" } },
    }),
    /source terms|manual import/i,
  );
  const leaseWithoutRegion = structuredClone(config);
  leaseWithoutRegion.searches = [{
    ...leaseWithoutRegion.searches[0],
    offerKind: "lease",
    zip: null,
    radiusMiles: null,
    region: null,
  }];
  assert.throws(() => validatePlatformConfig(leaseWithoutRegion), /region/);
  const leaseWithoutZip = structuredClone(config);
  leaseWithoutZip.searches = [{
    ...leaseWithoutZip.searches[0],
    offerKind: "lease",
    zip: null,
    radiusMiles: null,
    region: "Northeast",
  }];
  assert.throws(() => validatePlatformConfig(leaseWithoutZip), /zip/i);
  const excessiveProviderRadius = structuredClone(config);
  excessiveProviderRadius.adapters.marketcheck.maximumRadiusMiles = 501;
  assert.throws(() => validatePlatformConfig(excessiveProviderRadius), /maximumRadiusMiles/);
  const excessiveAutoDevLimit = structuredClone(config);
  excessiveAutoDevLimit.adapters.autodev.rowsPerSearch = 21;
  assert.throws(() => validatePlatformConfig(excessiveAutoDevLimit), /autodev.*rowsPerSearch/);
  const excessiveNhtsaGroups = structuredClone(config);
  excessiveNhtsaGroups.adapters.nhtsa.maximumModelGroups = 26;
  assert.throws(() => validatePlatformConfig(excessiveNhtsaGroups), /nhtsa.*maximumModelGroups/i);
});

test("accepts family intelligence fields without silently widening a saved search", () => {
  const family = structuredClone(config);
  family.searches[0] = {
    ...family.searches[0],
    profile: "family_ev",
    garageGroup: "ev",
    powertrainCategory: "ev",
    yearMin: 2022,
    yearMax: 2025,
    targetPrice: 55_000,
    maxPrice: 70_000,
    aliases: ["EQS SUV"],
    trimAliases: ["EQS 580 4MATIC"],
    desiredFeatures: ["hands_free_highway", "rear_axle_steering"],
    requiredFeatures: ["adaptive_cruise_lane_centering"],
    rationale: "Family EV with strong highway assistance and a usable rear seat.",
    priority: 95,
  };

  assert.equal(validatePlatformConfig(family).searches[0].targetPrice, 55_000);
  const invalid = structuredClone(family);
  invalid.searches[0].yearMin = 2026;
  assert.throws(() => validatePlatformConfig(invalid), /yearMin.*yearMax/);
});

test("accepts an empty authoritative search sync when every alert is paused", () => {
  const merged = mergeRemoteSavedSearches(structuredClone(config), []);
  assert.deepEqual(merged.searches, []);
});

test("ingests normalized offers and health together without exposing adapter internals", async () => {
  const payloads = [];
  const offer = {
    offerKind: "new",
    condition: "new",
    source: "marketcheck",
    sourceListingId: "mc-1",
    searchId: config.searches[0].id,
    url: "https://dealer.example/new/gr86-1",
    year: 2026,
    make: "Toyota",
    model: "GR86",
    title: "2026 Toyota GR86",
    price: 34_995,
    mileage: 5,
    distanceMiles: 20,
    location: "Philadelphia, PA",
    imageUrls: ["https://images.example/gr86.jpg"],
    primaryImageUrl: "https://images.example/gr86.jpg",
    manualEvidence: [],
    requiresManualVerification: false,
  };
  const result = await runPlatformCollection({
    config: structuredClone(config),
    searches: config.searches,
    adapters: [async () => ({
      offers: [offer],
      run: {
        adapter: "marketcheck-inventory-v2",
        source: "marketcheck",
        status: "success",
        startedAt: "2026-07-14T12:00:00.000Z",
        finishedAt: "2026-07-14T12:00:01.000Z",
        searchedCount: 1,
        discoveredCount: 1,
        acceptedCount: 1,
        messageCode: null,
      },
    })],
    ingestImpl: async (payload) => { payloads.push(payload); return payload.candidates.length; },
  });

  assert.equal(result.discovered, 1);
  assert.equal(result.ingested, 1);
  assert.equal(result.sources.success, 1);
  assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0], { candidates: [offer], sourceRuns: [result.runs[0]] });
});

test("persists health even when all adapters return zero offers", async () => {
  const payloads = [];
  await runPlatformCollection({
    config: structuredClone(config),
    searches: config.searches,
    adapters: [async () => ({
      offers: [],
      run: {
        adapter: "marketcheck-inventory-v2",
        source: "marketcheck",
        status: "unavailable",
        startedAt: "2026-07-14T12:00:00.000Z",
        finishedAt: "2026-07-14T12:00:00.000Z",
        searchedCount: 0,
        discoveredCount: 0,
        acceptedCount: 0,
        messageCode: "credential_missing",
      },
    })],
    ingestImpl: async (payload) => { payloads.push(payload); return 0; },
  });
  assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0].candidates, []);
  assert.equal(payloads[0].sourceRuns[0].status, "unavailable");
});

test("runs safety enrichers after inventory deduplication and persists their health", async () => {
  const payloads = [];
  const offer = {
    offerKind: "used",
    condition: "used",
    source: "marketcheck",
    sourceListingId: "x5-1",
    searchId: config.searches[0].id,
    url: "https://dealer.example/x5-1",
    vin: "5UX23EU05R9000001",
    year: 2024,
    make: "BMW",
    model: "X5",
    title: "2024 BMW X5",
    price: 58_000,
    mileage: 18_000,
    distanceMiles: 20,
    location: "Example City, NY",
    imageUrls: ["https://images.example/x5.jpg"],
    manualEvidence: [],
  };
  const safetyEvidence = {
    source: "nhtsa",
    ratingStatus: "rated",
    overallRating: 4,
    frontalCrashRating: 4,
    sideCrashRating: 5,
    rolloverRating: 4,
    availableVariantCount: 2,
    testedVariantCount: 2,
    recallCampaignCount: 1,
    recallCampaigns: [],
    retrievedAt: "2026-08-10T12:00:00.000Z",
  };
  const result = await runPlatformCollection({
    config: structuredClone(config),
    adapters: [async () => ({
      offers: [offer],
      run: sourceRun("marketcheck-inventory-v2", "marketcheck"),
    })],
    enrichers: [async ({ offers: input }) => ({
      offers: input.map((candidate) => ({ ...candidate, safetyEvidence })),
      run: sourceRun("nhtsa-safety-v1", "nhtsa"),
    })],
    ingestImpl: async (payload) => { payloads.push(payload); return payload.candidates.length; },
  });

  assert.equal(result.runs.length, 2);
  assert.equal(payloads[0].candidates[0].safetyEvidence.overallRating, 4);
  assert.deepEqual(payloads[0].sourceRuns.map((run) => run.source), ["marketcheck", "nhtsa"]);
});

test("preserves per-search matches for one canonical provider listing", async () => {
  const payloads = [];
  const shared = {
    offerKind: "new",
    condition: "new",
    source: "auto_dev",
    sourceListingId: "shared-vin:dealer",
    url: "https://dealer.example/new/gr86-shared",
    year: 2026,
    make: "Toyota",
    model: "GR86",
    title: "2026 Toyota GR86",
    price: 34_995,
    mileage: 5,
    distanceMiles: 20,
    location: "Philadelphia, PA",
    imageUrls: ["https://images.example/gr86.jpg"],
    manualEvidence: [],
  };
  const result = await runPlatformCollection({
    config: structuredClone(config),
    adapters: [async () => ({
      offers: [{ ...shared, searchId: "owner-one" }, { ...shared, searchId: "owner-two" }],
      run: {
        adapter: "autodev-inventory-v2",
        source: "auto_dev",
        status: "success",
        startedAt: "2026-08-10T12:00:00.000Z",
        finishedAt: "2026-08-10T12:00:01.000Z",
        searchedCount: 1,
        discoveredCount: 1,
        acceptedCount: 2,
        messageCode: null,
      },
    })],
    ingestImpl: async (payload) => { payloads.push(payload); return payload.candidates.length; },
  });

  assert.equal(result.discovered, 2);
  assert.deepEqual(payloads[0].candidates.map((candidate) => candidate.searchId), ["owner-one", "owner-two"]);
});

function sourceRun(adapter, source) {
  return {
    adapter,
    source,
    status: "success",
    startedAt: "2026-08-10T12:00:00.000Z",
    finishedAt: "2026-08-10T12:00:01.000Z",
    searchedCount: 1,
    discoveredCount: 1,
    acceptedCount: 1,
    messageCode: null,
  };
}
