import type { ListingSource } from "./types";

const HOSTS: Array<{ domain: string; source: ListingSource }> = [
  { domain: "cargurus.com", source: "cargurus" },
  { domain: "autotrader.com", source: "autotrader" },
  { domain: "cars.com", source: "cars.com" },
  { domain: "autotempest.com", source: "autotempest" },
  { domain: "hemmings.com", source: "hemmings" },
  { domain: "craigslist.org", source: "craigslist" },
  { domain: "carsandbids.com", source: "carsandbids" },
  { domain: "bringatrailer.com", source: "bringatrailer" },
  { domain: "ebay.com", source: "ebay" },
];

function within(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function sourceForUrl(rawUrl: string): ListingSource {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("unsupported listing URL");
  const match = HOSTS.find(({ domain }) => within(url.hostname.toLowerCase(), domain));
  if (!match) throw new Error("unsupported listing host");
  return match.source;
}
