import { isIP } from "node:net";
import zipcodes from "zipcodes";
import { inferVehicleIntelligence } from "../vehicle-intelligence.mjs";
import { readBoundedJson } from "../app-client.mjs";

const API_URL = "https://api.auto.dev/listings";

export function buildAutoDevGroups(searches) {
  const groups = new Map();
  for (const search of searches.filter((candidate) => candidate.offerKind === "used" || candidate.offerKind === "new")) {
    const key = [search.offerKind, normalized(search.make), search.zip].join("\u0000");
    const group = groups.get(key) ?? {
      offerKind: search.offerKind,
      make: search.make,
      zip: search.zip,
      searches: [],
    };
    group.searches.push(search);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      transmission: new Set(group.searches.map((search) => search.transmission ?? "any")).size === 1
        ? group.searches[0].transmission ?? "any"
        : "any",
      searches: [...group.searches].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0)
        || String(left.model).localeCompare(String(right.model))),
    }))
    .sort((left, right) => String(left.make).localeCompare(String(right.make))
      || String(left.offerKind).localeCompare(String(right.offerKind))
      || String(left.zip).localeCompare(String(right.zip)));
}

export function buildAutoDevUrl(searchOrGroup, { limit = 20, maximumRadiusMiles = 250 } = {}) {
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
  const maximumRadius = Math.max(...searches.map((search) => Number(search.radiusMiles)));
  const maximumPrice = nullableMaximum(searches.map((search) => search.maxPrice));
  const maximumMileage = nullableMaximum(searches.map((search) => search.maxMileage));
  const minimumYear = nullableMinimum(searches.map((search) => search.yearMin));
  const maximumYear = nullableMaximum(searches.map((search) => search.yearMax));
  url.searchParams.set("vehicle.make", group.make);
  url.searchParams.set("vehicle.model", [...new Set(searches.map((search) => search.model).filter(Boolean))].sort().join(","));
  if (minimumYear !== null || maximumYear !== null) url.searchParams.set("vehicle.year", `${minimumYear ?? 1886}-${maximumYear ?? 2100}`);
  if (maximumPrice !== null) url.searchParams.set("retailListing.price", `1-${maximumPrice}`);
  if (group.offerKind === "used" && maximumMileage !== null) url.searchParams.set("retailListing.miles", `0-${maximumMileage}`);
  url.searchParams.set("retailListing.used", String(group.offerKind === "used"));
  if (group.transmission !== "any") url.searchParams.set("vehicle.transmission", group.transmission);
  url.searchParams.set("zip", group.zip);
  url.searchParams.set("distance", String(Math.max(1, Math.min(maximumRadius, maximumRadiusMiles, 500))));
  url.searchParams.set("limit", String(Math.max(1, Math.min(limit, 20))));
  url.searchParams.set("sort", "updatedAt.desc");
  return url;
}

export function normalizeAutoDevListing(listing, search, now = new Date(), { zipLookup = zipcodes.lookup } = {}) {
  const vehicle = listing?.vehicle ?? {};
  const retail = listing?.retailListing ?? {};
  const vin = cleanText(vehicle.vin ?? listing?.vin, 30);
  const year = integer(vehicle.year);
  const make = cleanText(vehicle.make, 100);
  const model = cleanText(vehicle.model, 150);
  const trim = cleanText(vehicle.trim, 150);
  const price = integer(retail.price);
  const mileage = integer(retail.miles) ?? (retail.used === false ? 0 : null);
  const url = publicHttpsUrl(retail.vdp, true);
  const primaryImageUrl = publicHttpsUrl(retail.primaryImage, false);
  const searchLocation = coordinates(zipLookup(search.zip));
  const listingLocation = coordinates(listing?.location) ?? coordinates(zipLookup(retail.zip));
  if (!vin || year === null || !make || !model || price === null || mileage === null || !url || !primaryImageUrl
    || !searchLocation || !listingLocation) return null;

  const distanceMiles = Math.round(haversineMiles(searchLocation, listingLocation) * 10) / 10;
  const inventoryType = retail.used === false ? "new" : "used";
  const transmissionClaim = cleanText(vehicle.transmission, 200);
  if (inventoryType !== search.offerKind
    || !matchesVehicle(make, search.make)
    || !matchesVehicle(model, search.model, search.aliases)
    || (search.trim && !matchesVehicle(trim, search.trim, search.trimAliases))
    || (search.yearMin !== null && search.yearMin !== undefined && year < search.yearMin)
    || (search.yearMax !== null && search.yearMax !== undefined && year > search.yearMax)
    || (search.maxPrice !== null && search.maxPrice !== undefined && price > search.maxPrice)
    || (search.maxMileage !== null && search.maxMileage !== undefined && mileage > search.maxMileage)
    || distanceMiles > search.radiusMiles
    || conflictsWithTransmission(transmissionClaim, search.transmission)
    || conflictsWithPowertrain(vehicle.fuel ?? vehicle.engine, search.powertrainCategory)) return null;

  const dealer = cleanText(retail.dealer, 200);
  const city = cleanText(retail.city, 100);
  const state = cleanText(retail.state, 40);
  const dealerId = cleanText(retail.dealerId, 100);
  const condition = retail.cpo === true ? "cpo" : inventoryType;
  const candidate = {
    offerKind: inventoryType,
    offerRole: "active_offer",
    sourceMethod: "api",
    condition,
    source: "auto_dev",
    originSource: new URL(url).hostname.replace(/^www\./, ""),
    sourceListingId: dealerId ? `${vin}:${dealerId}` : vin,
    searchId: search.id,
    url,
    vin,
    year,
    make,
    model,
    trim,
    title: [year, make, model, trim].filter(Boolean).join(" ").slice(0, 300),
    price,
    mileage,
    distanceMiles,
    location: [city, state].filter(Boolean).join(", ") || dealer || String(retail.zip ?? "Location unavailable"),
    transmissionClaim,
    imageUrls: [primaryImageUrl],
    primaryImageUrl,
    marketEstimate: null,
    msrp: null,
    sellerName: dealer,
    requiresManualVerification: search.transmission === "manual",
    ...(search.transmission === "manual" ? {} : { manualEvidence: [] }),
    parseConfidence: 1,
    expiresAt: new Date(now.getTime() + 3 * 86_400_000).toISOString(),
    seatingCapacity: integer(vehicle.seats),
    bodyStyle: cleanText(vehicle.bodyStyle, 100),
    build: {
      year,
      make,
      model,
      trim,
      transmission: transmissionClaim,
      fuel_type: cleanText(vehicle.fuel ?? vehicle.engine, 100),
      powertrain_type: cleanText(vehicle.fuel ?? vehicle.engine, 100),
      body_type: cleanText(vehicle.bodyStyle, 100),
      seating_capacity: integer(vehicle.seats),
    },
    summaryTexts: [cleanText(retail.description, 2_000)].filter(Boolean),
  };
  const intelligence = inferVehicleIntelligence(candidate, search, null, { enrichmentStatus: "not_requested" });
  delete candidate.build;
  delete candidate.summaryTexts;
  return Object.assign(candidate, intelligence);
}

export async function runAutoDevAdapter({
  searches,
  apiKey = process.env.AUTODEV_API_KEY ?? null,
  rows = 20,
  maximumRadiusMiles = 250,
  maximumSearchCalls = 13,
  fetchImpl = fetch,
  minimumIntervalMs = 1_000,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  zipLookup = zipcodes.lookup,
}) {
  const startedAt = new Date().toISOString();
  const relevant = searches.filter((search) => search.offerKind === "used" || search.offerKind === "new");
  const groups = buildAutoDevGroups(relevant);
  const counts = { searchedCount: 0, discoveredCount: 0, acceptedCount: 0 };
  const finish = (status, messageCode = null, offers = []) => ({
    offers,
    run: {
      adapter: "autodev-inventory-v2",
      source: "auto_dev",
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      ...counts,
      acceptedCount: offers.length,
      messageCode,
    },
  });
  if (relevant.length === 0) return finish("empty", "no_matching_searches");
  if (!apiKey) return finish("unavailable", "credential_missing");
  if (groups.some((group) => !coordinates(zipLookup(group.zip)))) return finish("unavailable", "zip_coordinates_unavailable");

  const boundedCalls = Math.max(1, Math.min(50, maximumSearchCalls));
  const scheduled = groups.slice(0, boundedCalls);
  const offers = [];
  const seen = new Set();
  for (const [index, group] of scheduled.entries()) {
    if (index > 0 && minimumIntervalMs > 0) await sleep(minimumIntervalMs);
    counts.searchedCount += 1;
    let response;
    try {
      response = await fetchImpl(buildAutoDevUrl(group, { limit: rows, maximumRadiusMiles }), {
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return finish("failed", "network_error", offers);
    }
    if (!response.ok) {
      const credentialFailure = response.status === 401 || response.status === 403;
      const code = credentialFailure ? "credential_rejected" : response.status === 429 ? "rate_limited" : `http_${response.status}`;
      return finish(credentialFailure ? "unavailable" : "failed", code, offers);
    }
    let payload;
    try {
      payload = await readBoundedJson(response, 4 * 1024 * 1024);
    } catch {
      return finish("failed", "invalid_json", offers);
    }
    const listings = Array.isArray(payload?.data) ? payload.data.slice(0, rows) : [];
    counts.discoveredCount += listings.length;
    for (const listing of listings) {
      for (const search of group.searches) {
        const normalizedListing = normalizeAutoDevListing(listing, search, new Date(), { zipLookup });
        const matchKey = normalizedListing ? `${normalizedListing.sourceListingId}\u0000${search.id}` : null;
        if (!normalizedListing || seen.has(matchKey)) continue;
        seen.add(matchKey);
        offers.push(normalizedListing);
      }
    }
  }
  counts.acceptedCount = offers.length;
  const queryCapped = groups.length > scheduled.length;
  const coverageCapped = relevant.some((search) => search.radiusMiles > Math.min(maximumRadiusMiles, 500));
  const messageCode = queryCapped
    ? `query_budget_capped_${scheduled.length}of${groups.length}`
    : coverageCapped ? `radius_capped_${Math.min(maximumRadiusMiles, 500)}mi` : null;
  return finish(offers.length ? "success" : "empty", messageCode, offers);
}

function coordinates(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const longitude = Number(value[0]);
    const latitude = Number(value[1]);
    return validCoordinates(latitude, longitude) ? { latitude, longitude } : null;
  }
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  return validCoordinates(latitude, longitude) ? { latitude, longitude } : null;
}

function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function haversineMiles(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitude = radians(right.latitude - left.latitude);
  const longitude = radians(right.longitude - left.longitude);
  const a = Math.sin(latitude / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitude / 2) ** 2;
  return 3_958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function publicHttpsUrl(value, removeTracking) {
  try {
    const url = new URL(String(value));
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !hostname
      || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || privateIp(hostname)) return null;
    if (removeTracking) {
      for (const name of [...url.searchParams.keys()]) {
        if (/^utm_/i.test(name) || /^(gclid|fbclid|api_?key)$/i.test(name)) url.searchParams.delete(name);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function privateIp(hostname) {
  if (!isIP(hostname)) return false;
  if (hostname === "::1") return true;
  if (hostname.includes(":")) return /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(hostname);
  const [first, second] = hostname.split(".").map(Number);
  return first === 10 || first === 127 || first === 0 || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function cleanText(value, maximum) {
  if (typeof value !== "string") return null;
  const result = value.replace(/\s+/g, " ").trim();
  return result ? result.slice(0, maximum) : null;
}

function integer(value) {
  const result = Number(value);
  return Number.isInteger(result) && result >= 0 ? result : null;
}

function normalized(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesVehicle(value, expected, aliases = []) {
  const actual = normalized(value);
  return Boolean(actual) && [expected, ...(aliases ?? [])].some((candidate) => {
    const wanted = normalized(candidate);
    return wanted && (actual === wanted || actual.includes(wanted) || wanted.includes(actual));
  });
}

function conflictsWithTransmission(value, requested = "any") {
  const actual = normalized(value);
  if (!actual || requested === "any") return false;
  if (requested === "manual") return /\b(automatic|cvt|dct|dual clutch)\b/.test(actual);
  return /\b(manual|stick|[456] speed)\b/.test(actual);
}

function conflictsWithPowertrain(value, requested = "any") {
  if (!requested || requested === "any") return false;
  const actual = normalized(value);
  if (!actual) return false;
  const electric = /\b(electric|bev)\b/.test(actual) && !/hybrid/.test(actual);
  const phev = /\b(phev|plug in hybrid)\b/.test(actual);
  const hybrid = /\b(hev|mhev|hybrid)\b/.test(actual) && !phev;
  if (requested === "ev") return !electric;
  if (requested === "phev") return !phev;
  if (requested === "hybrid") return !hybrid;
  return electric || phev || hybrid;
}

function nullableMaximum(values) {
  const numbers = values.filter((value) => Number.isFinite(value)).map(Number);
  return numbers.length ? Math.max(...numbers) : null;
}

function nullableMinimum(values) {
  const numbers = values.filter((value) => Number.isFinite(value)).map(Number);
  return numbers.length ? Math.min(...numbers) : null;
}
