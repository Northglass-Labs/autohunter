import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketCheckGroups,
  buildMarketCheckUrl,
  normalizeMarketCheckListing,
  runMarketCheckAdapter,
} from "../src/adapters/marketcheck.mjs";

const search = {
  id: "search-used-miata",
  name: "Used Miatas",
  offerKind: "used",
  make: "Mazda",
  model: "MX-5 Miata",
  trim: null,
  zip: "10001",
  radiusMiles: 150,
  transmission: "manual",
  maxPrice: 15_000,
  maxMileage: 120_000,
};

test("builds a bounded authorized inventory query with hard filters", () => {
  const url = buildMarketCheckUrl(search, { apiKey: "test-key", rows: 12 });
  assert.equal(url.origin + url.pathname, "https://api.marketcheck.com/v2/search/car/active");
  assert.equal(url.searchParams.get("car_type"), "used");
  assert.equal(url.searchParams.get("make"), "Mazda");
  assert.equal(url.searchParams.get("model"), "MX-5 Miata");
  assert.equal(url.searchParams.get("price_range"), "0-15000");
  assert.equal(url.searchParams.get("miles_range"), "0-120000");
  assert.equal(url.searchParams.get("transmission"), "Manual");
  assert.equal(url.searchParams.get("photo_links"), "true");
  assert.equal(url.searchParams.get("append_api_key"), "false");
  assert.equal(url.searchParams.get("rows"), "12");
  assert.equal(url.searchParams.get("radius"), "100");
});

test("reports when provider-plan limits reduce requested geographic coverage", async () => {
  const result = await runMarketCheckAdapter({
    searches: [search],
    apiKey: "test-key",
    maximumRadiusMiles: 100,
    minimumIntervalMs: 0,
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get("radius"), "100");
      return { ok: true, json: async () => ({ listings: [] }) };
    },
  });

  assert.equal(result.run.status, "empty");
  assert.equal(result.run.messageCode, "radius_capped_100mi");
});

test("normalizes new and used inventory and delegates manual photo proof to ingest", () => {
  const candidate = normalizeMarketCheckListing({
    id: "mc-123",
    vin: "JM1NDAB78M0456789",
    heading: "2021 Mazda MX-5 Miata Club",
    price: 14_500,
    miles: 61_200,
    msrp: 34_000,
    inventory_type: "used",
    vdp_url: "https://dealer.example/inventory/miata-123?api_key=must-not-persist&utm_source=marketcheck",
    source: "dealer.example",
    dist: 42.5,
    dealer: { name: "Example Mazda", city: "Lancaster", state: "PA" },
    media: {
      photo_links: ["https://images.example/miata.jpg?api_key=must-not-persist&width=1200"],
      photo_links_cached: ["https://api.marketcheck.com/v2/image/cache/car/example?api_key=must-not-persist"],
    },
    build: { year: 2021, make: "Mazda", model: "MX-5 Miata", trim: "Club", transmission: "Manual" },
  }, search, new Date("2026-07-14T12:00:00.000Z"));

  assert.deepEqual(candidate, {
    offerKind: "used",
    condition: "used",
    source: "marketcheck",
    originSource: "dealer.example",
    sourceListingId: "mc-123",
    searchId: "search-used-miata",
    url: "https://dealer.example/inventory/miata-123?utm_source=marketcheck",
    vin: "JM1NDAB78M0456789",
    year: 2021,
    make: "Mazda",
    model: "MX-5 Miata",
    trim: "Club",
    title: "2021 Mazda MX-5 Miata Club",
    price: 14_500,
    mileage: 61_200,
    distanceMiles: 42.5,
    location: "Lancaster, PA",
    transmissionClaim: "Manual",
    imageUrls: ["https://images.example/miata.jpg?width=1200"],
    primaryImageUrl: "https://images.example/miata.jpg?width=1200",
    marketEstimate: null,
    msrp: 34_000,
    sellerName: "Example Mazda",
    requiresManualVerification: true,
    parseConfidence: 1,
    expiresAt: "2026-07-18T12:00:00.000Z",
  });
  assert.equal(Object.hasOwn(candidate, "manualEvidence"), false);
});

test("rejects provider drift outside saved-search limits and inventory without real photos", () => {
  const base = {
    id: "mc-drift",
    heading: "2021 Mazda MX-5 Miata Club",
    price: 14_500,
    miles: 61_200,
    inventory_type: "used",
    vdp_url: "https://dealer.example/inventory/miata-drift",
    dist: 42.5,
    dealer: { name: "Example Mazda", city: "Lancaster", state: "PA" },
    media: { photo_links: ["https://images.example/miata.jpg"] },
    build: { year: 2021, make: "Mazda", model: "MX-5 Miata", transmission: "Manual" },
  };
  assert.equal(normalizeMarketCheckListing({ ...base, price: 15_001 }, search), null);
  assert.equal(normalizeMarketCheckListing({ ...base, dist: 151 }, search), null);
  assert.equal(normalizeMarketCheckListing({ ...base, media: { photo_links: [] } }, search), null);
  assert.equal(normalizeMarketCheckListing({
    ...base,
    media: { photo_links_cached: ["https://api.marketcheck.com/v2/image/cache/car/example"] },
  }, search), null);
  assert.equal(normalizeMarketCheckListing({ ...base, build: { ...base.build, transmission: "Automatic" } }, search), null);
  assert.equal(normalizeMarketCheckListing({ ...base, build: { ...base.build, make: undefined } }, search), null);
  assert.equal(normalizeMarketCheckListing({ ...base, build: { ...base.build, model: undefined } }, search), null);
});

test("reports a missing API credential as unavailable without making a request", async () => {
  let requested = false;
  const result = await runMarketCheckAdapter({
    searches: [search],
    apiKey: null,
    fetchImpl: async () => { requested = true; throw new Error("should not fetch"); },
  });
  assert.equal(requested, false);
  assert.deepEqual(result.offers, []);
  assert.equal(result.run.status, "unavailable");
  assert.equal(result.run.messageCode, "credential_missing");
});

test("reports no matching searches before checking provider credentials", async () => {
  let requested = false;
  const result = await runMarketCheckAdapter({
    searches: [],
    apiKey: null,
    fetchImpl: async () => { requested = true; throw new Error("should not fetch"); },
  });
  assert.equal(requested, false);
  assert.equal(result.run.status, "empty");
  assert.equal(result.run.messageCode, "no_matching_searches");
});

test("groups compatible searches into bounded make-level queries while retaining exact policies", () => {
  const searches = [
    { ...search, id: "bmw-x5", make: "BMW", model: "X5", trim: null, transmission: "automatic", yearMin: 2022, yearMax: 2025, maxPrice: 70_000, priority: 90 },
    { ...search, id: "bmw-x7", make: "BMW", model: "X7", trim: null, transmission: "automatic", yearMin: 2023, yearMax: 2026, maxPrice: 65_000, priority: 70 },
    { ...search, id: "audi-q8", make: "Audi", model: "Q8 e-tron", trim: null, transmission: "automatic", yearMin: 2024, yearMax: 2026, maxPrice: 60_000, priority: 75 },
  ];
  const groups = buildMarketCheckGroups(searches);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].searches.map((candidate) => candidate.id), ["audi-q8"]);
  assert.deepEqual(groups[1].searches.map((candidate) => candidate.id), ["bmw-x5", "bmw-x7"]);
  const bmwUrl = buildMarketCheckUrl(groups[1], { apiKey: "test-key", rows: 50 });
  assert.equal(bmwUrl.searchParams.get("make"), "BMW");
  assert.equal(bmwUrl.searchParams.get("model"), "X5,X7");
  assert.equal(bmwUrl.searchParams.get("year_range"), "2022-2026");
  assert.equal(bmwUrl.searchParams.get("price_range"), "0-70000");
});

test("shares one make query across automatic and manual searches while preserving exact transmission checks", () => {
  const searches = [
    { ...search, id: "porsche-cayenne", make: "Porsche", model: "Cayenne", transmission: "automatic", maxPrice: 70_000, priority: 100 },
    { ...search, id: "porsche-boxster", make: "Porsche", model: "718 Boxster", transmission: "manual", maxPrice: 50_000, priority: 50 },
  ];
  const groups = buildMarketCheckGroups(searches);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].transmission, "any");
  assert.deepEqual(groups[0].searches.map((candidate) => candidate.id), ["porsche-cayenne", "porsche-boxster"]);
  const url = buildMarketCheckUrl(groups[0], { apiKey: "test-key", rows: 50 });
  assert.equal(url.searchParams.get("transmission"), null);

  const automaticBoxster = {
    id: "mc-auto-boxster",
    heading: "2021 Porsche 718 Boxster",
    price: 48_000,
    miles: 20_000,
    inventory_type: "used",
    vdp_url: "https://dealer.example/automatic-boxster",
    dist: 20,
    media: { photo_links: ["https://images.example/automatic-boxster.jpg"] },
    build: { year: 2021, make: "Porsche", model: "718 Boxster", transmission: "Automatic" },
  };
  assert.equal(normalizeMarketCheckListing(automaticBoxster, searches[1]), null);
});

test("routes every grouped result through the exact matching search", async () => {
  const x5Search = { ...search, id: "bmw-x5", make: "BMW", model: "X5", trim: null, transmission: "automatic", yearMin: 2024, yearMax: 2025, maxPrice: 70_000, priority: 90 };
  const x7Search = { ...search, id: "bmw-x7", make: "BMW", model: "X7", trim: null, transmission: "automatic", yearMin: 2023, yearMax: 2025, maxPrice: 65_000, priority: 70 };
  const result = await runMarketCheckAdapter({
    searches: [x5Search, x7Search],
    apiKey: "test-key",
    minimumIntervalMs: 0,
    detailFetchLimit: 0,
    fetchImpl: async () => new Response(JSON.stringify({ listings: [{
      id: "mc-x7",
      heading: "2023 BMW X7 xDrive40i",
      price: 59_000,
      miles: 28_000,
      inventory_type: "used",
      vdp_url: "https://dealer.example/bmw-x7",
      dist: 40,
      media: { photo_links: ["https://images.example/x7.jpg"] },
      build: { year: 2023, make: "BMW", model: "X7", trim: "xDrive40i", transmission: "Automatic" },
    }] }), { status: 200, headers: { "content-type": "application/json" } }),
  });

  assert.equal(result.run.searchedCount, 1);
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].searchId, "bmw-x7");
});

test("emits one match per owned search when the same canonical listing fits multiple users", async () => {
  const first = { ...search, id: "owner-one-miata" };
  const second = { ...search, id: "owner-two-miata" };
  const result = await runMarketCheckAdapter({
    searches: [first, second],
    apiKey: "test-key",
    minimumIntervalMs: 0,
    detailFetchLimit: 0,
    fetchImpl: async () => new Response(JSON.stringify({ listings: [{
      id: "mc-shared-miata",
      heading: "2021 Mazda MX-5 Miata Club",
      price: 14_500,
      miles: 61_200,
      inventory_type: "used",
      vdp_url: "https://dealer.example/shared-miata",
      dist: 42.5,
      media: { photo_links: ["https://images.example/shared-miata.jpg"] },
      build: { year: 2021, make: "Mazda", model: "MX-5 Miata", trim: "Club", transmission: "Manual" },
    }] }), { status: 200 }),
  });

  assert.deepEqual(result.offers.map((offer) => offer.searchId).sort(), ["owner-one-miata", "owner-two-miata"]);
  assert.equal(new Set(result.offers.map((offer) => offer.sourceListingId)).size, 1);
});

test("enforces model-year limits again after grouped discovery", () => {
  const policy = { ...search, yearMin: 2022, yearMax: 2024 };
  const listing = {
    id: "mc-year-drift",
    heading: "2021 Mazda MX-5 Miata Club",
    price: 14_500,
    miles: 61_200,
    inventory_type: "used",
    vdp_url: "https://dealer.example/miata-year-drift",
    dist: 42.5,
    media: { photo_links: ["https://images.example/miata.jpg"] },
    build: { year: 2021, make: "Mazda", model: "MX-5 Miata", transmission: "Manual" },
  };

  assert.equal(normalizeMarketCheckListing(listing, policy), null);
});

test("limits detail enrichment without dropping base inventory", async () => {
  const family = {
    ...search,
    id: "family-bmw-x5",
    make: "BMW",
    model: "X5",
    trim: null,
    transmission: "automatic",
    maxPrice: 70_000,
    profile: "family_gas",
    powertrainCategory: "gas",
    desiredFeatures: ["hands_free_highway"],
    requiredFeatures: [],
    priority: 100,
  };
  let detailCalls = 0;
  const listings = [1, 2, 3, 4].map((number) => ({
    id: `mc-x5-${number}`,
    heading: `2024 BMW X5 xDrive40i ${number}`,
    price: 55_000 + number,
    miles: 10_000 + number,
    inventory_type: "used",
    vdp_url: `https://dealer.example/x5-${number}`,
    dist: 25,
    media: { photo_links: [`https://images.example/x5-${number}.jpg`] },
    build: { year: 2024, make: "BMW", model: "X5", trim: "xDrive40i", transmission: "Automatic" },
  }));

  const result = await runMarketCheckAdapter({
    searches: [family],
    apiKey: "test-key",
    minimumIntervalMs: 0,
    detailFetchLimit: 2,
    fetchImpl: async (url) => {
      if (url.pathname.startsWith("/v2/listing/car/")) {
        detailCalls += 1;
        return new Response(JSON.stringify({
          extra: { options: ["Driving Assistance Professional Package"], features: ["Highway Assistant"] },
          build: { body_type: "SUV", fuel_type: "Premium Unleaded", powertrain_type: "Combustion", seating_capacity: 5 },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ listings }), { status: 200 });
    },
  });

  assert.equal(result.offers.length, 4);
  assert.equal(detailCalls, 2);
  assert.equal(result.offers.filter((offer) => offer.enrichmentStatus === "enriched").length, 2);
  assert.equal(result.offers.filter((offer) => offer.enrichmentStatus === "budget_deferred").length, 2);
  assert.equal(result.offers[0].featureEvidence[0].status, "confirmed");
});

test("caps inventory queries and reports partial coverage instead of overrunning the daily budget", async () => {
  const searches = Array.from({ length: 14 }, (_, index) => ({
    ...search,
    id: `search-${index}`,
    make: `Make ${index}`,
    model: `Model ${index}`,
    trim: null,
    transmission: "automatic",
  }));
  let requests = 0;
  const result = await runMarketCheckAdapter({
    searches,
    apiKey: "test-key",
    minimumIntervalMs: 0,
    maximumSearchCalls: 13,
    detailFetchLimit: 0,
    fetchImpl: async () => {
      requests += 1;
      return new Response(JSON.stringify({ listings: [] }), { status: 200 });
    },
  });

  assert.equal(requests, 13);
  assert.equal(result.run.searchedCount, 13);
  assert.equal(result.run.messageCode, "query_budget_capped_13of14");
});

test("carries expected-tier summary evidence for listings the detail budget never reaches", async () => {
  const family = {
    ...search,
    id: "family-bmw-x5-summary",
    make: "BMW",
    model: "X5",
    trim: null,
    transmission: "automatic",
    maxPrice: 70_000,
    profile: "family_gas",
    powertrainCategory: "gas",
    desiredFeatures: ["adaptive_cruise_lane_centering"],
    requiredFeatures: [],
    priority: 100,
  };
  const result = await runMarketCheckAdapter({
    searches: [family],
    apiKey: "test-key",
    minimumIntervalMs: 0,
    detailFetchLimit: 0,
    fetchImpl: async () => new Response(JSON.stringify({ listings: [{
      id: "mc-x5-summary",
      heading: "2024 BMW X5 xDrive40i w/ Driving Assistance Professional",
      price: 56_000,
      miles: 12_000,
      inventory_type: "used",
      vdp_url: "https://dealer.example/x5-summary",
      dist: 25,
      media: { photo_links: ["https://images.example/x5-summary.jpg"] },
      build: { year: 2024, make: "BMW", model: "X5", trim: "xDrive40i", transmission: "Automatic" },
    }] }), { status: 200 }),
  });

  assert.equal(result.offers.length, 1);
  const evidence = result.offers[0].featureEvidence.find((feature) => feature.key === "adaptive_cruise_lane_centering");
  assert.equal(evidence.status, "expected");
  assert.equal(evidence.source, "provider_summary");
  assert.equal(result.offers[0].enrichmentStatus, "budget_deferred");
});

test("spends the detail budget on listings whose summary evidence can upgrade to confirmed", async () => {
  const family = {
    ...search,
    id: "family-bmw-x5-upgrade",
    make: "BMW",
    model: "X5",
    trim: null,
    transmission: "automatic",
    maxPrice: 70_000,
    profile: "family_gas",
    powertrainCategory: "gas",
    desiredFeatures: ["hands_free_highway"],
    requiredFeatures: [],
    priority: 100,
  };
  const detailIds = [];
  const listings = [{
    id: "mc-x5-cheap-plain",
    heading: "2024 BMW X5 xDrive40i",
    price: 51_000,
    miles: 12_000,
    inventory_type: "used",
    vdp_url: "https://dealer.example/x5-cheap-plain",
    dist: 25,
    media: { photo_links: ["https://images.example/x5-cheap.jpg"] },
    build: { year: 2024, make: "BMW", model: "X5", trim: "xDrive40i", transmission: "Automatic" },
  }, {
    id: "mc-x5-summary-hit",
    heading: "2024 BMW X5 xDrive40i with Highway Assistant",
    price: 59_000,
    miles: 15_000,
    inventory_type: "used",
    vdp_url: "https://dealer.example/x5-summary-hit",
    dist: 25,
    media: { photo_links: ["https://images.example/x5-hit.jpg"] },
    build: { year: 2024, make: "BMW", model: "X5", trim: "xDrive40i", transmission: "Automatic" },
  }];
  const result = await runMarketCheckAdapter({
    searches: [family],
    apiKey: "test-key",
    minimumIntervalMs: 0,
    detailFetchLimit: 1,
    fetchImpl: async (url) => {
      if (url.pathname.startsWith("/v2/listing/car/")) {
        detailIds.push(decodeURIComponent(url.pathname.split("/").pop()));
        return new Response(JSON.stringify({
          extra: { features: ["Highway Assistant"] },
          build: { body_type: "SUV", seating_capacity: 5 },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ listings }), { status: 200 });
    },
  });

  assert.deepEqual(detailIds, ["mc-x5-summary-hit"]);
  const upgraded = result.offers.find((offer) => offer.sourceListingId === "mc-x5-summary-hit");
  const deferred = result.offers.find((offer) => offer.sourceListingId === "mc-x5-cheap-plain");
  assert.equal(upgraded.enrichmentStatus, "enriched");
  assert.equal(upgraded.featureEvidence[0].status, "confirmed");
  assert.equal(deferred.enrichmentStatus, "budget_deferred");
});
