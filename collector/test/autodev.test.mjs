import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAutoDevGroups,
  buildAutoDevUrl,
  normalizeAutoDevListing,
  runAutoDevAdapter,
} from "../src/adapters/autodev.mjs";

const search = {
  id: "search-used-r1s",
  name: "Used Rivian R1S",
  offerKind: "used",
  make: "Rivian",
  model: "R1S",
  aliases: [],
  trim: null,
  zip: "10001",
  radiusMiles: 250,
  transmission: "automatic",
  yearMin: 2022,
  yearMax: 2026,
  maxPrice: 70_000,
  maxMileage: 80_000,
  profile: "family_ev",
  garageGroup: "ev",
  powertrainCategory: "ev",
  desiredFeatures: ["hands_free_highway", "third_row"],
  requiredFeatures: [],
  active: true,
};

const providerListing = {
  "@id": "https://api.auto.dev/listings/7PDSGABL5SN000001",
  vin: "7PDSGABL5SN000001",
  location: [-75.2, 40.1],
  vehicle: {
    vin: "7PDSGABL5SN000001",
    year: 2025,
    make: "Rivian",
    model: "R1S",
    trim: "Dual Motor",
    drivetrain: "AWD",
    engine: "Electric",
    fuel: "Electric",
    transmission: "Automatic",
    seats: 7,
  },
  retailListing: {
    vdp: "https://dealer.example/used/rivian-r1s-1?utm_source=auto.dev",
    price: 64_500,
    miles: 18_000,
    used: true,
    cpo: false,
    dealerId: "dealer-1",
    dealer: "Example Rivian",
    city: "Princeton",
    state: "NJ",
    zip: "08540",
    primaryImage: "https://retail.photos.vin/7PDSGABL5SN000001-1.jpg",
    photoCount: 12,
  },
};

test("builds a bounded Auto.dev inventory query without putting credentials in the URL", () => {
  const groups = buildAutoDevGroups([
    search,
    { ...search, id: "search-r1t", model: "R1T", priority: 20 },
  ]);
  assert.equal(groups.length, 1);
  const url = buildAutoDevUrl(groups[0], { limit: 20, maximumRadiusMiles: 200 });
  assert.equal(url.origin + url.pathname, "https://api.auto.dev/listings");
  assert.equal(url.searchParams.get("vehicle.make"), "Rivian");
  assert.equal(url.searchParams.get("vehicle.model"), "R1S,R1T");
  assert.equal(url.searchParams.get("vehicle.year"), "2022-2026");
  assert.equal(url.searchParams.get("retailListing.price"), "1-70000");
  assert.equal(url.searchParams.get("retailListing.miles"), "0-80000");
  assert.equal(url.searchParams.get("retailListing.used"), "true");
  assert.equal(url.searchParams.get("vehicle.transmission"), "automatic");
  assert.equal(url.searchParams.get("zip"), "10001");
  assert.equal(url.searchParams.get("distance"), "200");
  assert.equal(url.searchParams.get("limit"), "20");
  assert.equal(url.searchParams.get("sort"), "updatedAt.desc");
  assert.equal(url.toString().includes("key"), false);
});

test("normalizes an authorized Auto.dev listing with a real photo and computed distance", () => {
  const candidate = normalizeAutoDevListing(providerListing, search, new Date("2026-08-10T12:00:00.000Z"), {
    zipLookup: () => ({ latitude: 40, longitude: -75 }),
  });

  assert.ok(candidate);
  assert.equal(candidate.source, "auto_dev");
  assert.equal(candidate.sourceMethod, "api");
  assert.equal(candidate.offerRole, "active_offer");
  assert.equal(candidate.sourceListingId, "7PDSGABL5SN000001:dealer-1");
  assert.equal(candidate.url, "https://dealer.example/used/rivian-r1s-1");
  assert.equal(candidate.primaryImageUrl, providerListing.retailListing.primaryImage);
  assert.equal(candidate.imageUrls.length, 1);
  assert.equal(candidate.price, 64_500);
  assert.equal(candidate.mileage, 18_000);
  assert.ok(candidate.distanceMiles > 10 && candidate.distanceMiles < 20);
  assert.equal(candidate.seatingCapacity, 7);
  assert.equal(candidate.familyFitScore > 0, true);
  assert.equal(JSON.stringify(candidate).includes("auto.dev"), false);
});

test("rejects drift, HTTP dealer links, photo-less records, and out-of-radius results", () => {
  const options = { zipLookup: () => ({ latitude: 40, longitude: -75 }) };
  assert.equal(normalizeAutoDevListing({ ...providerListing, retailListing: { ...providerListing.retailListing, price: 70_001 } }, search, new Date(), options), null);
  assert.equal(normalizeAutoDevListing({ ...providerListing, vehicle: { ...providerListing.vehicle, model: "R1T" } }, search, new Date(), options), null);
  assert.equal(normalizeAutoDevListing({ ...providerListing, retailListing: { ...providerListing.retailListing, vdp: "http://dealer.example/r1s" } }, search, new Date(), options), null);
  assert.equal(normalizeAutoDevListing({ ...providerListing, retailListing: { ...providerListing.retailListing, primaryImage: null } }, search, new Date(), options), null);
  assert.equal(normalizeAutoDevListing({ ...providerListing, location: [-80, 45] }, search, new Date(), options), null);
});

test("uses a bearer token, reports provider health, and never returns the API envelope", async () => {
  let authorization = null;
  const result = await runAutoDevAdapter({
    searches: [search],
    apiKey: "test-api-key",
    maximumRadiusMiles: 250,
    minimumIntervalMs: 0,
    zipLookup: () => ({ latitude: 40, longitude: -75 }),
    fetchImpl: async (_url, init) => {
      authorization = init.headers.Authorization;
      return new Response(JSON.stringify({ data: [providerListing], links: { self: "/listings" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(authorization, "Bearer test-api-key");
  assert.equal(result.offers.length, 1);
  assert.equal(result.run.source, "auto_dev");
  assert.equal(result.run.status, "success");
  assert.equal(result.run.searchedCount, 1);
  assert.equal(result.run.discoveredCount, 1);
  assert.equal(result.run.acceptedCount, 1);
});

test("fails closed without an API credential or resolvable search ZIP", async () => {
  let requested = false;
  const missing = await runAutoDevAdapter({
    searches: [search],
    apiKey: null,
    fetchImpl: async () => { requested = true; throw new Error("must not run"); },
  });
  assert.equal(requested, false);
  assert.equal(missing.run.status, "unavailable");
  assert.equal(missing.run.messageCode, "credential_missing");

  const badZip = await runAutoDevAdapter({
    searches: [search],
    apiKey: "test-api-key",
    zipLookup: () => undefined,
    fetchImpl: async () => { requested = true; throw new Error("must not run"); },
  });
  assert.equal(requested, false);
  assert.equal(badZip.run.status, "unavailable");
  assert.equal(badZip.run.messageCode, "zip_coordinates_unavailable");
});

test("emits a match for every owned search that accepts the same Auto.dev vehicle", async () => {
  const result = await runAutoDevAdapter({
    searches: [{ ...search, id: "owner-one-r1s" }, { ...search, id: "owner-two-r1s" }],
    apiKey: "test-api-key",
    minimumIntervalMs: 0,
    zipLookup: () => ({ latitude: 40, longitude: -75 }),
    fetchImpl: async () => new Response(JSON.stringify({ data: [providerListing] }), { status: 200 }),
  });

  assert.deepEqual(result.offers.map((offer) => offer.searchId).sort(), ["owner-one-r1s", "owner-two-r1s"]);
  assert.equal(new Set(result.offers.map((offer) => offer.sourceListingId)).size, 1);
});
