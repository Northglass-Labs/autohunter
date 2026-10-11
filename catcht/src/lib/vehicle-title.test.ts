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
  it("keeps usable listing headings without dealer condition labels", () => {
    expect(vehicleTitle("Used 2019 Mercedes-Benz S560", identity)).toBe("2019 Mercedes-Benz S560");
    expect(vehicleTitle("2024 Lexus TX 350 Premium", identity)).toBe("2024 Lexus TX 350 Premium");
  });

  it("drops pipes, odometer notes, colours and package lists that dealers append", () => {
    expect(vehicleTitle("Used | 2024 | Cadillac Lyriq Luxury 1", identity)).toBe("2024 Cadillac Lyriq Luxury 1");
    expect(vehicleTitle("Used 2022 Acura MDX Type S SH-AWD|78,288 Miles|All Wheel Drive", identity)).toBe("2022 Acura MDX Type S SH-AWD");
    expect(vehicleTitle("Pre-Owned 2024 Cadillac LYRIQ Tech", identity)).toBe("2024 Cadillac LYRIQ Tech");
    expect(vehicleTitle("Certified Pre-Owned 2023 Audi SQ7 Prestige", identity)).toBe("2023 Audi SQ7 Prestige");
    expect(vehicleTitle("2024 Cadillac LYRIQ Tech w/1SA, Blue, Mileage: 15,835", identity)).toBe("2024 Cadillac LYRIQ Tech");
    expect(vehicleTitle("2024 Audi e-tron GT AWD Premium Plus w/ Performance & Executive Pkg", identity)).toBe("2024 Audi e-tron GT AWD Premium Plus");
    expect(vehicleTitle("2024 BMW X5 xDrive40i, Black, Mileage: 12,000", identity)).toBe("2024 BMW X5 xDrive40i");
    expect(vehicleTitle("2023 Mercedes-Benz EQS EQS 450 4MATIC SUV", identity)).toBe("2023 Mercedes-Benz EQS 450 4MATIC SUV");
  });

  it("falls back to structured identity when cleaning leaves nothing", () => {
    expect(vehicleTitle("Used | 12,000 Miles", identity)).toBe("2019 Mercedes-Benz S-Class S560");
  });
});
