import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNhtsaRatingDetailUrl,
  buildNhtsaRatingsUrl,
  buildNhtsaRecallsUrl,
  enrichNhtsaSafety,
} from "../src/enrichers/nhtsa.mjs";

const offers = [{
  offerKind: "used",
  source: "marketcheck",
  sourceListingId: "x5-one",
  searchId: "search-one",
  url: "https://dealer.example/x5-one",
  vin: "5UX23EU05R9000001",
  year: 2024,
  make: "BMW",
  model: "X5",
  title: "2024 BMW X5 xDrive40i",
  price: 58_000,
  mileage: 18_000,
  distanceMiles: 20,
  location: "Example City, NY",
  imageUrls: ["https://images.example/x5.jpg"],
  manualEvidence: [],
}, {
  offerKind: "used",
  source: "auto_dev",
  sourceListingId: "x5-two",
  searchId: "search-two",
  url: "https://dealer.example/x5-two",
  vin: "5UX33EU00R9000002",
  year: 2024,
  make: "BMW",
  model: "X5",
  title: "2024 BMW X5 xDrive40i",
  price: 57_000,
  mileage: 21_000,
  distanceMiles: 30,
  location: "Example City, NY",
  imageUrls: ["https://images.example/x5-two.jpg"],
  manualEvidence: [],
}];

test("builds only official bounded model-level NHTSA URLs", () => {
  const vehicle = { year: 2024, make: "BMW", model: "X5" };
  const recalls = buildNhtsaRecallsUrl(vehicle);
  const ratings = buildNhtsaRatingsUrl(vehicle);
  const detail = buildNhtsaRatingDetailUrl(19227);

  assert.equal(recalls.origin, "https://api.nhtsa.gov");
  assert.equal(recalls.pathname, "/recalls/recallsByVehicle");
  assert.equal(recalls.searchParams.get("make"), "BMW");
  assert.equal(recalls.searchParams.get("modelYear"), "2024");
  assert.equal(ratings.pathname, "/SafetyRatings/modelyear/2024/make/BMW/model/X5");
  assert.equal(detail.pathname, "/SafetyRatings/VehicleId/19227");
  assert.equal(recalls.searchParams.has("vin"), false);
});

test("shares conservative NHTSA ratings and model-year recall campaigns across matching offers", async () => {
  const requests = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    requests.push(url.toString());
    if (url.pathname === "/recalls/recallsByVehicle") return jsonResponse({
      Count: 2,
      results: [{
        NHTSACampaignNumber: "23V471000",
        Component: "AIR BAGS:KNEE BOLSTER",
        ReportReceivedDate: "10/07/2023",
        Summary: "This long source narrative must never be persisted.",
      }, {
        NHTSACampaignNumber: "24V608000",
        Component: "ELECTRICAL SYSTEM",
        ReportReceivedDate: "08/15/2024",
      }],
    });
    if (url.pathname.includes("/model/X5")) return jsonResponse({ Count: 2, Results: [
      { VehicleId: 19227, VehicleDescription: "2024 BMW X5 SUV AWD" },
      { VehicleId: 19226, VehicleDescription: "2024 BMW X5 SUV RWD" },
    ] });
    if (url.pathname.endsWith("/19227")) return jsonResponse({ Results: [{
      VehicleDescription: "2024 BMW X5 SUV AWD",
      OverallRating: "4",
      OverallFrontCrashRating: "4",
      OverallSideCrashRating: "5",
      RolloverRating: "4",
    }] });
    if (url.pathname.endsWith("/19226")) return jsonResponse({ Results: [{
      VehicleDescription: "2024 BMW X5 SUV RWD",
      OverallRating: "5",
      OverallFrontCrashRating: "5",
      OverallSideCrashRating: "5",
      RolloverRating: "4",
    }] });
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await enrichNhtsaSafety({
    offers,
    fetchImpl,
    maximumModelGroups: 5,
    maximumVariantsPerGroup: 2,
    minimumIntervalMs: 0,
  });

  assert.equal(requests.length, 4);
  assert.equal(result.run.source, "nhtsa");
  assert.equal(result.run.status, "success");
  assert.equal(result.run.searchedCount, 1);
  assert.equal(result.run.acceptedCount, 2);
  assert.equal(result.offers[0].safetyEvidence.overallRating, 4);
  assert.equal(result.offers[0].safetyEvidence.sideCrashRating, 5);
  assert.equal(result.offers[0].safetyEvidence.recallCampaignCount, 2);
  assert.equal(result.offers[0].safetyEvidence.availableVariantCount, 2);
  assert.equal(result.offers[0].safetyEvidence.testedVariantCount, 2);
  assert.deepEqual(result.offers[0].safetyEvidence.recallCampaigns[0], {
    campaignNumber: "23V471000",
    component: "AIR BAGS:KNEE BOLSTER",
    reportReceivedDate: "2023-10-07",
  });
  assert.equal(JSON.stringify(result.offers).includes("long source narrative"), false);
  assert.deepEqual(result.offers[0].safetyEvidence, result.offers[1].safetyEvidence);
});

test("reports untested vehicles honestly and caps model groups without dropping inventory", async () => {
  const secondModel = { ...offers[0], sourceListingId: "r1s", year: 2025, make: "Rivian", model: "R1S" };
  const result = await enrichNhtsaSafety({
    offers: [offers[0], secondModel],
    maximumModelGroups: 1,
    maximumVariantsPerGroup: 2,
    minimumIntervalMs: 0,
    fetchImpl: async (input) => {
      const url = new URL(input);
      if (url.pathname === "/recalls/recallsByVehicle") return jsonResponse({ Count: 0, results: [] });
      return jsonResponse({ Count: 0, Results: [] });
    },
  });

  assert.equal(result.offers.length, 2);
  assert.equal(result.offers[0].safetyEvidence.ratingStatus, "not_rated");
  assert.equal(result.offers[0].safetyEvidence.overallRating, null);
  assert.equal(result.offers[1].safetyEvidence, undefined);
  assert.equal(result.run.status, "success");
  assert.equal(result.run.messageCode, "model_query_capped_1of2");
});

test("contains a bounded API failure without losing provider offers", async () => {
  const result = await enrichNhtsaSafety({
    offers,
    minimumIntervalMs: 0,
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });

  assert.equal(result.offers.length, 2);
  assert.equal(result.offers[0].safetyEvidence, undefined);
  assert.equal(result.run.status, "failed");
  assert.equal(result.run.messageCode, "http_503");
});

test("accepts NHTSA's HTTP 400 empty-recall envelope without hiding available rating coverage", async () => {
  const result = await enrichNhtsaSafety({
    offers: [offers[0]],
    minimumIntervalMs: 0,
    fetchImpl: async (input) => {
      const url = new URL(input);
      if (url.pathname === "/recalls/recallsByVehicle") {
        return { ok: false, status: 400, json: async () => ({ Count: 0, Message: "Results returned successfully", results: [] }) };
      }
      return jsonResponse({ Count: 0, Results: [] });
    },
  });

  assert.equal(result.run.status, "success");
  assert.equal(result.offers[0].safetyEvidence.ratingStatus, "not_rated");
  assert.equal(result.offers[0].safetyEvidence.recallCampaignCount, 0);
});

function jsonResponse(value) {
  return { ok: true, status: 200, json: async () => value };
}
