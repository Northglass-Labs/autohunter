import test from "node:test";
import assert from "node:assert/strict";
import { FAMILY_VEHICLE_TARGETS, inferVehicleIntelligence } from "../src/vehicle-intelligence.mjs";
import { buildMarketCheckGroups, buildMarketCheckUrl, normalizeMarketCheckListing } from "../src/adapters/marketcheck.mjs";
import { buildAutoDevGroups, buildAutoDevUrl, normalizeAutoDevListing } from "../src/adapters/autodev.mjs";

const search = () => FAMILY_VEHICLE_TARGETS.find((item) => item.model === "S-Class" && item.trim === "S 580");
const car = { make: "Mercedes-Benz", model: "S-Class", trim: "S 580 4MATIC", year: 2021, bodyStyle: "Sedan" };
const mc = { id: "w223-example", vin: "W1K6G7GB1MA000001", price: 39900, miles: 90000, dist: 42, inventory_type: "used",
  vdp_url: "https://dealer.example/s580", media: { photo_links: ["https://images.example/s580.jpg"] },
  build: { ...car, body_type: "Sedan", transmission: "Automatic", fuel_type: "Gasoline" } };
const ad = { vehicle: { ...car, vin: mc.vin, transmission: "Automatic", fuel: "Gasoline" },
  location: [-75, 40], retailListing: { vdp: mc.vdp_url, primaryImage: mc.media.photo_links[0], price: mc.price,
    miles: mc.miles, used: true, zip: "10001" } };
const auto = (listing) => normalizeAutoDevListing(listing, search(), new Date(), { zipLookup: () => ({ latitude: 40, longitude: -75 }) });

test("S580 targets the actual W223 model years at $40k without W222-only options", () => {
  const target = search();
  assert.ok(target, "S580 preset exists");
  assert.equal(target.yearMin, 2021);
  assert.equal(target.yearMax, 2025);
  assert.equal(target.maxPrice, 40000);
  assert.equal(target.maxMileage, 120000);
  assert.equal(target.bodyStyle, "sedan");
  assert.equal(target.garageGroup, "gas");
  assert.equal(target.powertrainCategory, "any");
  assert.deepEqual(target.requiredFeatures, []);
  assert.ok(target.desiredFeatures.includes("rear_axle_steering"));
  for (const key of ["magic_body_control", "burmester_3d", "warmth_comfort"]) assert.ok(!target.desiredFeatures.includes(key));
  const evidence = inferVehicleIntelligence(car, target).featureEvidence;
  assert.ok(evidence.every((item) => item.status === "unknown"));
});

test("S580 gets a separate bounded query while W222 variants continue sharing", () => {
  const w222 = FAMILY_VEHICLE_TARGETS.filter((item) => ["S 450", "S 560"].includes(item.trim));
  assert.ok(search());
  for (const group of [buildMarketCheckGroups, buildAutoDevGroups]) {
    const groups = group([...w222, search()]);
    assert.equal(groups.length, 2);
    assert.equal(groups.find((item) => item.searches[0].yearMin === 2018).searches.length, 2);
    const s580 = groups.find((item) => item.searches[0].trim === "S 580");
    assert.equal(s580.searches.length, 1);
    assert.equal(buildMarketCheckUrl(s580, { apiKey: "fixture" }).searchParams.get("year_range"), "2021-2025");
    assert.equal(buildMarketCheckUrl(s580, { apiKey: "fixture" }).searchParams.get("trim"), "S 580,S580,S 580 4MATIC,S580 4MATIC");
    assert.equal(buildAutoDevUrl(s580).searchParams.get("vehicle.year"), "2021-2025");
  }
});

test("S580 normalization accepts gasoline and mild-hybrid descriptions but rejects wrong trims and hard limits", () => {
  assert.ok(search());
  for (const year of [2021, 2022, 2023, 2024, 2025]) {
    for (const trim of ["S580", "S 580 4MATIC"]) {
      for (const fuel of ["Gasoline", "Gas/Electric Mild Hybrid", "MHEV"]) {
        assert.ok(normalizeMarketCheckListing({ ...mc, build: { ...mc.build, year, trim, fuel_type: fuel } }, search()));
        assert.ok(auto({ ...ad, vehicle: { ...ad.vehicle, year, trim, fuel } }));
      }
    }
  }
  for (const change of [{ trim: "S580e" }, { trim: "S 580 e" }, { trim: "S500" }, { trim: null },
    { year: 2020 }, { year: 2026 }, { bodyStyle: "Coupe", body_type: "Coupe" }]) {
    assert.equal(normalizeMarketCheckListing({ ...mc, build: { ...mc.build, ...change } }, search()), null);
    assert.equal(auto({ ...ad, vehicle: { ...ad.vehicle, ...change } }), null);
  }
  assert.equal(normalizeMarketCheckListing({ ...mc, price: 40001 }, search()), null);
  assert.equal(auto({ ...ad, retailListing: { ...ad.retailListing, price: 40001 } }), null);
  assert.equal(normalizeMarketCheckListing({ ...mc, miles: 120001 }, search()), null);
  assert.equal(auto({ ...ad, retailListing: { ...ad.retailListing, miles: 120001 } }), null);
});
