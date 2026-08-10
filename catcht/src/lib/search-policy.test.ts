import { describe, expect, it } from "vitest";
import { searchPolicyFromEnv } from "./search-policy";

describe("searchPolicyFromEnv", () => {
  it("uses safe standalone defaults", () => {
    expect(searchPolicyFromEnv({})).toEqual({
      centerZip: "10001",
      maxDistanceMiles: 150,
      maxMileage: 120_000,
      maxPrice: 15_000,
    });
  });

  it("parses deployment-specific limits", () => {
    expect(searchPolicyFromEnv({
      SEARCH_ZIP: "19103",
      SEARCH_RADIUS_MILES: "75",
      SEARCH_MAX_MILEAGE: "80000",
      SEARCH_MAX_PRICE: "20000",
    })).toEqual({
      centerZip: "19103",
      maxDistanceMiles: 75,
      maxMileage: 80_000,
      maxPrice: 20_000,
    });
  });

  it("rejects invalid numeric limits instead of silently widening a search", () => {
    expect(() => searchPolicyFromEnv({ SEARCH_MAX_PRICE: "not-a-number" })).toThrow("SEARCH_MAX_PRICE");
    expect(() => searchPolicyFromEnv({ SEARCH_RADIUS_MILES: "0" })).toThrow("SEARCH_RADIUS_MILES");
  });
});
