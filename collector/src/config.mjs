import { readFile } from "node:fs/promises";

function assertInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
}

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
}

export function sourceSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("config must be an object");
  }
  if (config.version !== 1) throw new Error("config.version must be 1");
  const { search, collector } = config;
  if (!search || !collector) throw new Error("search and collector sections are required");
  if (search.condition !== "used") {
    throw new Error("the current AutoTempest adapter is a used-car adapter; new inventory is not implemented yet");
  }
  assertText(search.zip, "search.zip");
  if (!/^\d{5}$/.test(search.zip)) throw new Error("search.zip must be a five-digit US ZIP code");
  assertInteger(search.radiusMiles, "search.radiusMiles", { min: 1, max: 500 });
  assertInteger(search.maxPrice, "search.maxPrice", { min: 1, max: 1_000_000 });
  assertInteger(search.maxMileage, "search.maxMileage", { min: 0, max: 1_000_000 });
  if (search.transmission !== "manual") {
    throw new Error("the current photo-verification policy requires search.transmission to be manual");
  }
  if (!Array.isArray(search.models) || search.models.length === 0) {
    throw new Error("search.models must contain at least one make/model");
  }
  for (const [index, model] of search.models.entries()) {
    assertText(model?.make, `search.models[${index}].make`);
    assertText(model?.model, `search.models[${index}].model`);
    if (model.aliases !== undefined && (!Array.isArray(model.aliases) || model.aliases.some((alias) => typeof alias !== "string"))) {
      throw new Error(`search.models[${index}].aliases must be an array of strings`);
    }
  }
  if (typeof collector.includeAuctions !== "boolean") {
    throw new Error("collector.includeAuctions must be a boolean");
  }
  if (typeof collector.syncWatchModels !== "boolean") {
    throw new Error("collector.syncWatchModels must be a boolean");
  }
  assertInteger(collector.maxCandidatesPerModel, "collector.maxCandidatesPerModel", { min: 1, max: 25 });
  assertInteger(collector.minimumIntervalMs, "collector.minimumIntervalMs", { min: 1_000, max: 300_000 });
  return config;
}

export function mergeRemoteSearchConfig(config, remoteSearch) {
  const localModels = new Map(
    config.search.models.map((model) => [`${model.make}\u0000${model.model}`.toLowerCase(), model]),
  );
  const models = (remoteSearch?.models ?? []).map((model) => {
    const local = localModels.get(`${model.make}\u0000${model.model}`.toLowerCase());
    return {
      make: model.make,
      model: model.model,
      aliases: Array.isArray(model.aliases) ? model.aliases : [],
      ...(local?.sourceIds ? { sourceIds: local.sourceIds } : {}),
    };
  });
  return validateConfig({
    ...config,
    search: {
      condition: remoteSearch.condition,
      zip: remoteSearch.zip,
      radiusMiles: remoteSearch.radiusMiles,
      maxPrice: remoteSearch.maxPrice,
      maxMileage: remoteSearch.maxMileage,
      transmission: remoteSearch.transmission,
      models,
    },
  });
}

export async function loadConfig(path) {
  return validateConfig(JSON.parse(await readFile(path, "utf8")));
}

export function buildAutoTempestUrl(config, model) {
  const url = new URL("https://www.autotempest.com/results");
  const params = {
    make: model.sourceIds?.autotempestMake ?? sourceSlug(model.make),
    model: model.sourceIds?.autotempest ?? sourceSlug(model.model),
    zip: config.search.zip,
    radius: String(config.search.radiusMiles),
    maxprice: String(config.search.maxPrice),
    maxmiles: String(config.search.maxMileage),
    transmission: "man",
  };
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}
