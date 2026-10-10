import { describe, expect, it } from "vitest";
import { isSourceHealthy, leaseInputsSummary, sourceStatusLabel, sourcesForOfferKinds } from "./source-health-summary";

const now = Date.parse("2026-09-08T12:00:00Z");
const source = { source: "auto_dev", status: "success", finishedAt: "2026-09-08T10:00:00Z", messageCode: null, acceptedCount: 5, discoveredCount: 10, searchedCount: 2 };

describe("source health freshness", () => {
  it("does not count an old successful import or an invalid timestamp as healthy", () => {
    expect(isSourceHealthy(source, now)).toBe(true);
    for (const finishedAt of ["2026-08-10T08:24:01Z", "invalid", "2026-09-10T12:00:00Z"]) {
      expect(isSourceHealthy({ ...source, finishedAt }, now)).toBe(false);
    }
    expect(sourceStatusLabel({ ...source, finishedAt: "2026-08-10T08:24:01Z" }, now)).toMatch(/stale/i);
  });
  it("keeps coverage caps visible on a recent healthy source", () => {
    expect(sourceStatusLabel({ ...source, messageCode: "radius_capped_100mi" }, now)).toContain("100-mile coverage cap");
    expect(isSourceHealthy({ ...source, status: "failed" }, now)).toBe(false);
  });
  it("judges each feed against its own collection schedule", () => {
    const seventyOneHoursAgo = "2026-09-05T13:00:00Z";
    expect(isSourceHealthy({ ...source, source: "marketcheck", finishedAt: seventyOneHoursAgo }, now)).toBe(true);
    expect(isSourceHealthy({ ...source, source: "auto_dev", finishedAt: seventyOneHoursAgo }, now)).toBe(false);
    expect(isSourceHealthy({ ...source, source: "marketcheck_incentives", finishedAt: "2026-08-31T12:00:00Z" }, now)).toBe(true);
    expect(isSourceHealthy({ ...source, source: "marketcheck_incentives", finishedAt: "2026-08-29T12:00:00Z" }, now)).toBe(false);
  });
  it("names the last collection date on a stale feed", () => {
    expect(sourceStatusLabel({ ...source, finishedAt: "2026-08-10T08:24:01Z" }, now)).toBe("Stale · last collected Aug 10");
    expect(sourceStatusLabel({ ...source, finishedAt: "invalid" }, now)).toBe("Stale · no recent collection result");
  });
});

describe("providers that answer with nothing", () => {
  const dry = { ...source, source: "marketcheck_incentives", status: "empty", searchedCount: 7, discoveredCount: 0, acceptedCount: 0 };

  it("flags a feed whose provider has returned no results for a week", () => {
    expect(isSourceHealthy({ ...dry, lastDiscoveryAt: null }, now)).toBe(false);
    expect(sourceStatusLabel({ ...dry, lastDiscoveryAt: null }, now)).toBe("No provider results yet");
    expect(isSourceHealthy({ ...dry, lastDiscoveryAt: "2026-08-10T08:24:01Z" }, now)).toBe(false);
    expect(sourceStatusLabel({ ...dry, lastDiscoveryAt: "2026-08-10T08:24:01Z" }, now)).toBe("No provider results since Aug 10");
  });
  it("treats one empty run after recent results as an ordinary quiet day", () => {
    expect(isSourceHealthy({ ...dry, lastDiscoveryAt: "2026-09-07T10:00:00Z" }, now)).toBe(true);
    expect(sourceStatusLabel({ ...dry, lastDiscoveryAt: "2026-09-07T10:00:00Z" }, now)).toBe("No matches · 7 searches");
  });
  it("does not flag an idle work queue or a snapshot stored without discovery history", () => {
    expect(isSourceHealthy({ ...dry, searchedCount: 0, lastDiscoveryAt: null }, now)).toBe(true);
    expect(isSourceHealthy(dry, now)).toBe(true);
  });
});

describe("source relevance", () => {
  const names = ["marketcheck", "auto_dev", "nhtsa", "manual_photo_verification", "marketcheck_incentives", "email_alert", "leasehackr", "future_feed"];
  const sources = names.map((name) => ({ ...source, source: name }));
  const relevant = (kinds: Parameters<typeof sourcesForOfferKinds>[1]) => sourcesForOfferKinds(sources, kinds).map((item) => item.source);

  it("reports lease feeds to lease shoppers and inventory feeds to buyers", () => {
    expect(relevant(["lease"])).toEqual(["marketcheck_incentives", "email_alert", "future_feed"]);
    expect(relevant(["used"])).toEqual(["marketcheck", "auto_dev", "nhtsa", "manual_photo_verification", "future_feed"]);
    expect(relevant(["new"])).toEqual(["marketcheck", "auto_dev", "nhtsa", "future_feed"]);
  });
  it("never reports the retired automated Leasehackr feed", () => {
    expect(relevant(["used", "new", "lease"])).not.toContain("leasehackr");
  });
});

describe("lease inputs summary", () => {
  it("does not call a stale importer or a feed that never returned a program healthy", () => {
    const summary = leaseInputsSummary([
      { ...source, source: "email_alert", finishedAt: "2026-08-10T08:24:01Z", acceptedCount: 1 },
      { ...source, source: "marketcheck_incentives", status: "empty", searchedCount: 7, discoveredCount: 0, acceptedCount: 0, lastDiscoveryAt: null },
    ], now);
    expect(summary).toBe("The authorized lease-alert importer needs attention (Stale · last collected Aug 10). The licensed OEM incentive feed needs attention (No provider results yet).");
  });
  it("reports working lease inputs", () => {
    const summary = leaseInputsSummary([
      { ...source, source: "email_alert", acceptedCount: 2 },
      { ...source, source: "marketcheck_incentives", discoveredCount: 14, lastDiscoveryAt: source.finishedAt },
    ], now);
    expect(summary).toBe("The authorized lease-alert importer last ran today and found 2 new items. The licensed OEM incentive feed is healthy and currently reports 14 programs.");
    expect(leaseInputsSummary([], now)).toBe("The authorized lease-alert importer has not run yet.");
  });
});
