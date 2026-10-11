import { describe, expect, it } from "vitest";
import { describeMarketPosition, estimateMarketValue, isImplausiblePrice, trimKey, type MarketComparable } from "./market-value";

function comparables(count: number, overrides: Partial<MarketComparable> = {}): MarketComparable[] {
  return Array.from({ length: count }, (_, index) => ({
    year: 2023,
    trim: "Prestige",
    price: 60_000 + (index - Math.floor(count / 2)) * 500,
    mileage: 30_000,
    ...overrides,
  }));
}

describe("trimKey", () => {
  it("ignores spacing, case, drivetrain and body words, and dealer add-ons", () => {
    expect(trimKey("S 560 4MATIC Sedan 4D")).toBe("s560");
    expect(trimKey("S560")).toBe("s560");
    expect(trimKey("4WD Premium Luxury")).toBe("premiumluxury");
    expect(trimKey("Sport Platinum 4WD w/ Super Cruise & Onyx Package")).toBe("sportplatinum");
    expect(trimKey("Launch Edition AWD")).toBe("launchedition");
    expect(trimKey("xDrive40i")).toBe("xdrive40i");
    expect(trimKey(null)).toBe("");
  });
});

describe("estimateMarketValue", () => {
  it("takes the median of same-trim comparables at the target's year and mileage", () => {
    const estimate = estimateMarketValue({ year: 2023, trim: "Prestige", mileage: 30_000 }, comparables(7));

    expect(estimate).toEqual({ estimate: 60_000, comparables: 7, basis: "trim", spreadPercent: expect.any(Number) });
  });

  it("adjusts comparables to the target's mileage", () => {
    const estimate = estimateMarketValue(
      { year: 2023, trim: "Prestige", mileage: 60_000 },
      comparables(6, { price: 50_000 }),
    );

    // 30,000 more miles at the default 0.5% per 1,000 miles: 50,000 × e^-0.15.
    expect(estimate?.estimate).toBe(43_050);
  });

  it("adjusts comparables one model year older or newer", () => {
    const estimate = estimateMarketValue(
      { year: 2024, trim: "Prestige", mileage: 30_000 },
      comparables(6, { year: 2023, price: 40_000 }),
    );

    expect(estimate?.estimate).toBe(43_200);
  });

  it("ignores comparables more than one model year away", () => {
    expect(estimateMarketValue({ year: 2025, trim: "Prestige", mileage: 30_000 }, comparables(9))).toBeNull();
  });

  it("widens to the trim family, then the model, before giving up", () => {
    const family = estimateMarketValue(
      { year: 2023, trim: "Adventure", mileage: 30_000 },
      comparables(6, { trim: "Adventure Quad-Motor Large Pack" }),
    );
    expect(family?.basis).toBe("trim_family");

    const model = estimateMarketValue(
      { year: 2023, trim: "Launch Edition", mileage: 30_000 },
      [...comparables(5, { trim: "Adventure" }), ...comparables(4, { trim: "Base" })],
    );
    expect(model?.basis).toBe("model");

    expect(estimateMarketValue({ year: 2023, trim: "Launch Edition", mileage: 30_000 }, comparables(7).slice(0, 4))).toBeNull();
  });

  it("keeps placeholder prices out of the comparables", () => {
    const estimate = estimateMarketValue(
      { year: 2023, trim: "Prestige", mileage: 30_000 },
      [...comparables(6), { year: 2023, trim: "Prestige", price: 2_150, mileage: 30_000 }, { year: 2023, trim: "Prestige", price: 190, mileage: 30_000 }],
    );

    expect(estimate?.comparables).toBe(6);
    expect(estimate?.estimate).toBeGreaterThan(59_000);
  });

  it("fits the mileage rate when comparables span enough mileage", () => {
    // 1% per 1,000 miles, twice the default.
    const spread = Array.from({ length: 14 }, (_, index) => {
      const mileage = 10_000 + index * 5_000;
      return { year: 2023, trim: "Prestige", mileage, price: Math.round(70_000 * Math.exp(-0.00001 * mileage)) };
    });

    const estimate = estimateMarketValue({ year: 2023, trim: "Prestige", mileage: 40_000 }, spread);

    expect(estimate?.estimate).toBeGreaterThan(46_500);
    expect(estimate?.estimate).toBeLessThan(47_400);
  });
});

describe("isImplausiblePrice", () => {
  it("treats prices far below comparable value, or below the floor, as data errors", () => {
    expect(isImplausiblePrice(190, null)).toBe(true);
    expect(isImplausiblePrice(25_000, 60_000)).toBe(true);
    expect(isImplausiblePrice(30_000, 60_000)).toBe(false);
    expect(isImplausiblePrice(25_000, null)).toBe(false);
  });
});

describe("describeMarketPosition", () => {
  it("states the gap to similar cars in dollars with the number compared", () => {
    expect(describeMarketPosition(54_000, 60_000, 14)).toEqual({ tone: "below", text: "$6,000 below similar cars (14 compared)" });
    expect(describeMarketPosition(66_000, 60_000, 9)).toEqual({ tone: "above", text: "$6,000 above similar cars (9 compared)" });
    expect(describeMarketPosition(60_300, 60_000, 9)).toEqual({ tone: "at", text: "In line with similar cars (9 compared)" });
  });

  it("flags a price far below similar cars as a reason to check the history", () => {
    expect(describeMarketPosition(45_000, 60_000, 14)).toEqual({
      tone: "unusual",
      text: "$15,000 (25%) below similar cars (14 compared). Unusually low: check title and history.",
    });
  });

  it("says nothing without an estimate or a price", () => {
    expect(describeMarketPosition(45_000, null, null)).toBeNull();
    expect(describeMarketPosition(null, 60_000, 14)).toBeNull();
  });
});
