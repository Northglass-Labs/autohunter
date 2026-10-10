import type { OfferKind } from "./types";

interface SourceResult {
  source: string;
  status: string;
  finishedAt: string;
  messageCode: string | null;
  acceptedCount: number;
  discoveredCount: number;
  searchedCount: number;
  // Undefined on snapshots stored before discovery history was recorded; null when never.
  lastDiscoveryAt?: string | null;
}

const HOUR = 3_600_000;
const DEFAULT_FRESHNESS_HOURS = 48;
// Metered providers are collected on a slower cadence (collector/platform.example.json). A result
// stays fresh for the expected interval plus slack for one late or missed scheduled run.
const FRESHNESS_HOURS: Record<string, number> = {
  marketcheck: 72,
  marketcheck_incentives: 216,
};
// A provider that answers every query with nothing for this long is not giving coverage.
const NO_RESULTS_ALERT_HOURS = 7 * 24;

// Offer kinds each collector source serves. Unknown sources stay visible to everyone. The
// Leasehackr feed may only be imported manually (collector config refuses to schedule it), so its
// last automated run is history rather than a source to report.
const SOURCE_OFFER_KINDS: Record<string, readonly OfferKind[]> = {
  marketcheck: ["used", "new"],
  auto_dev: ["used", "new"],
  nhtsa: ["used", "new"],
  manual_photo_verification: ["used"],
  marketcheck_incentives: ["lease"],
  email_alert: ["lease"],
  leasehackr: [],
};

export function sourcesForOfferKinds<T extends { source: string }>(sources: T[], offerKinds: Iterable<OfferKind>) {
  const kinds = new Set(offerKinds);
  return sources.filter((source) => {
    const served = SOURCE_OFFER_KINDS[source.source];
    return served === undefined || served.some((kind) => kinds.has(kind));
  });
}

function isFresh(source: SourceResult, now: number) {
  const age = now - Date.parse(source.finishedAt);
  const limit = (FRESHNESS_HOURS[source.source] ?? DEFAULT_FRESHNESS_HOURS) * HOUR;
  return Number.isFinite(age) && age >= -300_000 && age <= limit;
}

function hasNoRecentResults(source: SourceResult, now: number) {
  if (source.lastDiscoveryAt === undefined || source.searchedCount === 0 || source.discoveredCount > 0) return false;
  if (source.lastDiscoveryAt === null) return true;
  const age = now - Date.parse(source.lastDiscoveryAt);
  return !Number.isFinite(age) || age > NO_RESULTS_ALERT_HOURS * HOUR;
}

export function isSourceHealthy(source: SourceResult, now = Date.now()) {
  return ["success", "empty"].includes(source.status) && isFresh(source, now) && !hasNoRecentResults(source, now);
}

// Sources the hosted scheduler collects. Optional and manual inputs (the mail importer, photo
// checks) are excluded so a known-dormant input cannot mask a new outage.
export const SCHEDULED_SOURCES = ["marketcheck", "auto_dev", "marketcheck_incentives", "nhtsa"] as const;

// True while every scheduled source has a fresh, working result that still finds something.
export function scheduledSourcesHealthy(sources: SourceResult[], now = Date.now()) {
  return SCHEDULED_SOURCES.every((name) => {
    const latest = sources.find((source) => source.source === name);
    return latest !== undefined && isSourceHealthy(latest, now);
  });
}

export function sourceLabel(source: string) {
  if (source === "nhtsa") return "NHTSA";
  if (source === "auto_dev") return "Auto.dev";
  if (source === "marketcheck") return "MarketCheck";
  if (source === "marketcheck_incentives") return "OEM lease programs";
  if (source === "email_alert") return "Authorized email imports";
  if (!/[_-]/.test(source)) return source;
  return source.split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function shortDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(date);
}

export function sourceStatusLabel(source: SourceResult, now = Date.now()) {
  if (["success", "empty"].includes(source.status) && !isFresh(source, now)) {
    const collected = shortDate(source.finishedAt);
    return collected ? `Stale · last collected ${collected}` : "Stale · no recent collection result";
  }
  if (["success", "empty"].includes(source.status) && hasNoRecentResults(source, now)) {
    const discovered = source.lastDiscoveryAt ? shortDate(source.lastDiscoveryAt) : null;
    return discovered ? `No provider results since ${discovered}` : "No provider results yet";
  }
  const cap = source.messageCode?.match(/^radius_capped_(\d{1,3})mi$/);
  const budget = source.messageCode?.match(/^query_budget_capped_(\d+)of(\d+)$/);
  const models = source.messageCode?.match(/^model_query_capped_(\d+)of(\d+)$/);
  const coverage = cap ? ` · ${cap[1]}-mile coverage cap`
    : budget ? ` · ${budget[1]} of ${budget[2]} provider groups covered`
    : models ? ` · ${models[1]} of ${models[2]} model groups checked` : "";
  if (source.status === "success") return `${source.acceptedCount} accepted from ${source.discoveredCount}${coverage}`;
  if (source.status === "empty") return `No matches · ${source.searchedCount} searches${coverage}`;
  if (source.messageCode === "rate_limited") return "Provider quota reached";
  if (source.messageCode === "plan_upgrade_required") return "Plan upgrade required";
  if (["credential_unavailable", "credential_missing"].includes(source.messageCode ?? "")) return "Not connected";
  if (source.messageCode === "source_terms_prohibit_automation") return "Manual or email import only";
  if (source.status === "unavailable") return "Temporarily unavailable";
  if (source.status === "challenged") return "Source access challenged";
  return "Collection failed";
}

function relativeDay(value: string, now: number) {
  const days = Math.floor((now - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

// Why the lease lane has no active offers, without calling a stale or silent feed healthy.
export function leaseInputsSummary(sources: SourceResult[], now = Date.now()) {
  const importer = sources.find((source) => source.source === "email_alert");
  const incentives = sources.find((source) => source.source === "marketcheck_incentives");
  const importerLine = !importer
    ? "The authorized lease-alert importer has not run yet."
    : isSourceHealthy(importer, now)
      ? `The authorized lease-alert importer last ran ${relativeDay(importer.finishedAt, now)} and found ${importer.acceptedCount} new item${importer.acceptedCount === 1 ? "" : "s"}.`
      : `The authorized lease-alert importer needs attention (${sourceStatusLabel(importer, now)}).`;
  const incentiveLine = !incentives ? ""
    : isSourceHealthy(incentives, now)
      ? ` The licensed OEM incentive feed is healthy and currently reports ${incentives.discoveredCount === 0 ? "no published lease programs for your models" : `${incentives.discoveredCount} programs`}.`
      : ` The licensed OEM incentive feed needs attention (${sourceStatusLabel(incentives, now)}).`;
  return importerLine + incentiveLine;
}
