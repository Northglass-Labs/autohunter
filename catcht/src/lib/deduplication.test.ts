import { describe, expect, it } from "vitest";
import {
  canonicalizeVehicleRows,
  matchesListingView,
  needsManualPhotoVerification,
  vehicleCorrelationKey,
} from "./deduplication";

const now = new Date("2026-07-16T20:00:00Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "source-record",
    identity_key: "cars.com:source-record",
    vin: null,
    disposition: "neutral",
    verification_status: "pending",
    eligibility_reason: "manual_photo_unverified",
    primary_image_url: "https://images.example.com/car.jpg",
    expires_at: "2026-07-20T00:00:00Z",
    last_seen_at: "2026-07-16T12:00:00Z",
    deal_score: 0,
    ...overrides,
  };
}

describe("vehicleCorrelationKey", () => {
  it("correlates exact valid VINs across sources without changing persistence identity", () => {
    expect(vehicleCorrelationKey(row({ vin: " jf1znaa13f9704502 " }))).toBe("vin:JF1ZNAA13F9704502");
  });

  it("keeps invalid or absent VINs source-scoped", () => {
    expect(vehicleCorrelationKey(row({ vin: "UNKNOWN" }))).toBe("identity:cars.com:source-record");
  });
});

describe("canonicalizeVehicleRows", () => {
  it("shows one physical car and prefers a verified eligible record over its pending duplicate", () => {
    const vin = "JF1ZNAA13F9704502";
    const verified = row({
      id: "cars-record",
      identity_key: "cars.com:cars-record",
      vin,
      verification_status: "verified",
      eligibility_reason: "eligible",
      deal_score: 82,
    });
    const pending = row({
      id: "marketcheck-record",
      identity_key: "marketcheck:marketcheck-record",
      vin,
      last_seen_at: "2026-07-16T18:00:00Z",
    });

    expect(canonicalizeVehicleRows([pending, verified], now)).toEqual([verified]);
  });

  it("preserves a remembered decision across a newly discovered duplicate", () => {
    const vin = "JF1ZCAC19E9602638";
    const ignored = row({ id: "ignored-record", identity_key: "cars.com:ignored", vin, disposition: "ignored" });
    const rediscovered = row({ id: "new-record", identity_key: "marketcheck:new", vin, last_seen_at: "2026-07-16T19:00:00Z" });

    expect(canonicalizeVehicleRows([rediscovered, ignored], now)).toEqual([ignored]);
  });

  it("does not let a stale verified record hide a current pending source", () => {
    const vin = "JF1ZCAC10J9600001";
    const stale = row({
      id: "stale",
      identity_key: "cars.com:stale",
      vin,
      verification_status: "verified",
      eligibility_reason: "eligible",
      expires_at: "2026-07-15T00:00:00Z",
      last_seen_at: "2026-06-01T00:00:00Z",
    });
    const current = row({ id: "current", identity_key: "marketcheck:current", vin });

    expect(canonicalizeVehicleRows([stale, current], now)).toEqual([current]);
  });
});

describe("needsManualPhotoVerification", () => {
  it("spends vision only when missing photo proof is the car's remaining blocker", () => {
    expect(needsManualPhotoVerification(row(), now)).toBe(true);
    expect(needsManualPhotoVerification(row({ eligibility_reason: "price_over_cap" }), now)).toBe(false);
    expect(needsManualPhotoVerification(row({ verification_status: "verified" }), now)).toBe(false);
  });
});

describe("matchesListingView", () => {
  it("keeps non-photo policy failures out of the Photo pending dashboard", () => {
    expect(matchesListingView(row(), "neutral", "pending", now)).toBe(true);
    expect(matchesListingView(row({ eligibility_reason: "price_over_cap" }), "neutral", "pending", now)).toBe(false);
    expect(matchesListingView(row({ eligibility_reason: "mileage_over_cap" }), "neutral", "pending", now)).toBe(false);
  });
});
