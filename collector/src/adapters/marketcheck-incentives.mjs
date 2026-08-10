import { isIP } from "node:net";
import { readBoundedJson } from "../app-client.mjs";

const API_URL = "https://api.marketcheck.com/v2/search/car/incentive/oem";

export function buildMarketCheckIncentiveGroups(searches) {
  const groups = new Map();
  for (const search of searches.filter((candidate) => candidate.offerKind === "lease" && /^\d{5}$/.test(candidate.zip ?? ""))) {
    const key = [normalized(search.make), search.zip].join("\u0000");
    const group = groups.get(key) ?? { make: search.make, zip: search.zip, searches: [] };
    group.searches.push(search);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      searches: [...group.searches].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0)
        || String(left.model).localeCompare(String(right.model))),
    }))
    .sort((left, right) => String(left.make).localeCompare(String(right.make)) || String(left.zip).localeCompare(String(right.zip)));
}

export function buildMarketCheckIncentiveUrl(group, { apiKey, rows = 10 } = {}) {
  const url = new URL(API_URL);
  const maximumMonthly = nullableMaximum(group.searches.map((search) => search.maxEffectiveMonthly));
  const maximumDas = nullableMaximum(group.searches.map((search) => search.maxDueAtSigning));
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("country", "us");
  url.searchParams.set("offer_type", "lease");
  url.searchParams.set("make", group.make);
  url.searchParams.set("model", [...new Set(group.searches.map((search) => search.model).filter(Boolean))].sort().join(","));
  url.searchParams.set("zip", group.zip);
  url.searchParams.set("rows", String(Math.max(1, Math.min(10, rows))));
  url.searchParams.set("sort_by", "monthly");
  url.searchParams.set("sort_order", "asc");
  if (maximumMonthly !== null) url.searchParams.set("monthly_range", `1-${maximumMonthly}`);
  if (maximumDas !== null) url.searchParams.set("due_at_signing_range", `0-${maximumDas}`);
  return url;
}

export function normalizeMarketCheckIncentive(listing, search, now = new Date()) {
  const offer = listing?.offer ?? {};
  if (normalized(offer.offer_type) !== "lease") return null;
  const vehicles = Array.isArray(offer.vehicles) ? offer.vehicles : [];
  const vehicle = vehicles
    .filter((candidate) => matchesVehicle(candidate?.make, search.make)
      && matchesVehicle(candidate?.model, search.model, search.aliases)
      && (!search.trim || matchesVehicle(candidate?.trim, search.trim, search.trimAliases)))
    .sort((left, right) => number(right?.year) - number(left?.year))[0];
  const id = cleanText(listing?.id, 120);
  const year = integer(vehicle?.year);
  const make = cleanText(vehicle?.make, 100);
  const model = cleanText(vehicle?.model, 150);
  const trim = cleanText(vehicle?.trim, 150);
  const url = sourceUrl(listing?.source);
  if (!id || year === null || !make || !model || !url) return null;
  if ((search.yearMin !== null && search.yearMin !== undefined && year < search.yearMin)
    || (search.yearMax !== null && search.yearMax !== undefined && year > search.yearMax)) return null;

  const expiresAt = programDate(offer.valid_through, true) ?? new Date(now.getTime() + 7 * 86_400_000);
  if (expiresAt.getTime() <= now.getTime()) return null;
  const publishedAt = utcDate(listing.status_date) ?? utcDate(listing.scraped_at_date) ?? now;
  const amount = (Array.isArray(offer.amounts) ? offer.amounts : [])
    .filter((candidate) => normalized(candidate?.term_unit).startsWith("month"))
    .sort((left, right) => number(left?.monthly, Number.POSITIVE_INFINITY) - number(right?.monthly, Number.POSITIVE_INFINITY))[0] ?? null;
  const monthlyPayment = positiveMoney(amount?.monthly);
  const termMonths = positiveInteger(amount?.term);
  const dueAtSigning = nullableMoney(offer.due_at_signing);
  const annualMiles = positiveInteger(offer.mileage_limit);
  const acquisitionFee = nullableMoney(offer.acquisition_fee);
  const dispositionFee = nullableMoney(offer.disposition_fee);
  const securityAmount = nullableMoney(offer.security_deposit);
  const securityDeposit = securityAmount && securityAmount > 0 ? securityAmount : null;
  const sourceText = [...textList(offer.titles), ...textList(offer.offers), ...textList(offer.disclaimers)].join(" ");
  const acquisitionFeeIncludedInDueAtSigning = acquisitionFee === null
    ? null
    : /(?:acq(?:uisition)?\s+fee).{0,80}(?:included\s+in|part\s+of).{0,40}(?:due\s+at\s+signing|DAS)|(?:due\s+at\s+signing|DAS).{0,80}includes?.{0,40}(?:acq(?:uisition)?\s+fee)/i.test(sourceText);
  const dueAtSigningIncludesFirstPayment = dueAtSigning === null ? null : dueAtSigning === 0 ? false : true;
  const securityDepositRefundable = securityDeposit === null
    ? null
    : /\brefundable\b.{0,40}\b(?:security\s+deposit|MSD)|\b(?:security\s+deposit|MSD).{0,40}\brefundable\b/i.test(sourceText)
      ? true
      : /\bnon[ -]?refundable\b.{0,40}\bsecurity\s+deposit|\bsecurity\s+deposit.{0,40}\bnon[ -]?refundable\b/i.test(sourceText)
        ? false
        : null;
  const complete = monthlyPayment !== null && dueAtSigning !== null && termMonths !== null && annualMiles !== null;
  const offerRole = complete ? "active_offer" : "market_signal";
  const effectiveMonthly = complete
    ? leaseEffectiveMonthly({
        monthlyPayment,
        dueAtSigning,
        dueAtSigningIncludesFirstPayment,
        termMonths,
        acquisitionFee,
        acquisitionFeeIncludedInDueAtSigning,
        securityDeposit,
        securityDepositRefundable,
      })
    : null;
  if (offerRole === "active_offer") {
    if (search.maxEffectiveMonthly && effectiveMonthly > search.maxEffectiveMonthly) return null;
    if (search.maxDueAtSigning !== null && search.maxDueAtSigning !== undefined && dueAtSigning > search.maxDueAtSigning) return null;
    if (search.minAnnualMiles && annualMiles < search.minAnnualMiles) return null;
  }
  const disclosed = [monthlyPayment, dueAtSigning, termMonths, annualMiles].filter((value) => value !== null).length;
  const parseConfidence = complete ? 0.98 : Math.round((0.3 + disclosed * 0.1) * 100) / 100;
  const title = cleanText(textList(offer.titles)[0] ?? offer.oem_program_name, 300)
    ?? `${year} ${make} ${model} OEM lease program`;
  const taxesIncluded = /\b(?:tax(?:es)?\s+included|incl\.?\s+tax)\b/i.test(sourceText)
    ? true
    : /\b(?:excludes?|plus)\s+(?:applicable\s+)?tax|\+\s*tax\b/i.test(sourceText) ? false : null;
  const sourceListingId = [id, year, slug(make), slug(model), slug(trim ?? "all-trims")].join(":");
  return {
    offerKind: "lease",
    offerRole,
    sourceMethod: "api",
    condition: "new",
    source: "marketcheck_incentives",
    originSource: new URL(url).hostname.replace(/^www\./, ""),
    sourceListingId,
    searchId: search.id,
    url,
    year,
    make,
    model,
    trim,
    title,
    price: null,
    mileage: null,
    distanceMiles: null,
    location: [cleanText(listing.city, 100), cleanText(listing.state, 40)].filter(Boolean).join(", ") || search.region,
    transmissionClaim: cleanText(vehicle?.transmission, 200),
    imageUrls: [],
    primaryImageUrl: null,
    marketEstimate: null,
    monthlyPayment,
    dueAtSigning,
    dueAtSigningIncludesFirstPayment,
    termMonths,
    annualMiles,
    brokerFee: null,
    acquisitionFee,
    acquisitionFeeIncludedInDueAtSigning,
    dispositionFee,
    securityDeposit,
    securityDepositRefundable,
    msrp: positiveMoney(offer.msrp),
    moneyFactor: null,
    residualPercent: null,
    discountPercent: null,
    taxesIncluded,
    effectiveMonthly,
    region: search.region,
    parseConfidence,
    sellerName: `${make} OEM program`,
    requiresManualVerification: false,
    manualEvidence: [],
    garageGroup: "lease",
    powertrainCategory: search.powertrainCategory ?? powertrain(vehicle?.fuel_type),
    bodyStyle: cleanText(vehicle?.body_type, 100),
    seatingCapacity: null,
    featureEvidence: [],
    packageNames: [],
    featureMatchScore: 0,
    familyFitScore: 0,
    enrichmentStatus: "not_requested",
    publishedAt: publishedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function runMarketCheckIncentivesAdapter({
  searches,
  apiKey = process.env.MARKETCHECK_API_KEY ?? null,
  rows = 10,
  maximumSearchCalls = 13,
  fetchImpl = fetch,
  minimumIntervalMs = 1_000,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const startedAt = new Date().toISOString();
  const relevant = searches.filter((search) => search.offerKind === "lease");
  const usable = relevant.filter((search) => /^\d{5}$/.test(search.zip ?? ""));
  const groups = buildMarketCheckIncentiveGroups(usable);
  const counts = { searchedCount: 0, discoveredCount: 0, acceptedCount: 0 };
  const finish = (status, messageCode = null, offers = []) => ({
    offers,
    run: {
      adapter: "marketcheck-oem-incentives-v2",
      source: "marketcheck_incentives",
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      ...counts,
      acceptedCount: offers.length,
      messageCode,
    },
  });
  if (relevant.length === 0) return finish("empty", "no_matching_searches");
  if (usable.length === 0) return finish("unavailable", "search_zip_missing");
  if (!apiKey) return finish("unavailable", "credential_missing");

  const boundedCalls = Math.max(1, Math.min(50, maximumSearchCalls));
  const scheduled = groups.slice(0, boundedCalls);
  const offers = [];
  const seen = new Set();
  for (const [index, group] of scheduled.entries()) {
    if (index > 0 && minimumIntervalMs > 0) await sleep(minimumIntervalMs);
    counts.searchedCount += 1;
    let response;
    try {
      response = await fetchImpl(buildMarketCheckIncentiveUrl(group, { apiKey, rows }), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return finish("failed", "network_error", offers);
    }
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? "unavailable" : "failed";
      const code = response.status === 401 ? "credential_rejected"
        : response.status === 403 ? "plan_upgrade_required"
          : response.status === 429 ? "rate_limited" : `http_${response.status}`;
      return finish(status, code, offers);
    }
    let payload;
    try {
      payload = await readBoundedJson(response, 2 * 1024 * 1024);
    } catch {
      return finish("failed", "invalid_json", offers);
    }
    const listings = Array.isArray(payload?.listings) ? payload.listings.slice(0, Math.min(10, rows)) : [];
    counts.discoveredCount += listings.length;
    for (const listing of listings) {
      for (const search of group.searches) {
        const normalizedOffer = normalizeMarketCheckIncentive(listing, search);
        const key = normalizedOffer ? `${normalizedOffer.sourceListingId}\u0000${search.id}` : null;
        if (!normalizedOffer || seen.has(key)) continue;
        seen.add(key);
        offers.push(normalizedOffer);
      }
    }
  }
  counts.acceptedCount = offers.length;
  const messageCode = groups.length > scheduled.length
    ? `query_budget_capped_${scheduled.length}of${groups.length}`
    : usable.length < relevant.length ? `search_zip_missing_${relevant.length - usable.length}` : null;
  return finish(offers.length ? "success" : "empty", messageCode, offers);
}

function leaseEffectiveMonthly(input) {
  const recurring = input.termMonths - (input.dueAtSigningIncludesFirstPayment === false ? 0 : 1);
  const acquisition = input.acquisitionFeeIncludedInDueAtSigning === true ? 0 : input.acquisitionFee ?? 0;
  const deposit = input.securityDepositRefundable === false ? input.securityDeposit ?? 0 : 0;
  return Math.round(((input.monthlyPayment * recurring + input.dueAtSigning + acquisition + deposit) / input.termMonths) * 100) / 100;
}

function sourceUrl(value) {
  try {
    const raw = String(value ?? "").trim();
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port || !hostname
      || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || privateIp(hostname)) return null;
    return `${url.origin}/`;
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

function programDate(value, endOfDay) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!match) return utcDate(value);
  const date = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
  return date.getUTCFullYear() === Number(match[3]) && date.getUTCMonth() === Number(match[1]) - 1 && date.getUTCDate() === Number(match[2]) ? date : null;
}

function utcDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function textList(value) {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function cleanText(value, maximum) {
  if (typeof value !== "string") return null;
  const result = value.replace(/\s+/g, " ").trim();
  return result ? result.slice(0, maximum) : null;
}

function normalized(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value) {
  return normalized(value).replace(/\s+/g, "-") || "unknown";
}

function matchesVehicle(value, expected, aliases = []) {
  const actual = normalized(value);
  return Boolean(actual) && [expected, ...(aliases ?? [])].some((candidate) => {
    const wanted = normalized(candidate);
    return wanted && (actual === wanted || actual.includes(wanted) || wanted.includes(actual));
  });
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function integer(value) {
  const result = Number(value);
  return Number.isInteger(result) && result >= 0 ? result : null;
}

function positiveInteger(value) {
  const result = integer(value);
  return result !== null && result > 0 ? result : null;
}

function nullableMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 && result <= 10_000_000 ? Math.round(result) : null;
}

function positiveMoney(value) {
  const result = nullableMoney(value);
  return result !== null && result > 0 ? result : null;
}

function powertrain(value) {
  const fuel = normalized(value);
  if (/\b(electric|bev)\b/.test(fuel) && !/hybrid/.test(fuel)) return "ev";
  if (/\b(phev|plug in hybrid)\b/.test(fuel)) return "phev";
  if (/\b(hev|hybrid)\b/.test(fuel)) return "hybrid";
  return "gas";
}

function nullableMaximum(values) {
  const numbers = values.filter((value) => Number.isFinite(value)).map(Number);
  return numbers.length ? Math.max(...numbers) : null;
}
