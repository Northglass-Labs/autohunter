import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";

const SOURCES = [
  ["cars.com", "cars.com"],
  ["cargurus.com", "cargurus"],
  ["autotrader.com", "autotrader"],
  ["hemmings.com", "hemmings"],
  ["carsandbids.com", "carsandbids"],
  ["bringatrailer.com", "bringatrailer"],
  ["ebay.com", "ebay"],
  ["craigslist.org", "craigslist"],
  ["autotempest.com", "autotempest"],
];

const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) blockedAddresses.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) blockedAddresses.addSubnet(address, prefix, "ipv6");

function within(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function sourceForUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const hostname = url.hostname.toLowerCase();
  return SOURCES.find(([domain]) => within(hostname, domain))?.[1] ?? null;
}

function addressIsBlocked({ address, family }) {
  const type = family === 6 || family === "IPv6" ? "ipv6" : "ipv4";
  return blockedAddresses.check(address, type);
}

async function authorizePublicHttpsUrl(
  rawUrl,
  {
    resolveHost = (hostname) => lookup(hostname, { all: true, verbatim: true }),
  } = {},
) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("outbound URL must use credential-free HTTPS");
  }
  const addresses = await resolveHost(url.hostname);
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("outbound host did not resolve");
  }
  if (addresses.some(addressIsBlocked)) throw new Error("outbound host resolved to a non-public address");
  return url;
}

export async function authorizePublicResourceUrl(rawUrl, options) {
  const url = await authorizePublicHttpsUrl(rawUrl, options);
  return { url: url.toString() };
}

export async function authorizeNavigationUrl(
  rawUrl,
  {
    purpose,
    resolveHost = (hostname) => lookup(hostname, { all: true, verbatim: true }),
  },
) {
  const url = await authorizePublicHttpsUrl(rawUrl, { resolveHost });
  const source = sourceForUrl(url.toString());
  if (!source) throw new Error("unsupported listing host");
  if (purpose === "discovery" && source !== "autotempest") {
    throw new Error("discovery navigation must remain on AutoTempest");
  }
  if (purpose === "listing" && source === "autotempest") {
    throw new Error("direct listing navigation cannot use AutoTempest");
  }
  return { url: url.toString(), source };
}
