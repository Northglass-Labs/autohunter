import { describe, expect, it } from "vitest";
import { renderDigestEmail } from "./email-template";
import type { ListingCard, SourceHealth } from "./dal";

const listing: ListingCard = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "1999 Mazda Miata 10th Anniversary Edition",
  year: 1999,
  make: "Mazda",
  model: "MX-5 Miata",
  trim: "10th Anniversary",
  price: 14_000,
  mileage: 34_528,
  distanceMiles: 38,
  location: "Lancaster, PA",
  source: "Hemmings",
  url: "https://www.hemmings.com/listing/1999-mazda-miata",
  primaryImageUrl: "https://images.example.com/actual-miata.jpg",
  manualConfidence: 0.96,
  verificationStatus: "verified",
  dealScore: 77,
  disposition: "neutral",
  lastSeenAt: "2026-07-11T12:00:00.000Z",
  offerKind: "used",
  offerRole: "active_offer",
  sourceMethod: "api",
  condition: "used",
  effectiveMonthly: null,
  monthlyPayment: null,
  dueAtSigning: null,
  dueAtSigningIncludesFirstPayment: null,
  acquisitionFeeIncludedInDueAtSigning: null,
  termMonths: null,
  annualMiles: null,
  securityDeposit: null,
  securityDepositRefundable: null,
  msrp: null,
  parseConfidence: 1,
  region: null,
  sellerName: null,
  vin: "JM1NB3538X0100001",
  garageGroup: "enthusiast",
  powertrainCategory: "gas",
  bodyStyle: "Convertible",
  seatingCapacity: 2,
  packageNames: [],
  featureEvidence: [],
  featureMatchScore: 0,
  familyFitScore: 0,
  daysOnMarket: 12,
  priceChange: null,
  oneOwner: null,
  cleanTitle: null,
  exteriorColor: null,
  interiorColor: null,
  enrichmentStatus: "not_requested",
  safetyEvidence: null,
};

describe("renderDigestEmail", () => {
  it("includes generation-appropriate S580 checks in HTML and plain text", () => {
    const s580: ListingCard = { ...listing, title: "2021 Mercedes-Benz S580", make: "Mercedes-Benz", model: "S-Class",
      trim: "S580 4MATIC", year: 2021, bodyStyle: "Sedan", price: 39900, garageGroup: "gas", powertrainCategory: "hybrid" };
    const message = renderDigestEmail([s580], "2026-09-08", { appUrl: "https://autohunter.example.com", recipientId: "driver",
      actionSecret: "a".repeat(32), brandName: "AutoHunter", maxPrice: 40000 });
    for (const body of [message.html, message.text]) {
      expect(body).toContain("48-volt");
      expect(body).toContain("MBUX");
      expect(body).toContain("/guides/w222");
    }
  });
  it("gives S-Class buyers the actual car, equipment uncertainty, price change and inspection checks in both email formats", () => {
    const s560: ListingCard = { ...listing, title: "2019 Mercedes-Benz S560 4MATIC", make: "Mercedes-Benz", model: "S-Class",
      trim: "S560 4MATIC", year: 2019, bodyStyle: "Sedan", verificationStatus: "not_applicable", garageGroup: "gas",
      price: 23900, mileage: 90000, priceChange: -1100, featureEvidence: [{ key: "surround_view", label: "Surround-view camera",
        status: "unknown", source: "search_target", evidence: "Window sticker needed" }] };
    const message = renderDigestEmail([s560], "2026-09-08", { appUrl: "https://autohunter.example.com", recipientId: "driver",
      actionSecret: "a".repeat(32), brandName: "AutoHunter", maxPrice: 25000 });
    for (const body of [message.html, message.text]) {
      expect(body).toContain("$23,900");
      expect(body).toContain("$1,100 price drop");
      expect(body).toContain("independent inspection");
      expect(body).toContain("Surround-view camera");
      expect(body).toContain("unknown");
      expect(body).toContain("/guides/w222");
    }
    expect(message.text).toContain(s560.url);
    expect(message.html).toContain('name="viewport"');
    expect(message.html).toContain("preview-text");
  });
  it("renders the real listing photo and signed decision links", () => {
    const message = renderDigestEmail([listing], "2026-07-11", {
      appUrl: "https://autohunter.example.com",
      recipientId: "driver",
      actionSecret: "a".repeat(32),
      brandName: "Shift Scout",
      maxPrice: 15_000,
    });

    expect(message.html).toContain(listing.primaryImageUrl);
    expect(message.html).toContain("$15k or less");
    expect(message.html).toContain("Shift Scout");
    expect(message.html).toContain("Manual verified");
    expect(message.html).toContain("Interested");
    expect(message.html).toContain("Pass");
    expect(message.html).toContain("/action?token=");
    expect(message.dashboardUrl).toBe("https://autohunter.example.com/");
    expect(message.subject).toContain("1 fresh manual find");
  });

  it("surfaces family fit and package evidence without promoting expected equipment to confirmed", () => {
    const family: ListingCard = {
      ...listing,
      id: "33333333-3333-4333-8333-333333333333",
      title: "2025 Rivian R1S Dual Motor",
      make: "Rivian",
      model: "R1S",
      garageGroup: "ev",
      powertrainCategory: "ev",
      verificationStatus: "not_applicable",
      manualConfidence: 0,
      familyFitScore: 96,
      featureMatchScore: 83,
      packageNames: ["Adventure Package"],
      featureEvidence: [{
        key: "hands_free_highway",
        label: "Hands-free highway driving",
        status: "expected",
        source: "model_rule",
        evidence: "Gen 2 capability; verify activation and subscription.",
      }, {
        key: "third_row",
        label: "Third row",
        status: "confirmed",
        source: "provider_listing",
        evidence: "7-passenger seating",
      }],
      safetyEvidence: {
        source: "nhtsa",
        ratingStatus: "rated",
        overallRating: 5,
        frontalCrashRating: 5,
        sideCrashRating: 5,
        rolloverRating: 4,
        availableVariantCount: 1,
        testedVariantCount: 1,
        recallCampaignCount: 2,
        recallCampaigns: [],
        retrievedAt: "2026-08-10T12:00:00.000Z",
      },
    };

    const message = renderDigestEmail([family], "2026-08-09", {
      appUrl: "https://autohunter.example.com",
      recipientId: "driver",
      actionSecret: "a".repeat(32),
      brandName: "AutoHunter",
      maxPrice: 70_000,
    });

    expect(message.html).toContain("96 family fit");
    expect(message.html).toContain("<strong>Hands-free highway driving</strong>: expected");
    expect(message.html).toContain("<strong>Third row</strong>: confirmed");
    expect(message.html).toContain("Adventure Package");
    expect(message.html).toContain("Verify expected equipment on the listing or window sticker");
    expect(message.html).toContain("NHTSA 5/5 overall");
    expect(message.html).toContain("2 model-year recall campaigns");
  });

  it("renders a polished quiet-run message", () => {
    const message = renderDigestEmail([], "2026-07-11", {
      appUrl: "https://autohunter.example.com",
      recipientId: "driver",
      actionSecret: "a".repeat(32),
      brandName: "Shift Scout",
      maxPrice: 15_000,
    });

    expect(message.subject).toContain("no new matches");
    expect(message.subject).toContain("Shift Scout");
    expect(message.html).toContain("No new matches today");
  });

  it("renders lease economics without calling a monthly payment a purchase price", () => {
    const lease: ListingCard = {
      ...listing,
      id: "22222222-2222-4222-8222-222222222222",
      offerKind: "lease",
      condition: "new",
      source: "Leasehackr",
      title: "2026 Audi Q5 lease special",
      price: null,
      mileage: null,
      distanceMiles: null,
      manualConfidence: 0,
      verificationStatus: "not_applicable",
      monthlyPayment: 599,
      dueAtSigning: 3_000,
      termMonths: 36,
      annualMiles: 10_000,
      effectiveMonthly: 665.69,
      msrp: 52_000,
      parseConfidence: 0.92,
      region: "Northeast",
    };
    const message = renderDigestEmail([lease], "2026-07-11", {
      appUrl: "https://autohunter.example.com",
      recipientId: "driver",
      actionSecret: "a".repeat(32),
      brandName: "AutoHunter",
      maxPrice: 15_000,
    });

    expect(message.html).toContain("$599/mo");
    expect(message.html).toContain("$666 effective");
    expect(message.html).toContain("36 months");
    expect(message.html).toContain("10,000 miles/year");
    expect(message.html).toContain("Used, new, and lease opportunities");
    expect(message.html).not.toContain("$15k or less");
    expect(message.subject).toContain("vehicle find");
  });

  it("keeps active lease offers, signed benchmarks, and market signals in distinct report sections", () => {
    const activeOffer: ListingCard = {
      ...listing,
      id: "44444444-4444-4444-8444-444444444444",
      title: "2026 Lexus TX 350 Premium AWD",
      offerKind: "lease",
      offerRole: "active_offer",
      condition: "new",
      source: "MarketCheck OEM Incentives",
      monthlyPayment: 656,
      dueAtSigning: 3_200,
      termMonths: 36,
      annualMiles: 10_000,
      effectiveMonthly: 726,
      verificationStatus: "not_applicable",
    };
    const benchmark: ListingCard = {
      ...activeOffer,
      id: "55555555-5555-4555-8555-555555555555",
      title: "Signed 2026 Volvo XC90 PHEV deal",
      offerRole: "benchmark",
      source: "Leasehackr authorized email",
    };
    const signal: ListingCard = {
      ...activeOffer,
      id: "66666666-6666-4666-8666-666666666666",
      title: "Northeast Audi Q8 e-tron program update",
      offerRole: "market_signal",
      monthlyPayment: null,
      dueAtSigning: null,
      termMonths: null,
      annualMiles: null,
      effectiveMonthly: null,
    };

    const message = renderDigestEmail([activeOffer, benchmark, signal], "2026-08-10", {
      appUrl: "https://autohunter.northglass.io",
      recipientId: "driver",
      actionSecret: "a".repeat(32),
      brandName: "AutoHunter",
      maxPrice: 70_000,
    });

    expect(message.html).toContain("Active lease offers");
    expect(message.html).toContain("Signed benchmarks");
    expect(message.html).toContain("Market signals");
    expect(message.html).toContain("Current programs with complete enough terms");
    expect(message.html).toContain("Negotiation context—not live inventory");
    expect(message.html).toContain("Leads with incomplete economics");
    expect(message.html).toContain("Comparison only");
    expect(message.html).toContain("Research lead");
    expect(message.html).toContain("a Northglass Product");
  });

  it("renders explicit source health instead of hiding unavailable providers", () => {
    const sources: SourceHealth[] = [{
      source: "MarketCheck OEM Incentives",
      adapter: "marketcheck_incentives",
      status: "unavailable",
      messageCode: "plan_upgrade_required",
      searchedCount: 1,
      discoveredCount: 0,
      acceptedCount: 0,
      finishedAt: "2026-08-10T11:00:00.000Z",
    }, {
      source: "Auto.dev",
      adapter: "auto_dev",
      status: "success",
      messageCode: null,
      searchedCount: 3,
      discoveredCount: 18,
      acceptedCount: 4,
      finishedAt: new Date().toISOString(),
    }];

    const message = renderDigestEmail([listing], "2026-08-10", {
      appUrl: "https://autohunter.northglass.io",
      recipientId: "driver",
      actionSecret: "a".repeat(32),
      brandName: "AutoHunter",
      maxPrice: 70_000,
    }, sources);

    expect(message.html).toContain("Source health");
    expect(message.html).toContain("MarketCheck OEM Incentives");
    expect(message.html).toContain("Plan upgrade required");
    expect(message.html).toContain("Auto.dev");
    expect(message.html).toContain("4 accepted");
    expect(message.text).toContain("MarketCheck OEM Incentives: unavailable");
  });
});
