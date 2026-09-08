import { describe, expect, it } from "vitest";
import { vehicleTitle } from "./vehicle-title";

describe("vehicleTitle", () => {
  const identity = { year: 2019, make: "Mercedes-Benz", model: "S-Class", trim: "S560" };
  it("uses structured identity when historical dealer titles are URLs or missing", () => {
    for (const title of ["https://dealer.example/used/s560", "www.dealer.example/used/s560", "", null]) {
      expect(vehicleTitle(title, identity)).toBe("2019 Mercedes-Benz S-Class S560");
    }
    expect(vehicleTitle(null, { make: "Mercedes-Benz", model: "S-Class" })).toBe("Mercedes-Benz S-Class");
    expect(vehicleTitle(null, {})).toBe("Vehicle details pending");
  });
  it("keeps usable listing headings", () => {
    expect(vehicleTitle("Used 2019 Mercedes-Benz S560", identity)).toBe("Used 2019 Mercedes-Benz S560");
  });
});
