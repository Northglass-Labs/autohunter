import { sourceForUrl } from "./source-policy.mjs";

const AUCTION_ONLY_SOURCES = new Set(["carsandbids", "bringatrailer", "ebay"]);

function integer(value) {
  const parsed = Number(String(value).replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalized(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalUrl(rawUrl) {
  const url = new URL(rawUrl);
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || ["aff", "affiliate", "campaign_id"].includes(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString();
}

function sourceListingId(rawUrl, source) {
  const url = new URL(rawUrl);
  const patterns = {
    "cars.com": /\/vehicledetail\/([^/]+)/,
    carsandbids: /\/auctions\/([^/]+)/,
    hemmings: /\/(?:listing|auction)\/([^/?]+)/,
  };
  return url.pathname.match(patterns[source])?.[1] ?? null;
}

function vehicleTitle(item, model) {
  const candidates = [
    ...(item.links ?? []).map((link) => link.text),
    item.heading,
  ].filter((value) => typeof value === "string" && /^\d{4}\s/.test(value.trim()));
  const needles = [model.model, ...(model.aliases ?? [])].map(normalized).filter(Boolean);
  return candidates.map((value) => value.trim()).find((value) => needles.some((needle) => normalized(value).includes(needle))) ?? null;
}

function locationFromText(text, zip) {
  const marker = text.search(new RegExp(`\\([\\d,.]+\\s*mi\\.\\s*from\\s*${zip}\\)`, "i"));
  if (marker < 0) return null;
  const prefix = text.slice(0, marker).trim();
  const segments = prefix.split(/[·•]/).map((part) => part.trim()).filter(Boolean);
  const candidate = segments.at(-1)?.replace(/^.*?\b(?:ago|yesterday|today)\b\s*/i, "").trim();
  return candidate && /[A-Za-z]/.test(candidate) ? candidate : null;
}

function parseItem(item, { model, policy, includeAuctions }) {
  const text = String(item.text ?? "");
  if (!includeAuctions && /\b(current bid|no bids?|days? left|auction)\b/i.test(text)) return null;
  if (/\b(automatic|cvt|dct|dual[- ]clutch)\b/i.test(text)) return null;
  const transmissionClaim = text.match(/\b(?:[456][ -]?speed\s+)?manual\b/i)?.[0] ?? null;
  if (policy.transmission === "manual" && !transmissionClaim) return null;

  const link = (item.links ?? []).find(({ href, text: label }) => {
    if (!href || !/^https:\/\//i.test(href)) return false;
    if (!label || !/^\d{4}\s/.test(label.trim())) return false;
    const source = sourceForUrl(href);
    return source !== null && source !== "autotempest";
  });
  if (!link) return null;
  const url = canonicalUrl(link.href);
  const source = sourceForUrl(url);
  if (!source) return null;
  if (!includeAuctions && (AUCTION_ONLY_SOURCES.has(source) || /\/(?:auction|auctions)\//i.test(new URL(url).pathname))) return null;
  const title = vehicleTitle(item, model);
  const year = integer(title?.match(/^(\d{4})/)?.[1]);
  const price = integer(text.match(/\$([\d,]+)/)?.[1]);
  const mileage = integer(text.match(/([\d,]+)\s*mi\./i)?.[1]);
  const distanceMiles = Number(text.match(new RegExp(`\\(([\\d,.]+)\\s*mi\\.\\s*from\\s*${policy.zip}\\)`, "i"))?.[1]?.replace(/,/g, ""));
  const location = locationFromText(text, policy.zip);
  if (!title || !year || price === null || mileage === null || !Number.isFinite(distanceMiles) || !location) return null;
  if (price > policy.maxPrice || mileage > policy.maxMileage || distanceMiles > policy.radiusMiles) return null;

  const imageUrls = [...new Set((item.imageUrls ?? []).filter((value) => typeof value === "string" && /^https:\/\//i.test(value)))];
  return {
    source,
    sourceListingId: sourceListingId(url, source),
    url,
    year,
    make: model.make,
    model: model.model,
    trim: null,
    title,
    price,
    mileage,
    distanceMiles,
    location,
    transmissionClaim,
    imageUrls,
    primaryImageUrl: imageUrls[0] ?? null,
    marketEstimate: null,
  };
}

export function selectCandidates(items, { model, policy, includeAuctions, limit }) {
  const candidates = [];
  const seen = new Set();
  for (const item of items) {
    const candidate = parseItem(item, { model, policy, includeAuctions });
    if (!candidate || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    candidates.push(candidate);
  }
  return candidates
    .sort((a, b) => a.price - b.price || a.mileage - b.mileage || a.distanceMiles - b.distanceMiles)
    .slice(0, limit);
}
