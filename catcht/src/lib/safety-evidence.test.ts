import { describe, expect, it } from "vitest";
import { parseSafetyEvidence } from "./safety-evidence";

describe("parseSafetyEvidence", () => {
  it("preserves missing NHTSA ratings as null instead of a sortable sentinel", () => {
    expect(parseSafetyEvidence({
      source: "nhtsa",
      ratingStatus: "not_rated",
      overallRating: null,
      frontalCrashRating: null,
      sideCrashRating: null,
      rolloverRating: null,
      availableVariantCount: 0,
      testedVariantCount: 0,
      recallCampaignCount: 0,
      recallCampaigns: [],
      retrievedAt: "2026-08-10T00:00:00.000Z",
    })?.overallRating).toBeNull();
  });

  it("rejects malformed persisted evidence instead of crashing a private report", () => {
    expect(parseSafetyEvidence({ source: "nhtsa", ratingStatus: "rated", retrievedAt: "invalid" })).toBeNull();
  });
});
