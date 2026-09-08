import { describe, expect, it } from "vitest";
import { evaluateOffer, type OfferEvaluationPolicy } from "./ranking";
import { savedSearchInputSchema } from "./saved-search-schema";
import type { CandidateListing } from "./types";

const policy: OfferEvaluationPolicy & { bodyStyle: string; trimAliases: string[] } = {
  offerKind: "used", make: "Mercedes-Benz", model: "S-Class", trim: "S 560", trimAliases: ["S560"],
  bodyStyle: "sedan", transmission: "automatic", yearMin: 2018, yearMax: 2020,
  maxPrice: 25000, maxMileage: 120000, radiusMiles: 250,
};
const car: CandidateListing = {
  offerKind: "used", source: "marketcheck", make: "Mercedes-Benz", model: "S-Class", trim: "S560 4MATIC",
  bodyStyle: "Sedan", year: 2019, title: "2019 Mercedes-Benz S560", price: 23900, mileage: 90000,
  distanceMiles: 42, location: "Example", url: "https://dealer.example/s560", imageUrls: [], manualEvidence: [],
  requiresManualVerification: false, transmissionClaim: "Automatic",
};

describe("W222 server boundary", () => {
  it("accepts S560 trim aliases but rejects S560e, non-sedans, unknown body and hard limits", () => {
    expect(evaluateOffer(car, policy).eligible).toBe(true);
    for (const change of [{ trim: "S560e" }, { trim: "S 560 e" }, { trim: null }, { bodyStyle: "Coupe" },
      { bodyStyle: null }, { year: 2017 }, { year: 2021 }, { price: 25001 }, { mileage: 120001 }, { distanceMiles: 251 }]) {
      expect(evaluateOffer({ ...car, ...change }, policy).eligible, JSON.stringify(change)).toBe(false);
    }
  });
  it("retains readable feature selections and a validated body-style restriction", () => {
    const input = { ...policy, name: "S560", zip: "10001", desiredFeatures: ["apple_carplay", "ventilated_front_seats", "burmester_3d"] };
    const parsed = savedSearchInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ bodyStyle: "sedan", desiredFeatures: input.desiredFeatures });
    expect(savedSearchInputSchema.safeParse({ ...input, bodyStyle: "anything" }).success).toBe(false);
  });
});
