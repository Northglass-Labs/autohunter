import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ListingCard as Listing } from "@/lib/dal";

vi.mock("@/app/actions", () => ({ setDispositionAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ListingCard } from "./listing-card";

const listing: Listing = {
  id: "11111111-1111-4111-8111-111111111111",
  vin: "7PDSGABL5SN000001",
  title: "2025 Rivian R1S Dual Motor",
  year: 2025,
  make: "Rivian",
  model: "R1S",
  trim: "Dual Motor",
  price: 64_500,
  mileage: 18_000,
  distanceMiles: 44,
  location: "Princeton, NJ",
  source: "marketcheck",
  url: "https://dealer.example/r1s",
  primaryImageUrl: "https://images.example/r1s.jpg",
  manualConfidence: 0,
  verificationStatus: "not_applicable",
  dealScore: 88,
  disposition: "interested",
  lastSeenAt: "2026-08-09T12:00:00.000Z",
  offerKind: "used",
  condition: "used",
  offerRole: "active_offer",
  sourceMethod: "api",
  effectiveMonthly: null,
  monthlyPayment: null,
  dueAtSigning: null,
  dueAtSigningIncludesFirstPayment: null,
  acquisitionFeeIncludedInDueAtSigning: null,
  termMonths: null,
  annualMiles: null,
  securityDeposit: null,
  securityDepositRefundable: null,
  msrp: 98_000,
  parseConfidence: 1,
  region: null,
  sellerName: "Example Rivian",
  garageGroup: "ev",
  powertrainCategory: "ev",
  bodyStyle: "SUV",
  seatingCapacity: 7,
  packageNames: [],
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
  featureMatchScore: 83,
  familyFitScore: 96,
  daysOnMarket: 21,
  priceChange: -3_500,
  oneOwner: true,
  cleanTitle: true,
  exteriorColor: "El Cap Granite",
  interiorColor: "Black Mountain",
  enrichmentStatus: "enriched",
  safetyEvidence: {
    source: "nhtsa",
    ratingStatus: "rated",
    overallRating: 4,
    frontalCrashRating: 4,
    sideCrashRating: 5,
    rolloverRating: 4,
    availableVariantCount: 2,
    testedVariantCount: 2,
    recallCampaignCount: 8,
    recallCampaigns: [{
      campaignNumber: "23V471000",
      component: "AIR BAGS:KNEE BOLSTER",
      reportReceivedDate: "2023-10-07",
    }],
    retrievedAt: "2026-08-10T12:00:00.000Z",
  },
};

describe("ListingCard family queue", () => {
  it("shows the lane, evidence confidence, family fit, real source link, and reversible decision", () => {
    const html = renderToStaticMarkup(<ListingCard listing={listing} view="interested" />);

    expect(html).toContain("EV");
    expect(html).toContain("96 family fit");
    expect(html).toContain("Hands-free highway driving");
    expect(html).toContain("expected");
    expect(html).toContain("Verify on the listing or window sticker");
    expect(html).toContain("NHTSA 4 of 5 overall");
    expect(html).toContain("8 model-year recall campaigns");
    expect(html).toContain("check this VIN for open status");
    expect(html).toContain("Back to review");
    expect(html).toContain("Pass");
    expect(html).toContain("https://dealer.example/r1s");
  });

  it("labels a signed lease benchmark and refundable MSDs without calling it active", () => {
    const html = renderToStaticMarkup(<ListingCard listing={{
      ...listing,
      id: "22222222-2222-4222-8222-222222222222",
      offerKind: "lease",
      condition: "new",
      offerRole: "benchmark",
      sourceMethod: "authorized_email",
      garageGroup: "lease",
      title: "Signed 2025 BMW iX M60",
      source: "email_alert",
      url: "https://forum.leasehackr.com/t/signed-bmw-ix/123",
      price: null,
      mileage: null,
      distanceMiles: null,
      monthlyPayment: 685,
      dueAtSigning: 0,
      dueAtSigningIncludesFirstPayment: false,
      termMonths: 36,
      annualMiles: 10_000,
      effectiveMonthly: 685,
      securityDeposit: 5_600,
      securityDepositRefundable: true,
      region: "Northeast",
      parseConfidence: 0.95,
      verificationStatus: "not_applicable",
      disposition: "neutral",
    }} view="finds" />);

    expect(html).toContain("Signed benchmark");
    expect(html).toContain("$5,600 refundable MSDs");
    expect(html).toContain("Comparison only");
    expect(html).not.toContain("Active offer");
  });
});

describe("ListingCard compact feature chips", () => {
  it("names confirmed and expected equipment and collapses unknowns into one chip", () => {
    const html = renderToStaticMarkup(<ListingCard listing={{
      ...listing,
      featureEvidence: [
        ...listing.featureEvidence,
        { key: "tow_package", label: "Tow package", status: "unknown", source: "search_target", evidence: "Confirm on the listing." },
        { key: "air_suspension", label: "Air suspension", status: "unknown", source: "search_target", evidence: "Confirm on the listing." },
      ],
    }} view="finds" />);

    expect(html).toContain("Third row");
    expect(html).toContain("Hands-free highway");
    expect(html).toContain("2 to verify");
    expect(html).toContain("Evidence &amp; checks");
    expect(html).toContain("Swipe right for Interested or left for Pass");
  });
});
