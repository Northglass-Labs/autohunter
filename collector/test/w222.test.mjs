import test from "node:test";
import assert from "node:assert/strict";
import { FAMILY_VEHICLE_TARGETS, inferVehicleIntelligence } from "../src/vehicle-intelligence.mjs";
import { buildMarketCheckGroups, normalizeMarketCheckListing } from "../src/adapters/marketcheck.mjs";
import { buildAutoDevGroups, normalizeAutoDevListing } from "../src/adapters/autodev.mjs";

const search = {
  id: "w222-s560", name: "S560 sedan under $25k", active: true, offerKind: "used",
  make: "Mercedes-Benz", model: "S-Class", trim: "S 560", trimAliases: ["S560"],
  bodyStyle: "sedan", yearMin: 2018, yearMax: 2020, maxPrice: 25000, maxMileage: 120000,
  zip: "10001", radiusMiles: 250, transmission: "automatic", powertrainCategory: "gas",
  desiredFeatures: ["apple_carplay", "android_auto", "adaptive_cruise_lane_centering", "surround_view",
    "ventilated_front_seats", "massaging_front_seats", "warmth_comfort", "amg_line", "burmester_3d", "magic_body_control"],
};
const car = { make: "Mercedes-Benz", model: "S-Class", trim: "S 560 4MATIC", year: 2019, bodyStyle: "Sedan" };
const states = (listing = car, detail = null) => Object.fromEntries(
  inferVehicleIntelligence(listing, search, detail).featureEvidence.map((feature) => [feature.key, feature]),
);

test("S560 and S450 value targets keep their years and expand to the $40k ceiling", () => {
  const targets = FAMILY_VEHICLE_TARGETS.filter((item) => item.model === "S-Class" && ["S 450", "S 560"].includes(item.trim));
  assert.equal(targets.length, 2);
  assert.deepEqual(targets.map((item) => item.trim).sort(), ["S 450", "S 560"]);
  for (const item of targets) {
    assert.equal(item.bodyStyle, "sedan");
    assert.equal(item.maxPrice, 40000);
    assert.equal(item.maxMileage, 120000);
    assert.equal(item.yearMin, 2018);
    assert.equal(item.yearMax, 2020);
    assert.ok(item.desiredFeatures.includes("adaptive_cruise_lane_centering"));
    assert.ok(item.desiredFeatures.includes("ventilated_front_seats"));
    assert.deepEqual(item.requiredFeatures, []);
  }
});

test("only factory smartphone integration is expected; optional W222 packages are not assumed", () => {
  for (const year of [2018, 2019, 2020]) {
    const evidence = states({ ...car, year });
    assert.equal(evidence.apple_carplay?.status, "expected");
    assert.equal(evidence.android_auto?.status, "expected");
    assert.equal(evidence.apple_carplay?.source, "model_rule");
    for (const key of search.desiredFeatures.slice(2)) assert.equal(evidence[key]?.status, "unknown", key);
  }
  for (const change of [{ year: 2017 }, { year: 2021 }, { bodyStyle: "Coupe" }, { bodyStyle: null }, { make: "BMW" }]) {
    assert.equal(states({ ...car, ...change }).apple_carplay?.status, "unknown");
  }
});

test("W222 package details confirm their actual content while summary packages stay expected", () => {
  const packages = ["Premium Package", "Driver Assistance Package", "Warmth & Comfort Package", "AMG Line Exterior"];
  const detail = states(car, { extra: { options_packages: packages } });
  const summary = states({ ...car, summaryTexts: packages });
  for (const key of ["adaptive_cruise_lane_centering", "surround_view", "ventilated_front_seats", "massaging_front_seats", "warmth_comfort", "amg_line"]) {
    assert.equal(detail[key]?.status, "confirmed", key);
    assert.equal(summary[key]?.status, "expected", key);
    assert.equal(summary[key]?.source, "provider_summary", key);
  }
  assert.equal(states({ ...car, year: 2017 }, { extra: { options_packages: packages } }).surround_view?.status, "unknown");
});

test("standard Burmester and generic assistance never become unicorn audio or lane centering", () => {
  const evidence = states(car, { extra: { features: ["Burmester Surround Sound", "Adaptive Cruise Control", "Lane Departure Warning"] } });
  assert.equal(evidence.burmester_3d?.status, "unknown");
  assert.equal(evidence.adaptive_cruise_lane_centering?.status, "unknown");
  assert.equal(states(car, { extra: { features: ["DISTRONIC PLUS", "Active Lane Keeping Assist"] } }).adaptive_cruise_lane_centering?.status, "unknown");
  assert.equal(states(car, { extra: { features: ["Burmester High-End 3D Surround Sound System"] } }).burmester_3d?.status, "confirmed");
});

test("negative and availability-only package text does not assert equipment", () => {
  for (const text of ["No Driver Assistance Package", "Driver Assistance Package not equipped", "Available with Driver Assistance Package", "Optional Driver Assistance Package", "Driver Assistance Package: false"]) {
    assert.equal(states(car, { extra: { options_packages: [text] } }).adaptive_cruise_lane_centering?.status, "unknown", text);
  }
});

test("Magic Body Control cannot be credited on 4MATIC or confused with MAGIC SKY CONTROL", () => {
  const detail = { extra: { features: ["MAGIC BODY CONTROL"] } };
  assert.equal(states(car, detail).magic_body_control?.status, "unknown");
  assert.equal(states({ ...car, trim: "S560", build: { drivetrain: "AWD" } }, detail).magic_body_control?.status, "unknown");
  assert.equal(states({ ...car, trim: "S560", build: { drivetrain: "RWD" } }, detail).magic_body_control?.status, "confirmed");
  assert.equal(states({ ...car, year: 2020, trim: "S450", build: { body_type: "Sedan", drivetrain: "RWD" } }, detail).magic_body_control?.status, "unknown");
  assert.equal(states({ ...car, year: 2019, trim: "S450", build: { body_type: "Sedan", drivetrain: "RWD" } }, detail).magic_body_control?.status, "unknown");
  assert.equal(states({ ...car, trim: "S560" }, { extra: { features: ["MAGIC SKY CONTROL"] } }).magic_body_control?.status, "unknown");
});

test("both providers give bounded body-style searches their own query group", () => {
  const eqs = { ...search, id: "eqs", model: "EQS", trim: null, bodyStyle: null, yearMin: 2022, maxPrice: 70000 };
  const s450 = { ...search, id: "s450", trim: "S 450" };
  for (const group of [buildMarketCheckGroups, buildAutoDevGroups]) {
    const groups = group([eqs, search, s450]);
    assert.equal(groups.length, 2);
    assert.equal(groups.find((item) => item.searches.some((entry) => entry.id === search.id)).searches.length, 2);
  }
});

const mc = {
  id: "w222-example", vin: "WDDUG8FB0JA000001", price: 23900, miles: 90000, dist: 42,
  inventory_type: "used", vdp_url: "https://dealer.example/s560", media: { photo_links: ["https://images.example/s560.jpg"] },
  build: { ...car, body_type: "Sedan", transmission: "Automatic" },
};
const ad = {
  vehicle: { ...car, vin: mc.vin, transmission: "Automatic", fuel: "Gasoline" },
  location: [-75, 40], retailListing: { vdp: mc.vdp_url, primaryImage: mc.media.photo_links[0], price: mc.price, miles: mc.miles, used: true, zip: "10001" },
};
const auto = (listing) => normalizeAutoDevListing(listing, search, new Date(), { zipLookup: () => ({ latitude: 40, longitude: -75 }) });

test("URL-shaped dealer headings fall back to the actual vehicle identity", () => {
  for (const heading of [mc.vdp_url, "www.dealer.example/inventory/s560", "   "]) {
    assert.equal(normalizeMarketCheckListing({ ...mc, heading }, search).title, "2019 Mercedes-Benz S-Class S 560 4MATIC");
  }
  assert.equal(normalizeMarketCheckListing({ ...mc, heading: "Used 2019 Mercedes-Benz S560" }, search).title, "Used 2019 Mercedes-Benz S560");
});

test("normalization accepts both S560 spellings and rejects hybrids, coupes, unknown body and hard-bound violations", () => {
  for (const trim of ["S560", "S 560", "S560 4MATIC", "S 560 4MATIC"]) {
    assert.ok(normalizeMarketCheckListing({ ...mc, build: { ...mc.build, trim } }, search), trim);
    assert.ok(auto({ ...ad, vehicle: { ...ad.vehicle, trim } }), trim);
  }
  for (const trim of ["S560e", "S 560 e", "S 550", "AMG S 63", null]) {
    assert.equal(normalizeMarketCheckListing({ ...mc, build: { ...mc.build, trim } }, search), null, trim);
    assert.equal(auto({ ...ad, vehicle: { ...ad.vehicle, trim } }), null, trim);
  }
  for (const bodyStyle of ["Coupe", "Convertible", null]) {
    assert.equal(normalizeMarketCheckListing({ ...mc, build: { ...mc.build, body_type: bodyStyle, bodyStyle } }, search), null);
    assert.equal(auto({ ...ad, vehicle: { ...ad.vehicle, bodyStyle } }), null);
  }
  for (const year of [2017, 2021]) {
    assert.equal(normalizeMarketCheckListing({ ...mc, build: { ...mc.build, year } }, search), null);
    assert.equal(auto({ ...ad, vehicle: { ...ad.vehicle, year } }), null);
  }
  assert.equal(normalizeMarketCheckListing({ ...mc, price: 25001 }, search), null);
  assert.equal(auto({ ...ad, retailListing: { ...ad.retailListing, price: 25001 } }), null);
  assert.equal(normalizeMarketCheckListing({ ...mc, miles: 120001 }, search), null);
  assert.equal(auto({ ...ad, retailListing: { ...ad.retailListing, miles: 120001 } }), null);
});
