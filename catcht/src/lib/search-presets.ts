import type { SavedSearchInput } from "./dal";

export function w222Preset(variant: "560" | "450"): SavedSearchInput {
  return {
    name: `S${variant} sedan under $25k`, offerKind: "used", make: "Mercedes-Benz", model: "S-Class",
    trim: `S ${variant}`, trimAliases: [`S${variant}`], bodyStyle: "sedan", transmission: "automatic",
    yearMin: 2018, yearMax: 2020, maxPrice: 25_000, targetPrice: variant === "560" ? 22_500 : 20_000,
    maxMileage: 120_000, radiusMiles: 250, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas",
    desiredFeatures: ["adaptive_cruise_lane_centering", "surround_view", "ventilated_front_seats", "massaging_front_seats",
      "apple_carplay", "android_auto", "warmth_comfort", "amg_line", "burmester_3d", "magic_body_control"],
    requiredFeatures: [], priority: variant === "560" ? 100 : 85,
    rationale: "Facelift S-Class value hunt. Prefer Premium and Driver Assistance evidence; verify history, suspension, diagnostics and maintenance. AWD and RWD eligible; asking price excludes tax, fees and repairs.",
  };
}
