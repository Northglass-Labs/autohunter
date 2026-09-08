import { readFile } from "node:fs/promises";
import { FEATURE_KEYS } from "./vehicle-intelligence.mjs";

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer between ${min} and ${max}`);
}

function text(value, label, { nullable = false, max = 200 } = {}) {
  if (nullable && (value === null || value === undefined)) return;
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} must be non-empty text of at most ${max} characters`);
}

function optionalInteger(value, label, options) {
  integer(value, label, { ...options, nullable: true });
}

function textArray(value, label, { maxItems = 20, maxLength = 150, allowed = null } = {}) {
  if (value === null || value === undefined) return;
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label} must be an array of at most ${maxItems} values`);
  value.forEach((item, index) => {
    text(item, `${label}[${index}]`, { max: maxLength });
    if (allowed && !allowed.includes(item)) throw new Error(`${label}[${index}] is unsupported`);
  });
}

function validateSearch(search, index) {
  const label = `searches[${index}]`;
  text(search?.id, `${label}.id`, { max: 100 });
  text(search?.name, `${label}.name`, { max: 120 });
  if (!["used", "new", "lease"].includes(search?.offerKind)) throw new Error(`${label}.offerKind must be used, new, or lease`);
  text(search.make, `${label}.make`, { max: 100 });
  text(search.model, `${label}.model`, { max: 150 });
  text(search.trim, `${label}.trim`, { nullable: true, max: 150 });
  textArray(search.aliases, `${label}.aliases`, { maxItems: 20, maxLength: 150 });
  textArray(search.trimAliases, `${label}.trimAliases`, { maxItems: 20, maxLength: 150 });
  if (search.bodyStyle != null && !["sedan", "suv", "coupe", "convertible", "wagon", "hatchback", "truck", "van"].includes(search.bodyStyle)) {
    throw new Error(`${label}.bodyStyle is invalid`);
  }
  if (search.profile !== undefined && !["enthusiast", "family_ev", "family_gas", "lease", "general"].includes(search.profile)) {
    throw new Error(`${label}.profile is invalid`);
  }
  if (search.garageGroup !== undefined && !["ev", "gas", "lease", "enthusiast", "other"].includes(search.garageGroup)) {
    throw new Error(`${label}.garageGroup is invalid`);
  }
  if (search.powertrainCategory !== undefined && !["ev", "gas", "phev", "hybrid", "any"].includes(search.powertrainCategory)) {
    throw new Error(`${label}.powertrainCategory is invalid`);
  }
  optionalInteger(search.yearMin, `${label}.yearMin`, { min: 1980, max: 2100 });
  optionalInteger(search.yearMax, `${label}.yearMax`, { min: 1980, max: 2100 });
  if (search.yearMin !== null && search.yearMin !== undefined && search.yearMax !== null && search.yearMax !== undefined && search.yearMin > search.yearMax) {
    throw new Error(`${label}.yearMin must not exceed yearMax`);
  }
  optionalInteger(search.targetPrice, `${label}.targetPrice`, { min: 1, max: 10_000_000 });
  textArray(search.desiredFeatures, `${label}.desiredFeatures`, { maxItems: FEATURE_KEYS.length, maxLength: 50, allowed: FEATURE_KEYS });
  textArray(search.requiredFeatures, `${label}.requiredFeatures`, { maxItems: FEATURE_KEYS.length, maxLength: 50, allowed: FEATURE_KEYS });
  text(search.rationale, `${label}.rationale`, { nullable: true, max: 500 });
  optionalInteger(search.priority, `${label}.priority`, { min: 0, max: 100 });
  if (!["any", "manual", "automatic"].includes(search.transmission ?? "any")) throw new Error(`${label}.transmission is invalid`);
  if (typeof search.active !== "boolean") throw new Error(`${label}.active must be a boolean`);
  if (search.offerKind === "lease") {
    text(search.region, `${label}.region`, { max: 150 });
    text(search.zip, `${label}.zip`, { max: 5 });
    if (!/^\d{5}$/.test(search.zip)) throw new Error(`${label}.zip must be a five-digit US ZIP code`);
    optionalInteger(search.maxEffectiveMonthly, `${label}.maxEffectiveMonthly`, { min: 1, max: 100_000 });
    optionalInteger(search.maxDueAtSigning, `${label}.maxDueAtSigning`, { min: 0, max: 1_000_000 });
    optionalInteger(search.minAnnualMiles, `${label}.minAnnualMiles`, { min: 1_000, max: 100_000 });
  } else {
    text(search.zip, `${label}.zip`, { max: 5 });
    if (!/^\d{5}$/.test(search.zip)) throw new Error(`${label}.zip must be a five-digit US ZIP code`);
    integer(search.radiusMiles, `${label}.radiusMiles`, { min: 1, max: 500 });
    optionalInteger(search.maxPrice, `${label}.maxPrice`, { min: 1, max: 10_000_000 });
    optionalInteger(search.maxMileage, `${label}.maxMileage`, { min: 0, max: 10_000_000 });
  }
}

export function validatePlatformConfig(config, { allowEmptySearches = false } = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("config must be an object");
  if (config.version !== 2) throw new Error("platform config.version must be 2");
  const minimumSearches = allowEmptySearches ? 0 : 1;
  if (!Array.isArray(config.searches) || config.searches.length < minimumSearches || config.searches.length > 100) {
    throw new Error(`searches must contain between ${minimumSearches} and 100 definitions`);
  }
  config.searches.forEach(validateSearch);
  if (!config.adapters || !config.collector) throw new Error("adapters and collector sections are required");
  if (typeof config.adapters.marketcheck?.enabled !== "boolean") throw new Error("adapters.marketcheck.enabled must be a boolean");
  integer(config.adapters.marketcheck?.rowsPerSearch, "adapters.marketcheck.rowsPerSearch", { min: 1, max: 50 });
  integer(config.adapters.marketcheck?.maximumRadiusMiles ?? 100, "adapters.marketcheck.maximumRadiusMiles", { min: 1, max: 500 });
  integer(config.adapters.marketcheck?.maximumSearchCalls ?? 13, "adapters.marketcheck.maximumSearchCalls", { min: 1, max: 50 });
  integer(config.adapters.marketcheck?.detailFetchLimit ?? 3, "adapters.marketcheck.detailFetchLimit", { min: 0, max: 20 });
  if (typeof config.adapters.autodev?.enabled !== "boolean") throw new Error("adapters.autodev.enabled must be a boolean");
  integer(config.adapters.autodev?.rowsPerSearch, "adapters.autodev.rowsPerSearch", { min: 1, max: 20 });
  integer(config.adapters.autodev?.maximumRadiusMiles ?? 250, "adapters.autodev.maximumRadiusMiles", { min: 1, max: 500 });
  integer(config.adapters.autodev?.maximumSearchCalls ?? 13, "adapters.autodev.maximumSearchCalls", { min: 1, max: 50 });
  if (typeof config.adapters.marketcheckIncentives?.enabled !== "boolean") throw new Error("adapters.marketcheckIncentives.enabled must be a boolean");
  integer(config.adapters.marketcheckIncentives?.rowsPerGroup, "adapters.marketcheckIncentives.rowsPerGroup", { min: 1, max: 10 });
  integer(config.adapters.marketcheckIncentives?.maximumSearchCalls ?? 13, "adapters.marketcheckIncentives.maximumSearchCalls", { min: 1, max: 50 });
  if (typeof config.adapters.nhtsa?.enabled !== "boolean") throw new Error("adapters.nhtsa.enabled must be a boolean");
  integer(config.adapters.nhtsa?.maximumModelGroups ?? 5, "adapters.nhtsa.maximumModelGroups", { min: 1, max: 25 });
  integer(config.adapters.nhtsa?.maximumVariantsPerGroup ?? 2, "adapters.nhtsa.maximumVariantsPerGroup", { min: 1, max: 5 });
  integer(config.adapters.nhtsa?.minimumIntervalMs ?? 500, "adapters.nhtsa.minimumIntervalMs", { min: 250, max: 30_000 });
  if (typeof config.adapters.leasehackr?.enabled !== "boolean") throw new Error("adapters.leasehackr.enabled must be a boolean");
  if (config.adapters.leasehackr.enabled || config.adapters.leasehackr.mode !== "manual_import") {
    throw new Error("adapters.leasehackr must remain disabled; current source terms permit manual import, not scheduled collection");
  }
  integer(config.collector.minimumIntervalMs, "collector.minimumIntervalMs", { min: 1_000, max: 300_000 });
  if (typeof config.collector.syncSavedSearches !== "boolean") throw new Error("collector.syncSavedSearches must be a boolean");
  return config;
}

export async function loadPlatformConfig(path) {
  return validatePlatformConfig(JSON.parse(await readFile(path, "utf8")));
}

export function mergeRemoteSavedSearches(config, remoteSearches) {
  if (!Array.isArray(remoteSearches)) throw new Error("collector config did not return saved searches");
  const local = new Map(config.searches.map((search) => [
    `${search.offerKind}\u0000${search.make}\u0000${search.model}`.toLowerCase(),
    search,
  ]));
  const searches = remoteSearches.map((search) => {
    const fallback = local.get(`${search.offerKind}\u0000${search.make}\u0000${search.model}`.toLowerCase());
    return {
      ...search,
      active: search.active !== false,
      ...(fallback?.sourceIds && !search.sourceIds ? { sourceIds: fallback.sourceIds } : {}),
    };
  });
  return validatePlatformConfig({ ...config, searches }, { allowEmptySearches: true });
}
