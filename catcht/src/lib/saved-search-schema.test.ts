import { describe, expect, it } from "vitest";
import { dispositionInputSchema, entityIdSchema, savedSearchInputSchema } from "./saved-search-schema";

describe("savedSearchInputSchema", () => {
  it("normalizes a purchase search without silently widening limits", () => {
    expect(savedSearchInputSchema.parse({
      name: "Manual GR86",
      offerKind: "new",
      make: "Toyota",
      model: "GR86",
      trim: "",
      zip: "10001",
      radiusMiles: "100",
      transmission: "manual",
      maxPrice: "45000",
      maxMileage: "500",
      region: "",
      maxEffectiveMonthly: "",
      maxDueAtSigning: "",
      minAnnualMiles: "",
    })).toEqual({
      name: "Manual GR86",
      offerKind: "new",
      make: "Toyota",
      model: "GR86",
      trim: null,
      zip: "10001",
      radiusMiles: 100,
      transmission: "manual",
      maxPrice: 45_000,
      maxMileage: 500,
      region: null,
      maxEffectiveMonthly: null,
      maxDueAtSigning: null,
      minAnnualMiles: null,
    });
  });

  it("requires both a region and ZIP for lease intelligence and rejects purchases without geography", () => {
    expect(savedSearchInputSchema.safeParse({
      name: "Q5 lease",
      offerKind: "lease",
      make: "Audi",
      model: "Q5",
      trim: "",
      zip: "10001",
      radiusMiles: "",
      transmission: "any",
      maxPrice: "",
      maxMileage: "",
      region: "Northeast",
      maxEffectiveMonthly: "750",
      maxDueAtSigning: "4000",
      minAnnualMiles: "10000",
    }).success).toBe(true);
    expect(savedSearchInputSchema.safeParse({
      name: "Q5 lease without ZIP",
      offerKind: "lease",
      make: "Audi",
      model: "Q5",
      zip: "",
      region: "Northeast",
      transmission: "any",
    }).success).toBe(false);
    expect(savedSearchInputSchema.safeParse({
      name: "Used Miata",
      offerKind: "used",
      make: "Mazda",
      model: "MX-5 Miata",
      zip: "",
      radiusMiles: "",
      transmission: "manual",
    }).success).toBe(false);
  });

  it("rejects malformed server-action identifiers and dispositions before database casts", () => {
    expect(entityIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(entityIdSchema.parse("11111111-1111-4111-8111-111111111111"))
      .toBe("11111111-1111-4111-8111-111111111111");
    expect(dispositionInputSchema.safeParse("deleted").success).toBe(false);
    expect(dispositionInputSchema.parse("interested")).toBe("interested");
    expect(dispositionInputSchema.parse("neutral")).toBe("neutral");
  });

  it("normalizes a family search with year, price, powertrain, and feature intent", () => {
    expect(savedSearchInputSchema.parse({
      name: "R1S Gen 2",
      offerKind: "used",
      make: "Rivian",
      model: "R1S",
      trim: "",
      zip: "10001",
      radiusMiles: "250",
      transmission: "automatic",
      maxPrice: "70000",
      maxMileage: "60000",
      profile: "family_ev",
      garageGroup: "ev",
      powertrainCategory: "ev",
      yearMin: "2025",
      yearMax: "2026",
      targetPrice: "60000",
      desiredFeatures: "hands_free_highway, third_row, surround_view",
      requiredFeatures: "adaptive_cruise_lane_centering",
      rationale: "Gen 2 hardware and three-row family utility.",
      priority: "100",
    })).toMatchObject({
      profile: "family_ev",
      garageGroup: "ev",
      powertrainCategory: "ev",
      yearMin: 2025,
      yearMax: 2026,
      targetPrice: 60_000,
      desiredFeatures: ["hands_free_highway", "third_row", "surround_view"],
      requiredFeatures: ["adaptive_cruise_lane_centering"],
      priority: 100,
    });
  });
});
