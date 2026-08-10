import { XMLParser, XMLValidator } from "fast-xml-parser";

const DEFAULT_FEED = "https://forum.leasehackr.com/c/marketplace/7.rss";
const MAX_FEED_BYTES = 1_500_000;
const REGION_ALIASES = new Map([
  ["northeast", [
    "northeast", "north east", "new england", "mid atlantic", "connecticut", "delaware",
    "maine", "maryland", "massachusetts", "new hampshire", "new jersey", "new york",
    "pennsylvania", "rhode island", "vermont", "washington dc", "ct", "de", "me", "md",
    "ma", "nh", "nj", "ny", "pa", "ri", "vt",
  ]],
  ["southeast", [
    "southeast", "south east", "alabama", "florida", "georgia", "kentucky", "mississippi",
    "north carolina", "south carolina", "tennessee", "virginia", "west virginia",
  ]],
  ["midwest", [
    "midwest", "great lakes", "illinois", "indiana", "iowa", "kansas", "michigan",
    "minnesota", "missouri", "nebraska", "north dakota", "ohio", "south dakota", "wisconsin",
  ]],
  ["southwest", ["southwest", "south west", "arizona", "new mexico", "oklahoma", "texas"]],
  ["california", ["california", "northern california", "southern california", "norcal", "socal", "ca"]],
  ["pacific northwest", ["pacific northwest", "pnw", "oregon", "washington"]],
]);

function list(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizedText(value, maxLength = 10_000) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function amount(raw) {
  if (!raw) return null;
  const number = Number(String(raw.value).replace(/,/g, ""));
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * (raw.thousands ? 1_000 : 1));
}

function moneyMatch(text, label) {
  const value = "\\$\\s*([\\d]+(?:,[\\d]{3})*(?:\\.\\d{1,2})?)\\s*(k)?";
  const after = text.match(new RegExp(`${value}\\s*(?:${label})`, "i"));
  if (after) return amount({ value: after[1], thousands: Boolean(after[2]) });
  const before = text.match(new RegExp(`(?:${label})\\s*[:=\\-]?\\s*${value}`, "i"));
  return before ? amount({ value: before[1], thousands: Boolean(before[2]) }) : null;
}

function percentMatch(text, expression) {
  const match = text.match(expression);
  return match ? Number(match[1]) : null;
}

function topicId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "forum.leasehackr.com") return null;
    return parsed.pathname.match(/\/(\d+)(?:\/)?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function feedUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.hostname !== "forum.leasehackr.com" || !parsed.pathname.endsWith(".rss")) {
    throw new Error("Leasehackr adapter requires an HTTPS forum.leasehackr.com RSS feed");
  }
  return parsed.toString();
}

function effectiveMonthly({ monthlyPayment, dueAtSigning, termMonths, brokerFee, acquisitionFee }) {
  if (!(monthlyPayment > 0) || !(dueAtSigning >= 0) || !Number.isInteger(termMonths) || termMonths <= 0) return null;
  return Math.round(((monthlyPayment * (termMonths - 1) + dueAtSigning + (brokerFee ?? 0) + (acquisitionFee ?? 0)) / termMonths) * 100) / 100;
}

function searchableText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesTerm(haystack, candidate) {
  const term = searchableText(candidate);
  return Boolean(term) && ` ${haystack} `.includes(` ${term} `);
}

function matchesSearch(search, haystack) {
  const normalized = searchableText(haystack);
  if (!includesTerm(normalized, search.make)) return false;
  const modelTerms = [search.model, ...(Array.isArray(search.aliases) ? search.aliases : [])];
  if (!modelTerms.some((candidate) => includesTerm(normalized, candidate))) return false;
  const region = searchableText(search.region);
  const regionTerms = REGION_ALIASES.get(region) ?? [search.region];
  return regionTerms.some((candidate) => includesTerm(normalized, candidate));
}

function parseItem(item, search) {
  const title = normalizedText(item.title, 300);
  const description = normalizedText(item.description ?? item["content:encoded"], 10_000);
  const categories = list(item.category).map((value) => normalizedText(value, 100)).filter(Boolean);
  const url = normalizedText(item.link ?? item.guid, 1_000);
  const id = topicId(url);
  if (!title || !id) return null;
  const combined = `${title} ${description} ${categories.join(" ")}`;
  if (!matchesSearch(search, combined)) return null;

  const monthlyMatch = combined.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/\s*mo(?:nth)?|monthly)\b/i);
  const monthlyPayment = monthlyMatch ? amount({ value: monthlyMatch[1], thousands: false }) : null;
  const dueAtSigning = moneyMatch(combined, "DAS|due\\s+at\\s+signing|drive[ -]?off");
  const termMileage = combined.match(/\b(\d{2})\s*\/\s*(\d{1,2})(?:k)?\b/i);
  const termMonths = termMileage ? Number(termMileage[1]) : Number(combined.match(/\b(\d{2})\s*(?:months?|mos?)\b/i)?.[1] ?? NaN);
  const annualMiles = termMileage ? Number(termMileage[2]) * 1_000 : null;
  const msrp = moneyMatch(combined, "MSRP");
  const brokerFee = moneyMatch(combined, "broker(?:\\s+fee)?");
  const acquisitionFee = moneyMatch(combined, "acq(?:uisition)?(?:\\s+fee)?");
  const dispositionFee = moneyMatch(combined, "disposition(?:\\s+fee)?");
  const moneyFactor = Number(combined.match(/\b(?:MF|money\s+factor)\s*[:=]?\s*(0?\.\d{3,6})\b/i)?.[1] ?? NaN);
  const residualPercent = percentMatch(combined, /\b(\d{1,2}(?:\.\d+)?)%\s*(?:residual|RV)\b/i);
  const discountPercent = percentMatch(combined, /\b(\d{1,2}(?:\.\d+)?)%\s*off(?:\s+MSRP)?\b/i);
  const taxesIncluded = /\b(?:tax(?:es)?\s+included|incl\.?\s+tax)\b/i.test(combined)
    ? true
    : /\+\s*tax\b/i.test(combined) ? false : null;
  const year = Number(title.match(/\b(20\d{2})\b/)?.[1] ?? NaN);
  const normalizedTitle = searchableText(title);
  const makePresent = includesTerm(normalizedTitle, search.make);
  const modelPresent = [search.model, ...(Array.isArray(search.aliases) ? search.aliases : [])]
    .some((candidate) => includesTerm(normalizedTitle, candidate));
  let parseConfidence = 0.35;
  if (makePresent) parseConfidence += 0.1;
  if (modelPresent) parseConfidence += 0.1;
  if (monthlyPayment !== null) parseConfidence += 0.1;
  if (dueAtSigning !== null) parseConfidence += 0.1;
  if (Number.isInteger(termMonths)) parseConfidence += 0.05;
  if (annualMiles !== null) parseConfidence += 0.05;
  if (msrp !== null) parseConfidence += 0.05;
  if (brokerFee !== null) parseConfidence += 0.05;
  parseConfidence = Math.min(1, Math.round(parseConfidence * 100) / 100);

  const effective = effectiveMonthly({
    monthlyPayment,
    dueAtSigning,
    termMonths: Number.isInteger(termMonths) ? termMonths : null,
    brokerFee,
    acquisitionFee,
  });
  if (effective !== null && search.maxEffectiveMonthly && effective > search.maxEffectiveMonthly) return null;
  if (dueAtSigning !== null && search.maxDueAtSigning && dueAtSigning > search.maxDueAtSigning) return null;
  if (annualMiles !== null && search.minAnnualMiles && annualMiles < search.minAnnualMiles) return null;

  const published = new Date(item.pubDate);
  const publishedAt = Number.isNaN(published.getTime()) ? null : published.toISOString();
  const expiresAt = new Date((publishedAt ? published.getTime() : Date.now()) + (publishedAt ? 35 : 7) * 86_400_000).toISOString();
  return {
    offerKind: "lease",
    condition: "new",
    source: "leasehackr",
    originSource: "forum.leasehackr.com",
    sourceListingId: id,
    searchId: search.id,
    url,
    year: Number.isInteger(year) ? year : null,
    make: search.make,
    model: search.model,
    trim: search.trim ?? null,
    title,
    price: null,
    mileage: null,
    distanceMiles: null,
    location: search.region ?? "Region in linked post",
    transmissionClaim: null,
    imageUrls: [],
    primaryImageUrl: null,
    marketEstimate: null,
    monthlyPayment,
    dueAtSigning,
    termMonths: Number.isInteger(termMonths) ? termMonths : null,
    annualMiles,
    brokerFee,
    acquisitionFee,
    dispositionFee,
    msrp,
    moneyFactor: Number.isFinite(moneyFactor) ? moneyFactor : null,
    residualPercent,
    discountPercent,
    taxesIncluded,
    effectiveMonthly: effective,
    region: search.region ?? null,
    parseConfidence,
    sellerName: null,
    requiresManualVerification: false,
    manualEvidence: [],
    publishedAt,
    expiresAt,
  };
}

export function parseLeasehackrFeed(xml, searches) {
  if (typeof xml !== "string" || Buffer.byteLength(xml, "utf8") > MAX_FEED_BYTES) throw new Error("Leasehackr RSS response is invalid or too large");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("Leasehackr RSS response is malformed");
  const parser = new XMLParser({ ignoreAttributes: true, processEntities: false, htmlEntities: false, trimValues: true });
  const parsed = parser.parse(xml);
  const items = list(parsed?.rss?.channel?.item).slice(0, 100);
  const offers = [];
  const seen = new Set();
  for (const search of searches.filter((candidate) => candidate.offerKind === "lease")) {
    for (const item of items) {
      const offer = parseItem(item, search);
      const key = offer ? `${offer.searchId}:${offer.sourceListingId}` : null;
      if (!offer || seen.has(key)) continue;
      seen.add(key);
      offers.push(offer);
    }
  }
  return offers;
}

export async function runLeasehackrAdapter({ searches, feedUrl: configuredFeed = DEFAULT_FEED, fetchImpl = fetch }) {
  const startedAt = new Date().toISOString();
  const relevant = searches.filter((search) => search.offerKind === "lease");
  const base = { adapter: "leasehackr-discourse-rss", source: "leasehackr", startedAt, searchedCount: relevant.length };
  if (relevant.length === 0) return { offers: [], run: { ...base, status: "empty", finishedAt: new Date().toISOString(), discoveredCount: 0, acceptedCount: 0, messageCode: "no_matching_searches" } };
  // Keep the parser for operator-supplied exports, but do not retrieve the forum feed. A public RSS
  // endpoint does not override Leasehackr's current prohibition on automated crawling or scraping.
  void configuredFeed;
  void fetchImpl;
  return {
    offers: [],
    run: {
      ...base,
      status: "unavailable",
      finishedAt: new Date().toISOString(),
      discoveredCount: 0,
      acceptedCount: 0,
      messageCode: "source_terms_prohibit_automation",
    },
  };
}
