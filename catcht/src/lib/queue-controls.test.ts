import { describe, expect, it } from "vitest";
import {
  matchesQueuePriceCaps,
  parseMoneyCap,
  swipeDecision,
} from "./queue-controls";

describe("queue price caps", () => {
  it("accepts bounded whole-dollar URL values and rejects malformed input", () => {
    expect(parseMoneyCap("55000")).toBe(55_000);
    expect(parseMoneyCap(" 725 ")).toBe(725);
    expect(parseMoneyCap("0")).toBeNull();
    expect(parseMoneyCap("-1")).toBeNull();
    expect(parseMoneyCap("1e3")).toBeNull();
    expect(parseMoneyCap("10000001")).toBeNull();
  });

  it("applies purchase and lease caps only to economically comparable cards", () => {
    const purchase = { offerKind: "used", price: 58_000, effectiveMonthly: null, monthlyPayment: null } as const;
    const lease = { offerKind: "lease", price: null, effectiveMonthly: 810, monthlyPayment: 725 } as const;

    expect(matchesQueuePriceCaps(purchase, { maxPrice: 57_000, maxMonthly: null })).toBe(false);
    expect(matchesQueuePriceCaps(lease, { maxPrice: 57_000, maxMonthly: null })).toBe(true);
    expect(matchesQueuePriceCaps(lease, { maxPrice: null, maxMonthly: 800 })).toBe(false);
    expect(matchesQueuePriceCaps(purchase, { maxPrice: null, maxMonthly: 800 })).toBe(true);
    expect(matchesQueuePriceCaps(
      { ...purchase, price: null },
      { maxPrice: 57_000, maxMonthly: null },
    )).toBe(false);
  });
});

describe("queue swipe decisions", () => {
  it("maps a deliberate horizontal review gesture to Interested or Pass", () => {
    expect(swipeDecision({ view: "finds", deltaX: 100, deltaY: 12, cardWidth: 320 })).toBe("interested");
    expect(swipeDecision({ view: "pending", deltaX: -100, deltaY: 12, cardWidth: 320 })).toBe("ignored");
  });

  it("ignores short, vertical, and already-decided gestures", () => {
    expect(swipeDecision({ view: "finds", deltaX: 40, deltaY: 4, cardWidth: 320 })).toBeNull();
    expect(swipeDecision({ view: "finds", deltaX: 100, deltaY: 120, cardWidth: 320 })).toBeNull();
    expect(swipeDecision({ view: "interested", deltaX: -120, deltaY: 4, cardWidth: 320 })).toBeNull();
  });
});
