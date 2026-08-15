import { describe, expect, it } from "vitest";
import { mergeFeatureIntelligence } from "./feature-intelligence";
import type { CandidateListing, VehicleFeatureEvidence } from "./types";

const base: CandidateListing = {
  source: "marketcheck",
  sourceListingId: "mc-1",
  url: "https://dealer.example/x5",
  year: 2024,
  make: "BMW",
  model: "X5",
  title: "2024 BMW X5 xDrive40i",
  price: 56_000,
  mileage: 12_000,
  distanceMiles: 25,
  location: "Princeton, NJ",
  imageUrls: ["https://images.example/x5.jpg"],
  manualEvidence: [],
  bodyStyle: "SUV",
  seatingCapacity: 5,
  packageNames: [],
  featureMatchScore: 0,
  familyFitScore: 70,
  enrichmentStatus: "budget_deferred",
};

function evidence(status: VehicleFeatureEvidence["status"], key: VehicleFeatureEvidence["key"] = "hands_free_highway"): VehicleFeatureEvidence {
  return {
    key,
    label: "Hands-free highway driving",
    status,
    source: status === "confirmed" ? "provider_listing" : status === "expected" ? "model_rule" : "search_target",
    evidence: `${status} evidence`,
  };
}

describe("mergeFeatureIntelligence", () => {
  it("keeps persisted confirmed evidence when a later cycle could not re-enrich", () => {
    const merged = mergeFeatureIntelligence(
      { ...base, featureEvidence: [evidence("unknown")] },
      { featureEvidence: [evidence("confirmed")], packageNames: ["Driving Assistance Professional"], enrichmentStatus: "enriched" },
    );

    expect(merged.featureEvidence?.[0].status).toBe("confirmed");
    expect(merged.enrichmentStatus).toBe("enriched");
    expect(merged.packageNames).toContain("Driving Assistance Professional");
    expect(merged.featureMatchScore).toBe(100);
  });

  it("lets a fresh enriched inference replace persisted evidence entirely, including downgrades", () => {
    const merged = mergeFeatureIntelligence(
      { ...base, enrichmentStatus: "enriched", featureEvidence: [evidence("unknown")], featureMatchScore: 0 },
      { featureEvidence: [evidence("confirmed")], packageNames: ["Old Package"], enrichmentStatus: "enriched" },
    );

    expect(merged.featureEvidence?.[0].status).toBe("unknown");
    expect(merged.packageNames).not.toContain("Old Package");
  });

  it("prefers fresh evidence on equal rank and higher incoming rank", () => {
    const incomingExpected = { ...evidence("expected"), evidence: "fresh summary quote" };
    const merged = mergeFeatureIntelligence(
      { ...base, featureEvidence: [incomingExpected] },
      { featureEvidence: [{ ...evidence("expected"), evidence: "stale note" }], packageNames: [], enrichmentStatus: "budget_deferred" },
    );

    expect(merged.featureEvidence?.[0].evidence).toBe("fresh summary quote");
  });

  it("returns the candidate untouched when nothing was persisted", () => {
    const candidate = { ...base, featureEvidence: [evidence("unknown")] };
    expect(mergeFeatureIntelligence(candidate, null)).toBe(candidate);
  });

  it("recomputes family fit when a persisted third row survives the merge", () => {
    const merged = mergeFeatureIntelligence(
      { ...base, seatingCapacity: 7, featureEvidence: [evidence("unknown", "third_row")], familyFitScore: 85 },
      { featureEvidence: [evidence("confirmed", "third_row")], packageNames: [], enrichmentStatus: "enriched" },
    );

    // 35 base + 20 (5 seats) + 15 (7 seats) + 15 (SUV) + 10 (third row evidenced) = 95
    expect(merged.familyFitScore).toBe(95);
    expect(merged.featureEvidence?.[0].status).toBe("confirmed");
  });
});
