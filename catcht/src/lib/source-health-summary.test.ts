import { describe, expect, it } from "vitest";
import { isSourceHealthy, sourceStatusLabel } from "./source-health-summary";

const now = Date.parse("2026-09-08T12:00:00Z");
const source = { status: "success", finishedAt: "2026-09-08T10:00:00Z", messageCode: null, acceptedCount: 5, discoveredCount: 10, searchedCount: 2 };

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
});
