import { describe, expect, it } from "vitest";
import { evaluateCandidate, evaluateOffer, manualVerification, mergeManualEvidence, shouldRecommend } from "./ranking";
import type { CandidateListing } from "./types";

const verified: CandidateListing = {
  source: "autotrader",
  sourceListingId: "abc",
  url: "https://example.com/abc",
  year: 2017,
  make: "Mazda",
  model: "MX-5 Miata",
  title: "2017 Mazda MX-5 Miata Club",
  price: 14_000,
  mileage: 65_000,
  distanceMiles: 75,
  location: "Baltimore, MD",
  marketEstimate: 20_000,
  imageUrls: ["https://img.example/shift.jpg"],
  manualEvidence: [
    {
      imageUrl: "https://img.example/shift.jpg",
      shiftPatternVisible: true,
      manualLeverVisible: true,
      stockStyleShifter: true,
      matchingInteriorLikely: true,
      confidence: 0.94,
      observedPattern: "R-1-2-3-4-5-6",
      notes: "Six-speed H pattern and clutch-era console visible",
    },
  ],
};

describe("evaluateCandidate", () => {
  it("accepts an in-budget listing with strong manual-photo evidence", () => {
    expect(evaluateCandidate(verified)).toMatchObject({ eligible: true });
  });

  it("retains persisted manual proof when a later scrape has no new verifier output", () => {
    const refreshed = {
      ...verified.manualEvidence[0],
      confidence: 0.97,
      notes: "Fresh review of the same source photo",
    };

    expect(mergeManualEvidence([], verified.manualEvidence)).toEqual(verified.manualEvidence);
    expect(mergeManualEvidence([refreshed], verified.manualEvidence)).toEqual([refreshed]);
  });

  it("rejects a listing that only claims manual in text", () => {
    expect(
      evaluateCandidate({ ...verified, transmissionClaim: "6-speed manual", manualEvidence: [] }),
    ).toMatchObject({ eligible: false, reason: "manual_photo_unverified" });
  });

  it("accepts a clearly visible manual lever when the knob is aftermarket and its pattern is unreadable", () => {
    const result = evaluateCandidate({
      ...verified,
      transmissionClaim: "5-speed manual",
      manualEvidence: [
        {
          ...verified.manualEvidence[0],
          shiftPatternVisible: false,
          stockStyleShifter: false,
          confidence: 0.82,
          observedPattern: null,
          notes: "Conventional lever and fitted shift boot are clear; the wooden knob engraving is not readable.",
        },
      ],
    });

    expect(result).toMatchObject({ eligible: true, manualConfidence: 0.82 });
  });

  it("tracks a manual-filtered listing with no accessible gallery as pending instead of rejected", () => {
    expect(
      manualVerification({ ...verified, transmissionClaim: "6-speed manual", manualEvidence: [] }),
    ).toMatchObject({ status: "pending", confidence: 0 });
  });

  it("does not treat an automatic speed count as a manual claim", () => {
    expect(
      manualVerification({ ...verified, transmissionClaim: "6-speed automatic", manualEvidence: [] }),
    ).toMatchObject({ status: "unverified" });
  });

  it("enforces a $15k price ceiling and allows up to 120k miles", () => {
    expect(evaluateCandidate({ ...verified, price: 15_001 })).toMatchObject({
      eligible: false,
      reason: "price_over_cap",
    });
    expect(evaluateCandidate({ ...verified, price: 15_000, mileage: 120_000, marketEstimate: null })).toMatchObject({
      eligible: true,
    });
    expect(evaluateCandidate({ ...verified, mileage: 120_001 })).toMatchObject({
      eligible: false,
      reason: "mileage_over_cap",
    });
  });
});

describe("evaluateOffer", () => {
  it("uses saved-search limits instead of the legacy global cap", () => {
    expect(evaluateOffer({
      ...verified,
      price: 24_000,
      mileage: 70_000,
    }, {
      offerKind: "used",
      make: "Mazda",
      model: "MX-5 Miata",
      transmission: "manual",
      maxPrice: 25_000,
      maxMileage: 80_000,
      radiusMiles: 100,
    })).toMatchObject({ eligible: true, verificationStatus: "verified" });
  });

  it("fails closed when a normalized offer widens or contradicts its saved search", () => {
    const policy = {
      offerKind: "used" as const,
      make: "Mazda",
      model: "MX-5 Miata",
      transmission: "manual" as const,
      maxPrice: 20_000,
      maxMileage: 80_000,
      radiusMiles: 100,
    };
    expect(evaluateOffer({ ...verified, price: 20_001 }, policy)).toMatchObject({
      eligible: false,
      reason: "price_over_cap",
    });
    expect(evaluateOffer({
      ...verified,
      requiresManualVerification: false,
      manualEvidence: [],
    }, policy)).toMatchObject({
      eligible: false,
      reason: "manual_photo_unverified",
    });
    expect(evaluateOffer({ ...verified, model: "Mazda3" }, policy)).toMatchObject({
      eligible: false,
      reason: "search_mismatch",
    });
  });

  it("ranks a non-manual new inventory offer without requiring shifter vision", () => {
    expect(evaluateOffer({
      ...verified,
      offerKind: "new",
      condition: "new",
      mileage: 8,
      price: 34_500,
      marketEstimate: 37_500,
      requiresManualVerification: false,
      manualEvidence: [],
    })).toMatchObject({ eligible: true, verificationStatus: "not_applicable" });
  });

  it("rewards confirmed family equipment without treating unknown equipment as absent", () => {
    const base = {
      ...verified,
      offerKind: "used" as const,
      make: "BMW",
      model: "X5",
      trim: "xDrive40i",
      transmissionClaim: "Automatic",
      price: 58_000,
      mileage: 22_000,
      distanceMiles: 40,
      marketEstimate: 62_000,
      requiresManualVerification: false,
      manualEvidence: [],
      garageGroup: "gas" as const,
      powertrainCategory: "gas" as const,
      familyFitScore: 82,
    };
    const policy = {
      offerKind: "used" as const,
      make: "BMW",
      model: "X5",
      transmission: "automatic" as const,
      radiusMiles: 100,
      maxPrice: 70_000,
      maxMileage: 80_000,
      desiredFeatures: ["hands_free_highway", "rear_axle_steering"] as const,
    };
    const unknown = evaluateOffer({ ...base, featureMatchScore: 0, featureEvidence: [] }, policy);
    const equipped = evaluateOffer({
      ...base,
      featureMatchScore: 100,
      featureEvidence: [{
        key: "hands_free_highway",
        label: "Hands-free highway driving",
        status: "confirmed",
        source: "provider_listing",
        evidence: "Highway Assistant",
      }],
    }, policy);

    expect(unknown.eligible).toBe(true);
    expect(equipped.score).toBeGreaterThan(unknown.score);
    expect(equipped.featureMatchScore).toBe(100);
    expect(equipped.familyFitScore).toBe(82);
  });

  it("enforces saved model-year limits after provider normalization", () => {
    expect(evaluateOffer({
      ...verified,
      year: 2021,
      requiresManualVerification: false,
      manualEvidence: [],
    }, {
      offerKind: "used",
      make: "Mazda",
      model: "MX-5 Miata",
      transmission: "any",
      yearMin: 2022,
      yearMax: 2025,
      maxPrice: 20_000,
      maxMileage: 80_000,
      radiusMiles: 100,
    })).toMatchObject({ eligible: false, reason: "year_out_of_range" });
  });

  it("ranks a disclosed lease and keeps a vague forum post as a lead", () => {
    expect(evaluateOffer({
      offerKind: "lease",
      condition: "new",
      source: "leasehackr",
      sourceListingId: "topic-123",
      url: "https://forum.leasehackr.com/t/example/123",
      year: 2026,
      make: "Audi",
      model: "Q5",
      title: "2026 Audi Q5 lease special",
      location: "Northeast",
      imageUrls: [],
      manualEvidence: [],
      monthlyPayment: 599,
      dueAtSigning: 3_000,
      termMonths: 36,
      annualMiles: 10_000,
      effectiveMonthly: 665.69,
      msrp: 52_000,
      parseConfidence: 0.92,
    })).toMatchObject({ eligible: true, verificationStatus: "not_applicable" });

    expect(evaluateOffer({
      offerKind: "lease",
      condition: "new",
      source: "leasehackr",
      sourceListingId: "topic-124",
      url: "https://forum.leasehackr.com/t/example/124",
      make: "BMW",
      model: "X3",
      title: "BMW lease specials",
      location: "Northeast",
      imageUrls: [],
      manualEvidence: [],
      parseConfidence: 0.35,
    })).toMatchObject({ eligible: false, reason: "lease_terms_incomplete", verificationStatus: "not_applicable" });
  });

  it("enforces lease economics again at the ingest boundary", () => {
    const lease = {
      offerKind: "lease" as const,
      condition: "new" as const,
      source: "leasehackr" as const,
      url: "https://forum.leasehackr.com/t/example/125",
      make: "Audi",
      model: "Q5",
      title: "Audi Q5 lease",
      location: "Northeast",
      imageUrls: [],
      manualEvidence: [],
      monthlyPayment: 700,
      dueAtSigning: 4_000,
      termMonths: 36,
      annualMiles: 7_500,
      effectiveMonthly: 791.67,
      region: "Northeast",
    };
    const policy = {
      offerKind: "lease" as const,
      make: "Audi",
      model: "Q5",
      transmission: "any" as const,
      region: "Northeast",
      maxEffectiveMonthly: 750,
      maxDueAtSigning: 5_000,
      minAnnualMiles: 10_000,
    };
    expect(evaluateOffer(lease, policy)).toMatchObject({
      eligible: false,
      reason: "effective_monthly_over_cap",
    });
  });

  it("keeps signed benchmarks and official market signals visible without treating them as live offers", () => {
    const policy = {
      offerKind: "lease" as const,
      make: "BMW",
      model: "iX",
      transmission: "any" as const,
      region: "Northeast",
      maxEffectiveMonthly: 600,
      maxDueAtSigning: 2_000,
      minAnnualMiles: 10_000,
    };
    const base = {
      offerKind: "lease" as const,
      condition: "new" as const,
      source: "email_alert" as const,
      sourceMethod: "authorized_email" as const,
      url: "https://forum.leasehackr.com/t/bmw-ix/126",
      make: "BMW",
      model: "iX",
      title: "BMW iX lease market intelligence",
      location: "Northeast",
      region: "Northeast",
      imageUrls: [],
      manualEvidence: [],
    };
    expect(evaluateOffer({
      ...base,
      offerRole: "benchmark",
      monthlyPayment: 685,
      dueAtSigning: 0,
      dueAtSigningIncludesFirstPayment: false,
      termMonths: 36,
      annualMiles: 10_000,
      effectiveMonthly: 685,
      parseConfidence: 0.95,
    }, policy)).toMatchObject({ eligible: true, reason: "eligible", verificationStatus: "not_applicable" });

    expect(evaluateOffer({
      ...base,
      offerRole: "market_signal",
      parseConfidence: 0.45,
    }, policy)).toMatchObject({ eligible: true, reason: "eligible", verificationStatus: "not_applicable" });

    expect(evaluateOffer({
      ...base,
      offerRole: "active_offer",
      parseConfidence: 0.45,
    }, policy)).toMatchObject({ eligible: false, reason: "lease_terms_incomplete" });
  });
});

describe("shouldRecommend", () => {
  it("never repeats ignored or interested listings", () => {
    expect(shouldRecommend(verified, { disposition: "ignored", lastEmailedAt: null, lastEmailedPrice: null })).toBe(false);
    expect(shouldRecommend(verified, { disposition: "interested", lastEmailedAt: null, lastEmailedPrice: null })).toBe(false);
  });

  it("recommends a recently emailed neutral listing only after a material price drop", () => {
    const recent = new Date(Date.now() - 3 * 86_400_000);
    expect(shouldRecommend(verified, { disposition: "neutral", lastEmailedAt: recent, lastEmailedPrice: 14_200 })).toBe(false);
    expect(shouldRecommend({ ...verified, price: 13_000 }, { disposition: "neutral", lastEmailedAt: recent, lastEmailedPrice: 14_200 })).toBe(true);
  });
});
