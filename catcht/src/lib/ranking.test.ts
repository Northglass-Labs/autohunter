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

  it("treats an active lease term shorter than a year as a parse error, not an offer", () => {
    const lease = {
      offerKind: "lease" as const,
      condition: "new" as const,
      source: "marketcheck_incentives" as const,
      url: "https://dealer.example/telluride-lease",
      make: "Kia",
      model: "Telluride",
      title: "Kia Telluride lease",
      location: "Northeast",
      imageUrls: [],
      manualEvidence: [],
      monthlyPayment: 367,
      dueAtSigning: 3_999,
      annualMiles: 10_000,
      region: "Northeast",
    };
    const policy = { offerKind: "lease" as const, make: "Kia", model: "Telluride", transmission: "any" as const, region: "Northeast" };

    expect(evaluateOffer({ ...lease, termMonths: 7 }, policy)).toMatchObject({ eligible: false, reason: "lease_terms_incomplete" });
    expect(evaluateOffer({ ...lease, termMonths: 36 }, policy)).toMatchObject({ eligible: true });
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

describe("required feature gate", () => {
  const base = {
    ...verified,
    offerKind: "used" as const,
    make: "BMW",
    model: "X5",
    transmissionClaim: "Automatic",
    price: 58_000,
    mileage: 22_000,
    distanceMiles: 40,
    requiresManualVerification: false,
    manualEvidence: [],
  };
  const policy = {
    offerKind: "used" as const,
    make: "BMW",
    model: "X5",
    transmission: "automatic" as const,
    radiusMiles: 100,
    maxPrice: 70_000,
    maxMileage: 80_000,
    requiredFeatures: ["third_row"] as const,
  };
  const evidence = (status: "confirmed" | "expected" | "unknown") => [{
    key: "third_row" as const,
    label: "Third row",
    status,
    source: status === "confirmed" ? ("provider_listing" as const) : status === "expected" ? ("model_rule" as const) : ("search_target" as const),
    evidence: "test evidence",
  }];

  it("rejects an active offer whose required feature has no credible evidence", () => {
    expect(evaluateOffer({ ...base, featureEvidence: evidence("unknown") }, policy))
      .toMatchObject({ eligible: false, reason: "required_feature_missing" });
    expect(evaluateOffer({ ...base, featureEvidence: [] }, policy))
      .toMatchObject({ eligible: false, reason: "required_feature_missing" });
  });

  it("accepts confirmed or expected evidence for a required feature", () => {
    expect(evaluateOffer({ ...base, featureEvidence: evidence("confirmed") }, policy)).toMatchObject({ eligible: true });
    expect(evaluateOffer({ ...base, featureEvidence: evidence("expected") }, policy)).toMatchObject({ eligible: true });
  });

  it("leaves offers without a required-feature policy unaffected", () => {
    expect(evaluateOffer({ ...base, featureEvidence: evidence("unknown") }, { ...policy, requiredFeatures: [] }))
      .toMatchObject({ eligible: true });
  });

  it("does not gate lease benchmarks that exist only as negotiation context", () => {
    const benchmark = {
      ...base,
      offerKind: "lease" as const,
      condition: "new" as const,
      offerRole: "benchmark" as const,
      price: null,
      mileage: null,
      monthlyPayment: 620,
      dueAtSigning: 2_500,
      termMonths: 36,
      parseConfidence: 0.9,
      featureEvidence: evidence("unknown"),
    };
    expect(evaluateOffer(benchmark, { ...policy, offerKind: "lease" as const }).eligible).toBe(true);
  });
});

describe("used-car value against comparable listings (ADR-023)", () => {
  const policy = {
    offerKind: "used" as const,
    make: "Rivian",
    model: "R1S",
    transmission: "automatic" as const,
    maxPrice: 70_000,
    maxMileage: 80_000,
    radiusMiles: 250,
  };
  const r1s: CandidateListing = {
    ...verified,
    source: "marketcheck",
    year: 2023,
    make: "Rivian",
    model: "R1S",
    title: "2023 Rivian R1S Adventure",
    price: 60_000,
    mileage: 30_000,
    distanceMiles: 50,
    marketEstimate: 60_000,
    msrp: null,
    requiresManualVerification: false,
    manualEvidence: [],
  };

  it("scores price against the comparable-listing estimate", () => {
    const atMarket = evaluateOffer(r1s, policy);
    const below = evaluateOffer({ ...r1s, price: 54_000 }, policy);
    const above = evaluateOffer({ ...r1s, price: 66_000 }, policy);

    // 25 value points at market and 2 per percent either side, 12 for 30,000 miles, 8 for 50 miles.
    expect(atMarket).toMatchObject({ eligible: true, score: 45, discountPercent: 0 });
    expect(below).toMatchObject({ eligible: true, score: 65, discountPercent: 10 });
    expect(above).toMatchObject({ eligible: true, score: 25 });
  });

  it("ignores provider MSRP for a used car", () => {
    const withoutEstimate = evaluateOffer({ ...r1s, marketEstimate: null }, policy);
    const withMsrp = evaluateOffer({ ...r1s, marketEstimate: null, msrp: 80_000 }, policy);

    expect(withoutEstimate).toMatchObject({ score: 40, discountPercent: null });
    expect(withMsrp).toMatchObject({ score: 40, discountPercent: null });
  });

  it("keeps MSRP as the reference for a new car without an estimate", () => {
    const fresh = evaluateOffer({ ...r1s, offerKind: "new", condition: "new", mileage: 10, price: 72_000, msrp: 80_000, marketEstimate: null }, { ...policy, offerKind: "new", maxPrice: 90_000 });

    expect(fresh.discountPercent).toBeCloseTo(10, 5);
  });

  it("rejects an implausible used price as a data error", () => {
    expect(evaluateOffer({ ...r1s, price: 190, marketEstimate: null }, policy)).toMatchObject({ eligible: false, reason: "price_suspect" });
    expect(evaluateOffer({ ...r1s, price: 25_000 }, policy)).toMatchObject({ eligible: false, reason: "price_suspect" });
    expect(evaluateOffer({ ...r1s, price: 30_000 }, policy)).toMatchObject({ eligible: true });
  });
});
