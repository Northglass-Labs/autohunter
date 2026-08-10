import test from "node:test";
import assert from "node:assert/strict";
import { buildAutoTempestUrl, loadConfig, mergeRemoteSearchConfig, validateConfig } from "../src/config.mjs";

const config = {
  version: 1,
  search: {
    condition: "used",
    zip: "10001",
    radiusMiles: 150,
    maxPrice: 15_000,
    maxMileage: 120_000,
    transmission: "manual",
    models: [
      {
        make: "Mazda",
        model: "MX-5 Miata",
        aliases: ["Miata", "MX-5"],
        sourceIds: { autotempest: "mx5miata" },
      },
    ],
  },
  collector: {
    includeAuctions: false,
    maxCandidatesPerModel: 5,
    minimumIntervalMs: 6_000,
    syncWatchModels: true,
  },
};

test("validates a standalone used-car search profile", () => {
  assert.deepEqual(validateConfig(config), config);
});

test("builds an AutoTempest URL with every hard filter", () => {
  const url = new URL(buildAutoTempestUrl(config, config.search.models[0]));

  assert.equal(url.origin, "https://www.autotempest.com");
  assert.equal(url.pathname, "/results");
  assert.equal(url.searchParams.get("make"), "mazda");
  assert.equal(url.searchParams.get("model"), "mx5miata");
  assert.equal(url.searchParams.get("zip"), "10001");
  assert.equal(url.searchParams.get("radius"), "150");
  assert.equal(url.searchParams.get("maxprice"), "15000");
  assert.equal(url.searchParams.get("maxmiles"), "120000");
  assert.equal(url.searchParams.get("transmission"), "man");
});

test("rejects unsupported new-car collection without implying coverage", () => {
  assert.throws(
    () => validateConfig({ ...config, search: { ...config.search, condition: "new" } }),
    /used-car adapter/i,
  );
});

test("merges the protected dashboard watchlist and policy into a collector profile", () => {
  const merged = mergeRemoteSearchConfig(config, {
    condition: "used",
    zip: "19103",
    radiusMiles: 75,
    maxPrice: 20_000,
    maxMileage: 80_000,
    transmission: "manual",
    models: [
      { make: "Mazda", model: "MX-5 Miata", aliases: ["Miata"] },
      { make: "Toyota", model: "GR86", aliases: [] },
    ],
  });

  assert.equal(merged.search.zip, "19103");
  assert.equal(merged.search.maxPrice, 20_000);
  assert.equal(merged.search.models.length, 2);
  assert.equal(merged.search.models[0].sourceIds.autotempest, "mx5miata");
  assert.equal(merged.search.models[1].model, "GR86");
});

test("ships Porsche 944 and 944 Turbo fallbacks using AutoTempest's supported 944 family filter", async () => {
  const example = await loadConfig(new URL("../config.example.json", import.meta.url));
  const porscheModels = example.search.models.filter((model) => model.make === "Porsche");

  assert.deepEqual(porscheModels.map((model) => model.model), ["944", "944 Turbo"]);
  assert.deepEqual(porscheModels.map((model) => model.sourceIds.autotempest), ["944", "944"]);
  assert.ok(porscheModels[1].aliases.includes("951"));
});
