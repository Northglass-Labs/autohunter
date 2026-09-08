import { describe, expect, it } from "vitest";
import { sClassPreset } from "./search-presets";
import { evaluateOffer } from "./ranking";
import { savedSearchInputSchema } from "./saved-search-schema";
import type { CandidateListing } from "./types";

describe("S-Class search presets", () => {
  it("raises all three ceilings while preserving each generation and existing mileage limit", () => {
    for (const variant of ["450", "560", "580"] as const) {
      const preset = sClassPreset(variant);
      expect(preset).toMatchObject({ maxPrice: 40000, maxMileage: 120000, bodyStyle: "sedan", requiredFeatures: [],
        yearMin: variant === "580" ? 2021 : 2018, yearMax: variant === "580" ? 2025 : 2020 });
      expect(savedSearchInputSchema.safeParse({ ...preset, zip: "10001" }).success).toBe(true);
    }
    expect(sClassPreset("580").desiredFeatures).toContain("rear_axle_steering");
    expect(sClassPreset("580").desiredFeatures).not.toContain("magic_body_control");
  });

  it("enforces S580 identity, model years, price and mileage after normalization", () => {
    const policy = sClassPreset("580");
    const car: CandidateListing = { offerKind: "used", source: "marketcheck", make: "Mercedes-Benz", model: "S-Class",
      trim: "S580 4MATIC", bodyStyle: "Sedan", year: 2021, title: "2021 Mercedes-Benz S580", price: 40000,
      mileage: 120000, distanceMiles: 42, location: "Example", url: "https://dealer.example/s580", imageUrls: [],
      manualEvidence: [], requiresManualVerification: false, transmissionClaim: "Automatic", powertrainCategory: "hybrid" };
    expect(evaluateOffer(car, policy).eligible).toBe(true);
    for (const change of [{ trim: "S580e" }, { trim: "S 580 e" }, { year: 2020 }, { year: 2026 },
      { price: 40001 }, { mileage: 120001 }, { bodyStyle: "Coupe" }, { bodyStyle: null }]) {
      expect(evaluateOffer({ ...car, ...change }, policy).eligible, JSON.stringify(change)).toBe(false);
    }
  });
});
