import type { CandidateOffer } from "./types";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

export function normalizeVin(vin?: string | null): string | null {
  if (!vin) return null;
  const normalized = vin.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalized) ? normalized : null;
}

export function canonicalListingUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url.toString();
}

export function listingIdentity(listing: CandidateOffer): string {
  if (listing.sourceListingId?.trim()) {
    if ((listing.source === "leasehackr" || listing.source === "email_alert") && listing.searchId?.trim()) {
      return `${listing.source}:${listing.searchId.trim()}:${listing.sourceListingId.trim()}`;
    }
    if (listing.source === "dealer" || listing.source === "other") {
      const hostname = new URL(canonicalListingUrl(listing.url)).hostname;
      return `${listing.source}:${hostname}:${listing.sourceListingId.trim()}`;
    }
    return `${listing.source}:${listing.sourceListingId.trim()}`;
  }
  return `url:${canonicalListingUrl(listing.url)}`;
}
