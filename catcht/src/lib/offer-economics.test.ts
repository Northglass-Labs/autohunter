import { describe, expect, it } from "vitest";
import { effectiveMonthlyCost, leaseDealScore } from "./offer-economics";

describe("effectiveMonthlyCost", () => {
  it("amortizes drive-off and fees without double-counting the first payment", () => {
    expect(effectiveMonthlyCost({
      monthlyPayment: 399,
      dueAtSigning: 3_000,
      termMonths: 36,
      brokerFee: 599,
      acquisitionFee: 0,
      dueAtSigningIncludesFirstPayment: true,
    })).toBeCloseTo(487.89, 2);
  });

  it("returns null when a post does not disclose enough terms", () => {
    expect(effectiveMonthlyCost({ monthlyPayment: 399, dueAtSigning: null, termMonths: null })).toBeNull();
  });

  it("counts every payment for a true zero-DAS lease", () => {
    expect(effectiveMonthlyCost({
      monthlyPayment: 685,
      dueAtSigning: 0,
      termMonths: 36,
      dueAtSigningIncludesFirstPayment: false,
    })).toBe(685);
  });

  it("excludes refundable MSDs but includes a disclosed non-refundable deposit", () => {
    expect(effectiveMonthlyCost({
      monthlyPayment: 500,
      dueAtSigning: 0,
      termMonths: 36,
      dueAtSigningIncludesFirstPayment: false,
      securityDeposit: 5_000,
      securityDepositRefundable: true,
    })).toBe(500);
    expect(effectiveMonthlyCost({
      monthlyPayment: 500,
      dueAtSigning: 0,
      termMonths: 36,
      dueAtSigningIncludesFirstPayment: false,
      securityDeposit: 3_600,
      securityDepositRefundable: false,
    })).toBe(600);
  });

  it("does not double-count an acquisition fee already included in total DAS", () => {
    expect(effectiveMonthlyCost({
      monthlyPayment: 649,
      dueAtSigning: 2_999,
      termMonths: 36,
      acquisitionFee: 795,
      acquisitionFeeIncludedInDueAtSigning: true,
      dueAtSigningIncludesFirstPayment: true,
    })).toBe(714.28);
  });
});

describe("leaseDealScore", () => {
  it("rewards a lower effective payment relative to MSRP and trustworthy parsing", () => {
    const strong = leaseDealScore({ effectiveMonthly: 470, msrp: 52_000, parseConfidence: 0.95, dueAtSigning: 2_000 });
    const weak = leaseDealScore({ effectiveMonthly: 650, msrp: 52_000, parseConfidence: 0.65, dueAtSigning: 5_000 });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThanOrEqual(0);
    expect(strong).toBeLessThanOrEqual(100);
  });
});
