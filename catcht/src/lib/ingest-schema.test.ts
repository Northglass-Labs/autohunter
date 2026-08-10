import { describe, expect, it } from "vitest";
import { ingestCandidateSchema } from "./ingest-schema";

const candidate = {
  source: "hemmings" as const,
  sourceListingId: "393590",
  url: "https://www.hemmings.com/listing/1999-mazda-miata-lancaster-pa-393590",
  vin: "JM1NB3537X0131523",
  year: 1999,
  make: "Mazda",
  model: "MX-5 Miata",
  title: "1999 Mazda Miata 10th Anniversary Edition",
  price: 14_000,
  mileage: 34_528,
  distanceMiles: 38,
  location: "Lancaster, PA",
  transmissionClaim: "6-speed manual",
  imageUrls: ["https://images.example.com/exterior.jpg", "https://images.example.com/shifter.jpg"],
  primaryImageUrl: "https://images.example.com/exterior.jpg",
};

describe("ingestCandidateSchema", () => {
  it("accepts authenticated collector photo evidence", () => {
    const result = ingestCandidateSchema.safeParse({
      ...candidate,
      manualEvidence: [
        {
          imageUrl: "https://images.example.com/shifter.jpg",
          shiftPatternVisible: true,
          manualLeverVisible: true,
          stockStyleShifter: true,
          matchingInteriorLikely: true,
          confidence: 0.96,
          observedPattern: "6-speed H-pattern",
          notes: "Original-style Nardi shift knob and matching blue interior are visible.",
          verifierModel: "hermes-vision",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects evidence that is not one of the submitted listing photos", () => {
    const result = ingestCandidateSchema.safeParse({
      ...candidate,
      manualEvidence: [
        {
          imageUrl: "https://unrelated.example.com/shifter.jpg",
          shiftPatternVisible: true,
          manualLeverVisible: true,
          stockStyleShifter: true,
          matchingInteriorLikely: true,
          confidence: 0.95,
          observedPattern: "6-speed H-pattern",
          notes: "Looks manual.",
          verifierModel: "hermes-vision",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-HTTPS listing and image URLs", () => {
    expect(ingestCandidateSchema.safeParse({ ...candidate, url: "http://example.com/car" }).success).toBe(false);
    expect(ingestCandidateSchema.safeParse({ ...candidate, imageUrls: ["ftp://example.com/car.jpg"] }).success).toBe(false);
    expect(ingestCandidateSchema.safeParse({ ...candidate, primaryImageUrl: "data:image/png;base64,AAAA" }).success).toBe(false);
  });

  it("accepts a normalized Leasehackr deal lead with explicit lease economics", () => {
    const result = ingestCandidateSchema.safeParse({
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
      monthlyPayment: 599,
      dueAtSigning: 3_000,
      termMonths: 36,
      annualMiles: 10_000,
      msrp: 52_000,
      effectiveMonthly: 665.69,
      parseConfidence: 0.92,
      region: "Northeast",
      manualEvidence: [],
      expiresAt: "2026-07-18T12:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("accepts an authorized-email benchmark with explicit cash-flow semantics", () => {
    const result = ingestCandidateSchema.safeParse({
      offerKind: "lease",
      condition: "new",
      offerRole: "benchmark",
      sourceMethod: "authorized_email",
      source: "email_alert",
      sourceListingId: "gmail:benchmark-123",
      url: "https://forum.leasehackr.com/t/signed-bmw-ix/123",
      year: 2025,
      make: "BMW",
      model: "iX",
      title: "Signed 2025 BMW iX lease",
      location: "Northeast",
      imageUrls: [],
      monthlyPayment: 685,
      dueAtSigning: 0,
      dueAtSigningIncludesFirstPayment: false,
      termMonths: 36,
      annualMiles: 10_000,
      securityDeposit: 5_600,
      securityDepositRefundable: true,
      effectiveMonthly: 685,
      parseConfidence: 0.95,
      manualEvidence: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offerRole).toBe("benchmark");
      expect(result.data.sourceMethod).toBe("authorized_email");
      expect(result.data.securityDepositRefundable).toBe(true);
    }
  });

  it("rejects invented offer roles and ingestion methods", () => {
    const lease = {
      offerKind: "lease",
      condition: "new",
      source: "email_alert",
      url: "https://dealer.example/lease",
      make: "BMW",
      model: "iX",
      title: "BMW iX lease",
      location: "Northeast",
      imageUrls: [],
      manualEvidence: [],
    };
    expect(ingestCandidateSchema.safeParse({ ...lease, offerRole: "probably_live" }).success).toBe(false);
    expect(ingestCandidateSchema.safeParse({ ...lease, sourceMethod: "scraped_anyway" }).success).toBe(false);
  });

  it("keeps incomplete lease posts as explicit leads but rejects invented zero-dollar terms", () => {
    expect(ingestCandidateSchema.safeParse({
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
      parseConfidence: 0.35,
      manualEvidence: [],
    }).success).toBe(true);
    expect(ingestCandidateSchema.safeParse({
      offerKind: "lease",
      condition: "new",
      source: "leasehackr",
      sourceListingId: "topic-125",
      url: "https://forum.leasehackr.com/t/example/125",
      make: "BMW",
      model: "X3",
      title: "BMW lease specials",
      location: "Northeast",
      imageUrls: [],
      monthlyPayment: 0,
      dueAtSigning: 0,
      termMonths: 0,
      parseConfidence: 0.35,
      manualEvidence: [],
    }).success).toBe(false);
  });

  it("accepts bounded vehicle intelligence with explicit evidence levels", () => {
    const result = ingestCandidateSchema.safeParse({
      ...candidate,
      garageGroup: "ev",
      powertrainCategory: "ev",
      bodyStyle: "SUV",
      seatingCapacity: 5,
      packageNames: ["Driver Assistance Package"],
      featureEvidence: [{
        key: "hands_free_highway",
        label: "Hands-free highway driving",
        status: "expected",
        source: "model_rule",
        evidence: "Exact model-year capability; verify activation and subscription on the vehicle.",
      }],
      featureMatchScore: 65,
      familyFitScore: 82,
      daysOnMarket: 31,
      priceChange: -2_000,
      oneOwner: true,
      cleanTitle: true,
      exteriorColor: "Midnight",
      interiorColor: "Black Mountain",
      enrichmentStatus: "enriched",
    });

    expect(result.success).toBe(true);
  });

  it("accepts bounded NHTSA safety evidence without raw recall narratives", () => {
    const safetyEvidence = {
      source: "nhtsa",
      ratingStatus: "rated",
      overallRating: 4,
      frontalCrashRating: 4,
      sideCrashRating: 5,
      rolloverRating: 4,
      availableVariantCount: 2,
      testedVariantCount: 2,
      recallCampaignCount: 1,
      recallCampaigns: [{
        campaignNumber: "23V471000",
        component: "AIR BAGS:KNEE BOLSTER",
        reportReceivedDate: "2023-10-07",
      }],
      retrievedAt: "2026-08-10T12:00:00.000Z",
    };
    const result = ingestCandidateSchema.safeParse({ ...candidate, safetyEvidence });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.safetyEvidence).toEqual(safetyEvidence);
    expect(ingestCandidateSchema.safeParse({
      ...candidate,
      safetyEvidence: { ...safetyEvidence, overallRating: 6 },
    }).success).toBe(false);
  });

  it("rejects unbounded or invented feature evidence", () => {
    expect(ingestCandidateSchema.safeParse({
      ...candidate,
      garageGroup: "ev",
      powertrainCategory: "ev",
      featureEvidence: [{
        key: "magic_self_driving",
        label: "Magic",
        status: "definitely",
        source: "guess",
        evidence: "Trust me",
      }],
    }).success).toBe(false);
  });
});
