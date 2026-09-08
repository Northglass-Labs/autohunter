import type { SavedSearchInput } from "./dal";

export function sClassPreset(variant: "560" | "450" | "580"): SavedSearchInput {
  const w223 = variant === "580";
  return {
    name: `S${variant} sedan under $40k`, offerKind: "used", make: "Mercedes-Benz", model: "S-Class",
    trim: `S ${variant}`, trimAliases: w223 ? ["S580", "S 580 4MATIC", "S580 4MATIC"] : [`S${variant}`],
    bodyStyle: "sedan", transmission: "automatic",
    yearMin: w223 ? 2021 : 2018, yearMax: w223 ? 2025 : 2020, maxPrice: 40_000,
    targetPrice: w223 ? 35_000 : variant === "560" ? 22_500 : 20_000,
    maxMileage: 120_000, radiusMiles: 250, profile: "family_gas", garageGroup: "gas", powertrainCategory: w223 ? "any" : "gas",
    desiredFeatures: ["adaptive_cruise_lane_centering", "surround_view", "ventilated_front_seats", "massaging_front_seats",
      "apple_carplay", "android_auto", "amg_line", ...(w223
        ? ["rear_axle_steering", "air_suspension"] as const
        : ["warmth_comfort", "burmester_3d", "magic_body_control"] as const)],
    requiredFeatures: [], priority: variant === "450" ? 85 : 100,
    rationale: w223
      ? "W223 S580 mild-hybrid V8 value hunt. Verify options, service history, 48-volt system, MBUX and suspension with a Mercedes specialist. Asking price excludes tax, fees and repairs."
      : "Facelift S-Class value hunt. Prefer Premium and Driver Assistance evidence; verify history, suspension, diagnostics and maintenance. AWD and RWD eligible; asking price excludes tax, fees and repairs.",
  };
}
