import { inferVehicleIntelligence } from "../vehicle-intelligence.mjs";
import { readBoundedJson } from "../app-client.mjs";

const API_URL = "https://api.marketcheck.com/v2/search/car/active";
const DETAIL_URL = "https://api.marketcheck.com/v2/listing/car";

function boundedInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function boundedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.searchParams.delete("api_key");
    return url.toString();
  } catch {
    return null;
  }
}

function text(value, maxLength = 300) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function sourceRun(source, status, startedAt, counts, messageCode = null) {
  return {
    adapter: "marketcheck-inventory-v2",
    source,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    searchedCount: counts.searchedCount,
    discoveredCount: counts.discoveredCount,
    acceptedCount: counts.acceptedCount,
    messageCode,
  };
}

export function buildMarketCheckGroups(searches) {
  const groups = new Map();
  for (const search of searches.filter((candidate) => candidate.offerKind === "used" || candidate.offerKind === "new")) {
    const key = [
      search.offerKind,
      normalizedVehicleText(search.make),
      search.zip,
    ].join("\u0000");
    const existing = groups.get(key) ?? {
      offerKind: search.offerKind,
      make: search.make,
      zip: search.zip,
      searches: [],
    };
    existing.searches.push(search);
    groups.set(key, existing);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      transmission: new Set(group.searches.map((search) => search.transmission ?? "any")).size === 1
        ? (group.searches[0].transmission ?? "any")
        : "any",
      searches: [...group.searches].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0)
        || String(left.model).localeCompare(String(right.model))),
    }))
    .sort((left, right) => String(left.make).localeCompare(String(right.make))
      || String(left.offerKind).localeCompare(String(right.offerKind))
      || String(left.zip).localeCompare(String(right.zip)));
}

export function buildMarketCheckUrl(searchOrGroup, { apiKey, rows = 20, maximumRadiusMiles = 100 }) {
  const group = Array.isArray(searchOrGroup?.searches)
    ? searchOrGroup
    : {
        offerKind: searchOrGroup.offerKind,
        make: searchOrGroup.make,
        zip: searchOrGroup.zip,
        transmission: searchOrGroup.transmission ?? "any",
        searches: [searchOrGroup],
      };
  const searches = group.searches;
  const url = new URL(API_URL);
  const providerRadiusMiles = Math.max(1, Math.min(500, maximumRadiusMiles));
  const maximumRadius = Math.max(...searches.map((search) => search.radiusMiles));
  const maximumPrice = nullableMaximum(searches.map((search) => search.maxPrice));
  const maximumMileage = nullableMaximum(searches.map((search) => search.maxMileage));
  const minimumYear = nullableMinimum(searches.map((search) => search.yearMin));
  const maximumYear = nullableMaximum(searches.map((search) => search.yearMax));
  const models = [...new Set(searches.map((search) => search.model).filter(Boolean))];
  const params = {
    api_key: apiKey,
    country: "us",
    car_type: group.offerKind,
    make: group.make,
    model: models.join(","),
    zip: group.zip,
    radius: String(Math.min(maximumRadius, providerRadiusMiles)),
    rows: String(Math.max(1, Math.min(50, rows))),
    photo_links: "true",
    append_api_key: "false",
    min_photo_links: "1",
    has_price: "true",
    sort_by: "price",
    sort_order: "asc",
  };
  if (searches.length === 1 && searches[0].trim) params.trim = searches[0].trim;
  if (maximumPrice !== null) params.price_range = `0-${maximumPrice}`;
  if (group.offerKind === "used" && maximumMileage !== null) params.miles_range = `0-${maximumMileage}`;
  if (minimumYear !== null || maximumYear !== null) {
    params.year_range = `${minimumYear ?? 1886}-${maximumYear ?? 2100}`;
  }
  if (group.transmission === "manual") params.transmission = "Manual";
  else if (group.transmission === "automatic") params.transmission = "Automatic";
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(name, String(value));
  }
  return url;
}

export function buildMarketCheckDetailUrl(listingId, apiKey) {
  const id = text(listingId, 200);
  if (!id) throw new Error("MarketCheck listing detail requires an ID");
  const url = new URL(`${DETAIL_URL}/${encodeURIComponent(id)}`);
  url.searchParams.set("api_key", apiKey);
  return url;
}

function normalizedVehicleText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesRequestedVehicle(value, expected, aliases = []) {
  const actual = normalizedVehicleText(value);
  if (!actual) return false;
  return [expected, ...aliases].some((candidate) => {
    const normalized = normalizedVehicleText(candidate);
    return normalized && (actual === normalized || actual.includes(normalized) || normalized.includes(actual));
  });
}

function explicitlyConflictsWithTransmission(claim, requested) {
  const normalized = normalizedVehicleText(claim);
  if (!normalized || requested === "any") return false;
  if (requested === "manual") return /\b(automatic|cvt|dct|dual clutch)\b/.test(normalized);
  return /\b(manual|stick|[456] speed)\b/.test(normalized);
}

function explicitlyConflictsWithPowertrain(build, requested) {
  if (!requested || requested === "any") return false;
  const actual = normalizedVehicleText(`${build.powertrain_type ?? ""} ${build.fuel_type ?? ""}`);
  if (!actual) return false;
  const isElectric = /\b(bev|electric)\b/.test(actual) && !/hybrid/.test(actual);
  const isPhev = /\bphev\b|plug in hybrid/.test(actual);
  const isHybrid = /\b(hev|mhev|hybrid)\b/.test(actual) && !isPhev;
  if (requested === "ev") return !isElectric;
  if (requested === "phev") return !isPhev;
  if (requested === "hybrid") return !isHybrid;
  return isElectric || isPhev || isHybrid;
}

function hasVehicleIntelligence(search) {
  return Boolean(
    search.profile
    || search.garageGroup
    || search.powertrainCategory
    || search.desiredFeatures?.length
    || search.requiredFeatures?.length,
  );
}

export function normalizeMarketCheckListing(listing, search, now = new Date(), detail = null, intelligenceOptions = {}) {
  const build = listing?.build ?? {};
  const dealer = listing?.dealer ?? listing?.mc_dealership ?? {};
  const url = httpsUrl(listing?.vdp_url);
  const id = text(listing?.id, 200);
  const year = boundedInteger(build.year);
  const make = text(build.make, 100);
  const model = text(build.model, 150);
  const price = boundedInteger(listing?.price);
  const mileage = boundedInteger(listing?.miles) ?? (search.offerKind === "new" ? 0 : null);
  const distanceMiles = boundedNumber(listing?.dist);
  if (!url || !id || year === null || !make || !model || price === null || mileage === null || distanceMiles === null) return null;

  const imageUrls = [...new Set(
    (Array.isArray(listing?.media?.photo_links) ? listing.media.photo_links : [])
      .map(httpsUrl)
      .filter(Boolean),
  )].slice(0, 20);
  const city = text(dealer.city, 100);
  const state = text(dealer.state, 40);
  const location = [city, state].filter(Boolean).join(", ") || text(dealer.name, 200) || "Location unavailable";
  const inventoryType = listing.inventory_type === "new" ? "new" : "used";
  const condition = listing.is_certified === 1 ? "cpo" : inventoryType;
  const transmissionClaim = text(build.transmission, 200);
  if (
    inventoryType !== search.offerKind
    || !matchesRequestedVehicle(make, search.make)
    || !matchesRequestedVehicle(model, search.model, search.aliases)
    || (search.trim && !matchesRequestedVehicle(text(build.trim, 150), search.trim, search.trimAliases))
    || (search.yearMin !== null && search.yearMin !== undefined && year < search.yearMin)
    || (search.yearMax !== null && search.yearMax !== undefined && year > search.yearMax)
    || (search.maxPrice !== null && search.maxPrice !== undefined && price > search.maxPrice)
    || (search.maxMileage !== null && search.maxMileage !== undefined && mileage > search.maxMileage)
    || distanceMiles > search.radiusMiles
    || explicitlyConflictsWithTransmission(transmissionClaim, search.transmission)
    || explicitlyConflictsWithPowertrain(build, search.powertrainCategory)
    || imageUrls.length === 0
  ) return null;
  const requiresManualVerification = search.transmission === "manual";

  const candidate = {
    offerKind: inventoryType,
    condition,
    source: "marketcheck",
    originSource: text(listing.source, 200),
    sourceListingId: id,
    searchId: search.id,
    url,
    vin: text(listing.vin, 30),
    year,
    make,
    model,
    trim: text(build.trim, 150),
    title: text(listing.heading, 300) ?? `${year} ${make} ${model}`,
    price,
    mileage,
    distanceMiles,
    location,
    transmissionClaim,
    imageUrls,
    primaryImageUrl: imageUrls[0] ?? null,
    marketEstimate: null,
    msrp: boundedInteger(listing.msrp),
    sellerName: text(dealer.name, 200),
    requiresManualVerification,
    ...(requiresManualVerification ? {} : { manualEvidence: [] }),
    parseConfidence: 1,
    expiresAt: new Date(now.getTime() + 4 * 86_400_000).toISOString(),
  };
  if (hasVehicleIntelligence(search)) {
    Object.assign(candidate, inferVehicleIntelligence({ ...listing, ...candidate, build }, search, detail, intelligenceOptions));
  }
  return candidate;
}

export async function runMarketCheckAdapter({
  searches,
  apiKey = process.env.MARKETCHECK_API_KEY ?? null,
  rows = 50,
  maximumRadiusMiles = 100,
  maximumSearchCalls = 13,
  detailFetchLimit = 3,
  fetchImpl = fetch,
  minimumIntervalMs = 1_000,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const startedAt = new Date().toISOString();
  const relevant = searches.filter((search) => search.offerKind === "used" || search.offerKind === "new");
  const groups = buildMarketCheckGroups(relevant);
  const providerRadiusMiles = Math.max(1, Math.min(500, maximumRadiusMiles));
  const coverageCapped = relevant.some((search) => search.radiusMiles > providerRadiusMiles);
  const boundedSearchCalls = Math.max(1, Math.min(50, maximumSearchCalls));
  const scheduledGroups = groups.slice(0, boundedSearchCalls);
  const queryBudgetCapped = groups.length > scheduledGroups.length;
  const counts = { searchedCount: 0, discoveredCount: 0, acceptedCount: 0 };
  if (relevant.length === 0) return { offers: [], run: sourceRun("marketcheck", "empty", startedAt, counts, "no_matching_searches") };
  if (!apiKey) return { offers: [], run: sourceRun("marketcheck", "unavailable", startedAt, counts, "credential_missing") };

  const offers = [];
  const searchesById = new Map(relevant.map((search) => [search.id, search]));
  const seen = new Set();
  for (const [index, group] of scheduledGroups.entries()) {
    if (index > 0 && minimumIntervalMs > 0) await sleep(minimumIntervalMs);
    counts.searchedCount += 1;
    let response;
    try {
      response = await fetchImpl(buildMarketCheckUrl(group, { apiKey, rows, maximumRadiusMiles: providerRadiusMiles }), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return { offers, run: sourceRun("marketcheck", "failed", startedAt, { ...counts, acceptedCount: offers.length }, "network_error") };
    }
    if (!response.ok) {
      const messageCode = response.status === 401 || response.status === 403
        ? "credential_rejected"
        : response.status === 429 ? "rate_limited" : `http_${response.status}`;
      return { offers, run: sourceRun("marketcheck", response.status === 401 || response.status === 403 ? "unavailable" : "failed", startedAt, { ...counts, acceptedCount: offers.length }, messageCode) };
    }
    let payload;
    try {
      payload = await readBoundedJson(response, 4 * 1024 * 1024);
    } catch {
      return { offers, run: sourceRun("marketcheck", "failed", startedAt, { ...counts, acceptedCount: offers.length }, "invalid_json") };
    }
    const listings = Array.isArray(payload?.listings) ? payload.listings.slice(0, rows) : [];
    counts.discoveredCount += listings.length;
    for (const listing of listings) {
      for (const search of group.searches) {
        const normalized = normalizeMarketCheckListing(listing, search);
        const matchKey = normalized ? `${normalized.sourceListingId}\u0000${search.id}` : null;
        if (!normalized || seen.has(matchKey)) continue;
        seen.add(matchKey);
        offers.push(normalized);
      }
    }
  }

  // Spend the metered detail budget where it can change evidence: summary-expected features can
  // upgrade to confirmed, unknown features can still resolve, already-confirmed features gain nothing.
  const upgradeValue = (offer) => (offer.featureEvidence ?? [])
    .reduce((sum, feature) => sum + (feature.status === "expected" ? 2 : feature.status === "unknown" ? 1 : 0), 0);
  const enrichmentCandidates = offers
    .filter((offer) => hasVehicleIntelligence(searchesById.get(offer.searchId) ?? {}))
    .sort((left, right) => upgradeValue(right) - upgradeValue(left)
      || (searchesById.get(right.searchId)?.priority ?? 0) - (searchesById.get(left.searchId)?.priority ?? 0)
      || (left.price ?? Number.POSITIVE_INFINITY) - (right.price ?? Number.POSITIVE_INFINITY));
  const boundedDetailLimit = Math.max(0, Math.min(20, detailFetchLimit));
  const detailCache = new Map();
  let detailRequests = 0;
  for (const offer of enrichmentCandidates) {
    const search = searchesById.get(offer.searchId);
    const cached = detailCache.get(offer.sourceListingId);
    if (cached) {
      Object.assign(offer, inferVehicleIntelligence(offer, search, cached.detail, { enrichmentStatus: cached.status }));
      continue;
    }
    if (detailRequests >= boundedDetailLimit) {
      Object.assign(offer, inferVehicleIntelligence(offer, search, null, { enrichmentStatus: "budget_deferred" }));
      continue;
    }
    if ((counts.searchedCount > 0 || detailRequests > 0) && minimumIntervalMs > 0) await sleep(minimumIntervalMs);
    detailRequests += 1;
    let response;
    try {
      response = await fetchImpl(buildMarketCheckDetailUrl(offer.sourceListingId, apiKey), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        detailCache.set(offer.sourceListingId, { detail: null, status: "unavailable" });
        Object.assign(offer, inferVehicleIntelligence(offer, search, null, { enrichmentStatus: "unavailable" }));
        continue;
      }
      const detail = await readBoundedJson(response, 4 * 1024 * 1024);
      detailCache.set(offer.sourceListingId, { detail, status: "enriched" });
      Object.assign(offer, inferVehicleIntelligence(offer, search, detail, { enrichmentStatus: "enriched" }));
    } catch {
      detailCache.set(offer.sourceListingId, { detail: null, status: "failed" });
      Object.assign(offer, inferVehicleIntelligence(offer, search, null, { enrichmentStatus: "failed" }));
    }
  }

  counts.acceptedCount = offers.length;
  const messageCode = queryBudgetCapped
    ? `query_budget_capped_${scheduledGroups.length}of${groups.length}`
    : coverageCapped ? `radius_capped_${providerRadiusMiles}mi` : null;
  return {
    offers,
    run: sourceRun(
      "marketcheck",
      offers.length ? "success" : "empty",
      startedAt,
      counts,
      messageCode,
    ),
  };
}

function nullableMaximum(values) {
  const numbers = values.filter((value) => Number.isFinite(value)).map(Number);
  return numbers.length ? Math.max(...numbers) : null;
}

function nullableMinimum(values) {
  const numbers = values.filter((value) => Number.isFinite(value)).map(Number);
  return numbers.length ? Math.min(...numbers) : null;
}
