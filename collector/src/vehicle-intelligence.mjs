export const FEATURE_KEYS = Object.freeze([
  "hands_free_highway",
  "adaptive_cruise_lane_centering",
  "rear_axle_steering",
  "air_suspension",
  "third_row",
  "surround_view",
  "tow_package",
]);

const FEATURE_LABELS = Object.freeze({
  hands_free_highway: "Hands-free highway driving",
  adaptive_cruise_lane_centering: "Adaptive cruise + lane centering",
  rear_axle_steering: "Rear-axle steering",
  air_suspension: "Air suspension",
  third_row: "Third row",
  surround_view: "Surround-view camera",
  tow_package: "Tow package",
});

const FEATURE_PATTERNS = Object.freeze({
  hands_free_highway: [
    /\bhighway assistant\b/i,
    /\bsuper cruise\b/i,
    /\benhanced highway assist\b/i,
    /\bautonomy\+\b/i,
    /\bdrive pilot\b/i,
    /\bblue ?cruise\b/i,
    /\bpro ?pilot assist 2\.\d\b/i,
  ],
  adaptive_cruise_lane_centering: [
    /\bdriving assistance professional\b/i,
    /\badaptive cruise assist(?: with lane guidance)?\b/i,
    /\bhighway (?:driving )?assist(?:ant)?(?: ii| 2)?\b/i,
    /\bdriver assistance package plus\b/i,
    /\bpilot assist\b/i,
    /\bsuper cruise\b/i,
    /\bblue ?cruise\b/i,
    /\bpro ?pilot assist\b/i,
    /\btravel assist\b/i,
    /\binnodrive\b/i,
    /\bactive driving assistant pro(?:fessional)?\b/i,
    /\bzdy\b/i,
    /\b5au\b/i,
  ],
  rear_axle_steering: [
    /\bintegral active steering\b/i,
    /\brear[- ]axle steering\b/i,
    /\brear[- ]wheel steering\b/i,
    /\ball[- ]wheel steering\b/i,
    /\bdynamic rear steering\b/i,
    /\b2vh\b/i,
    /\bzdh\b/i,
  ],
  air_suspension: [
    /\bair suspension\b/i,
    /\badaptive air suspension\b/i,
    /\bairmatic\b/i,
  ],
  third_row: [
    /\bthird[- ]row\b/i,
    /\b3rd[- ]row\b/i,
    /\b7[- ]passenger\b/i,
    /\bseven[- ]passenger\b/i,
  ],
  surround_view: [
    /\bsurround[- ]view\b/i,
    /\b360(?:-degree|°)? camera\b/i,
    /\b3d view\b/i,
    /\bparking assistance package\b/i,
  ],
  tow_package: [
    /\btow(?:ing)? package\b/i,
    /\btrailer hitch\b/i,
    /\bfactory tow\b/i,
  ],
});

const FAMILY_COMMON = Object.freeze({
  offerKind: "used",
  zip: "10001",
  radiusMiles: 250,
  transmission: "automatic",
  maxPrice: 70_000,
  maxMileage: 80_000,
  active: true,
});

function target(overrides) {
  return { ...FAMILY_COMMON, ...overrides };
}

export const FAMILY_VEHICLE_TARGETS = Object.freeze([
  target({ name: "EQS 450+ sedan", make: "Mercedes-Benz", model: "EQS", trim: "EQS 450+", yearMin: 2022, yearMax: 2025, targetPrice: 48_000, profile: "family_ev", garageGroup: "ev", powertrainCategory: "ev", desiredFeatures: ["adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "surround_view"], requiredFeatures: [], priority: 82, rationale: "Huge depreciation, long-range comfort, and unusually useful rear-seat space." }),
  target({ name: "EQS 580 sedan", make: "Mercedes-Benz", model: "EQS", trim: "EQS 580 4MATIC", trimAliases: ["EQS 580"], yearMin: 2022, yearMax: 2025, targetPrice: 55_000, profile: "family_ev", garageGroup: "ev", powertrainCategory: "ev", desiredFeatures: ["adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "surround_view"], requiredFeatures: [], priority: 88, rationale: "Dream-adjacent luxury and performance after severe first-owner depreciation." }),
  target({ name: "EQS 450+ SUV", make: "Mercedes-Benz", model: "EQS SUV", trim: "EQS 450+", aliases: ["EQS450+ SUV"], yearMin: 2023, yearMax: 2025, targetPrice: 58_000, profile: "family_ev", garageGroup: "ev", powertrainCategory: "ev", desiredFeatures: ["adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "third_row", "surround_view"], requiredFeatures: [], priority: 94, rationale: "EQS comfort with the family-friendly cargo opening and optional third row." }),
  target({ name: "EQS 580 SUV", make: "Mercedes-Benz", model: "EQS SUV", trim: "EQS 580 4MATIC", trimAliases: ["EQS 580"], yearMin: 2023, yearMax: 2025, targetPrice: 62_000, profile: "family_ev", garageGroup: "ev", powertrainCategory: "ev", desiredFeatures: ["adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "third_row", "surround_view"], requiredFeatures: [], priority: 98, rationale: "Fast, quiet family EV with strong packaging if depreciation brings it below the cap." }),
  target({ name: "Rivian R1S", make: "Rivian", model: "R1S", yearMin: 2022, yearMax: 2025, targetPrice: 62_000, profile: "family_ev", garageGroup: "ev", powertrainCategory: "ev", desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering", "third_row", "surround_view", "tow_package"], requiredFeatures: [], priority: 100, rationale: "Three rows, excellent cargo utility, performance, and Gen 2 autonomy upside." }),
  target({ name: "Audi e-tron GT", make: "Audi", model: "e-tron GT", aliases: ["e tron GT"], yearMin: 2022, yearMax: 2025, targetPrice: 50_000, profile: "family_ev", garageGroup: "ev", powertrainCategory: "ev", desiredFeatures: ["adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "surround_view"], requiredFeatures: [], priority: 78, rationale: "The most sports-car-like target; rear-seat and car-seat fit need extra scrutiny." }),
  target({ name: "Porsche Taycan", make: "Porsche", model: "Taycan", yearMin: 2022, yearMax: 2025, targetPrice: 50_000, profile: "family_ev", garageGroup: "ev", powertrainCategory: "ev", desiredFeatures: ["adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "surround_view"], requiredFeatures: [], priority: 78, rationale: "The e-tron GT platform twin with a sharper chassis; rear-seat fit, battery history, and expensive options need scrutiny." }),
  target({ name: "Audi Q8 e-tron", make: "Audi", model: "Q8 e-tron", aliases: ["e-tron", "e tron SUV"], yearMin: 2022, yearMax: 2025, targetPrice: 48_000, profile: "family_ev", garageGroup: "ev", powertrainCategory: "ev", desiredFeatures: ["adaptive_cruise_lane_centering", "air_suspension", "surround_view", "tow_package"], requiredFeatures: [], priority: 84, rationale: "Quiet, conventional-feeling luxury EV with a practical two-row body." }),
  target({ name: "BMW iX xDrive50", make: "BMW", model: "iX", trim: "xDrive50", yearMin: 2022, yearMax: 2025, targetPrice: 52_000, profile: "family_ev", garageGroup: "ev", powertrainCategory: "ev", desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "surround_view"], requiredFeatures: [], priority: 92, rationale: "Excellent range, chassis, rear seat, and available Highway Assistant." }),
  target({ name: "Cadillac LYRIQ", make: "Cadillac", model: "LYRIQ", yearMin: 2023, yearMax: 2025, targetPrice: 48_000, profile: "family_ev", garageGroup: "ev", powertrainCategory: "ev", desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering", "surround_view"], requiredFeatures: [], priority: 86, rationale: "Super Cruise can deliver the strongest automated-highway feel if explicitly equipped." }),

  target({ name: "X5 xDrive40i", make: "BMW", model: "X5", trim: "xDrive40i", yearMin: 2024, yearMax: 2026, targetPrice: 57_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering", "rear_axle_steering", "surround_view", "tow_package"], requiredFeatures: [], priority: 98, rationale: "Best all-around powertrain and chassis; prioritize Driving Assistance Professional." }),
  target({ name: "X5 M60i", make: "BMW", model: "X5", trim: "M60i", yearMin: 2024, yearMax: 2026, targetPrice: 66_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering", "rear_axle_steering", "surround_view", "tow_package"], requiredFeatures: [], priority: 100, rationale: "The fun X5 choice; standard rear steering plus the right highway-assistance package is ideal." }),
  target({ name: "2020 X5 M50i", make: "BMW", model: "X5", trim: "M50i", yearMin: 2020, yearMax: 2020, targetPrice: 43_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["adaptive_cruise_lane_centering", "rear_axle_steering", "surround_view", "tow_package"], requiredFeatures: [], priority: 80, rationale: "High-depreciation V8 option; target ZDH/2VH and ZDY explicitly rather than inferring them." }),
  target({ name: "X7 xDrive40i", make: "BMW", model: "X7", trim: "xDrive40i", yearMin: 2023, yearMax: 2026, targetPrice: 62_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "third_row", "surround_view"], requiredFeatures: [], priority: 94, rationale: "True third-row practicality with available rear steering and Highway Assistant." }),
  target({ name: "X7 M60i", make: "BMW", model: "X7", trim: "M60i", yearMin: 2023, yearMax: 2025, targetPrice: 68_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "third_row", "surround_view"], requiredFeatures: [], priority: 96, rationale: "A larger, wilder alternative to the X5 M60i if one depreciates under the ceiling." }),
  target({ name: "Genesis GV80 3.5T", make: "Genesis", model: "GV80", trim: "3.5T", yearMin: 2022, yearMax: 2025, targetPrice: 52_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["adaptive_cruise_lane_centering", "third_row", "surround_view"], requiredFeatures: [], priority: 82, rationale: "Strong luxury value and HDA II availability, with lower running-cost risk than old German V8s." }),
  target({ name: "Acura MDX Type S", make: "Acura", model: "MDX", trim: "Type S", yearMin: 2022, yearMax: 2025, targetPrice: 50_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["adaptive_cruise_lane_centering", "air_suspension", "third_row", "surround_view"], requiredFeatures: [], priority: 88, rationale: "Three-row utility, SH-AWD handling, and a more conservative ownership bet." }),
  target({ name: "Audi SQ7", make: "Audi", model: "SQ7", yearMin: 2021, yearMax: 2025, targetPrice: 58_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "third_row", "surround_view"], requiredFeatures: [], priority: 90, rationale: "RS6-adjacent V8 energy in a three-row family shape; ownership costs need weighting." }),
  target({ name: "Porsche Cayenne S", make: "Porsche", model: "Cayenne", trim: "S", yearMin: 2020, yearMax: 2025, targetPrice: 58_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "surround_view"], requiredFeatures: [], priority: 84, rationale: "Best steering and chassis candidate; options must be decoded individually." }),
  target({ name: "Volvo XC90 Recharge", make: "Volvo", model: "XC90", trim: "Recharge", aliases: ["XC90 T8"], yearMin: 2022, yearMax: 2025, targetPrice: 53_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "phev", desiredFeatures: ["adaptive_cruise_lane_centering", "air_suspension", "third_row", "surround_view"], requiredFeatures: [], priority: 88, rationale: "Excellent family packaging and safety with useful electric commuting range." }),
  target({ name: "Mercedes GLS 450", make: "Mercedes-Benz", model: "GLS", trim: "GLS 450", yearMin: 2021, yearMax: 2025, targetPrice: 58_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension", "third_row", "surround_view"], requiredFeatures: [], priority: 86, rationale: "Large-family comfort and highway composure; packages and upkeep decide the value." }),
  target({ name: "Cadillac Escalade Super Cruise", make: "Cadillac", model: "Escalade", yearMin: 2021, yearMax: 2025, targetPrice: 65_000, profile: "family_gas", garageGroup: "gas", powertrainCategory: "gas", desiredFeatures: ["hands_free_highway", "adaptive_cruise_lane_centering", "air_suspension", "third_row", "surround_view", "tow_package"], requiredFeatures: [], priority: 85, rationale: "Maximum family space and Super Cruise potential if the exact vehicle is equipped." }),
]);

export const FAMILY_LEASE_TARGETS = Object.freeze([
  { make: "Lexus", model: "TX", aliases: ["TX 350", "TX 500h"], powertrainCategory: "any" },
  { make: "Toyota", model: "Grand Highlander", aliases: ["Grand Highlander Hybrid"], powertrainCategory: "any" },
  { make: "Volvo", model: "XC90", aliases: ["XC90 Recharge"], powertrainCategory: "any" },
  { make: "Lincoln", model: "Aviator", aliases: [], powertrainCategory: "gas" },
  { make: "Mazda", model: "CX-90", aliases: ["CX90"], powertrainCategory: "any" },
  { make: "Kia", model: "Telluride", aliases: [], powertrainCategory: "gas" },
  { make: "Hyundai", model: "Palisade", aliases: [], powertrainCategory: "gas" },
]);

export function inferVehicleIntelligence(listing, search = {}, detail = null, options = {}) {
  const desired = uniqueFeatureKeys([...(search.desiredFeatures ?? []), ...(search.requiredFeatures ?? [])]);
  const detailText = detailStrings(detail);
  const summaryText = summaryStrings(listing);
  const expected = expectedFeatureRules(listing);
  const featureEvidence = desired.map((key) => {
    const matching = matchingDetailEvidence(key, detailText);
    if (matching) {
      return {
        key,
        label: FEATURE_LABELS[key],
        status: "confirmed",
        source: "provider_listing",
        evidence: matching.slice(0, 300),
      };
    }
    const summaryMatch = matchingDetailEvidence(key, summaryText);
    if (summaryMatch) {
      return {
        key,
        label: FEATURE_LABELS[key],
        status: "expected",
        source: "provider_summary",
        evidence: `Listing summary: "${summaryMatch.slice(0, 200)}" — confirm on the window sticker or VIN build sheet.`,
      };
    }
    const rule = expected.get(key);
    if (rule) {
      return {
        key,
        label: FEATURE_LABELS[key],
        status: "expected",
        source: "model_rule",
        evidence: rule.slice(0, 300),
      };
    }
    return {
      key,
      label: FEATURE_LABELS[key],
      status: "unknown",
      source: "search_target",
      evidence: "Optional or unverified equipment; confirm on the listing, window sticker, or VIN build sheet.",
    };
  });

  const build = detail?.build ?? listing?.build ?? {};
  const bodyStyle = cleanText(build.body_type ?? build.body_style ?? listing.bodyStyle, 100);
  const seatingCapacity = boundedInteger(build.seating_capacity ?? build.std_seating ?? listing.seatingCapacity, 2, 15);
  const powertrainCategory = normalizedPowertrain(
    search.powertrainCategory,
    build.powertrain_type,
    build.fuel_type,
    listing.powertrainCategory,
  );
  const garageGroup = normalizedGarageGroup(search.garageGroup, search.profile, listing.offerKind, powertrainCategory);
  const featureMatchScore = featureScore(featureEvidence);
  const familyFitScore = familyScore({ bodyStyle, seatingCapacity, featureEvidence });
  const packageNames = uniqueStrings([
    ...flattenStrings(detail?.extra?.options_packages),
    ...flattenStrings(detail?.extra?.options),
  ], 40, 200);

  return {
    garageGroup,
    powertrainCategory,
    bodyStyle,
    seatingCapacity,
    packageNames,
    featureEvidence,
    featureMatchScore,
    familyFitScore,
    daysOnMarket: daysOnMarket(detail, listing),
    priceChange: boundedSignedNumber(detail?.price_change ?? detail?.price_change_amount ?? listing.priceChange),
    oneOwner: booleanOrNull(detail?.carfax_1_owner ?? detail?.one_owner ?? listing.carfax_1_owner ?? listing.one_owner ?? listing.oneOwner),
    cleanTitle: booleanOrNull(detail?.carfax_clean_title ?? detail?.clean_title ?? listing.carfax_clean_title ?? listing.clean_title ?? listing.cleanTitle),
    exteriorColor: cleanText(build.exterior_color ?? detail?.exterior_color ?? listing.exterior_color ?? listing.exteriorColor, 100),
    interiorColor: cleanText(build.interior_color ?? detail?.interior_color ?? listing.interior_color ?? listing.interiorColor, 100),
    enrichmentStatus: options.enrichmentStatus ?? (detail ? "enriched" : "not_requested"),
  };
}

function matchingDetailEvidence(key, detailText) {
  const direct = detailText.find((value) => FEATURE_PATTERNS[key]?.some((pattern) => pattern.test(value)));
  if (direct || key !== "adaptive_cruise_lane_centering") return direct;
  const combined = detailText.join(" · ");
  const longitudinal = /\b(?:adaptive cruise control|active cruise control|smart cruise control|active distance assist distronic)\b/i.test(combined);
  const lateral = /\b(?:lane centering|lane following assist|active lane keep(?:ing)?|active steering assist)\b/i.test(combined);
  return longitudinal && lateral ? combined : undefined;
}

// Declarative exact model-year rules for expected standard equipment. Every entry must describe
// factory-standard fitment for the matched make/model/trim/years — optional packages never belong
// here. First matching rule wins per feature key; keep trim-specific entries above general ones.
// modelMatch: "exact" (default) | "prefix" | "includes"; modelAliases add alternate spellings.
export const EXPECTED_EQUIPMENT_RULES = Object.freeze([
  { make: "bmw", model: "x5", trimPattern: /\bm60i\b/, yearMin: 2024, features: {
    rear_axle_steering: "Integral Active Steering is standard on the 2024+ X5 M60i; verify the VIN build sheet.",
  } },
  { make: "bmw", model: "x7", trimPattern: /\bm60i\b/, yearMin: 2023, features: {
    rear_axle_steering: "Integral Active Steering is standard on the 2023+ X7 M60i; verify the VIN build sheet.",
  } },
  { make: "bmw", model: "x7", yearMin: 2023, features: {
    third_row: "The X7 is a standard three-row SUV; verify the seating configuration in listing photos.",
    air_suspension: "Two-axle air suspension is standard on the 2023+ X7; verify the VIN build sheet.",
  } },
  { make: "rivian", model: "r1s", yearMin: 2025, features: {
    hands_free_highway: "2025+ Gen 2 R1S supports Enhanced Highway Assist; verify software activation and any Autonomy+ subscription or purchased entitlement.",
  } },
  { make: "rivian", model: "r1s", features: {
    third_row: "The R1S has standard three-row seating; confirm seat condition in listing photos.",
    adaptive_cruise_lane_centering: "Rivian Highway Assist hardware is standard; verify current software capability.",
  } },
  { make: "mercedes benz", model: "eqs", modelMatch: "prefix", yearMin: 2022, features: {
    adaptive_cruise_lane_centering: "EQS Driver Assistance includes DISTRONIC and Active Steering Assist; verify the market-specific build sheet.",
    rear_axle_steering: "EQS rear-axle steering is expected for this model year; verify the fitted steering angle and activation on the VIN build sheet.",
    air_suspension: "AIRMATIC is expected on the EQS; verify the VIN build sheet and suspension condition.",
  } },
  { make: "mercedes benz", model: "gls", modelMatch: "includes", features: {
    third_row: "The GLS is a standard three-row SUV; verify the seating configuration in listing photos.",
    air_suspension: "AIRMATIC is expected on the GLS; verify the VIN build sheet and suspension condition.",
  } },
  { make: "mercedes benz", model: "gls", modelMatch: "includes", yearMin: 2021, features: {
    surround_view: "The Surround View System is standard equipment on the 2021+ GLS; verify camera operation at inspection.",
  } },
  { make: "acura", model: "mdx", trimPattern: /\btype s\b/, features: {
    air_suspension: "Adaptive air suspension is standard on the MDX Type S; verify the VIN build sheet and suspension condition.",
  } },
  { make: "acura", model: "mdx", features: {
    third_row: "The MDX includes a third row; verify the exact second-row configuration and car-seat access.",
  } },
  { make: "volvo", model: "xc90", modelMatch: "prefix", yearMin: 2021, features: {
    adaptive_cruise_lane_centering: "Pilot Assist is standard on the 2021+ XC90; verify operation on the exact vehicle.",
  } },
  { make: "volvo", model: "xc90", modelMatch: "prefix", features: {
    third_row: "The XC90 is normally configured with a third row; verify seating count on the listing.",
  } },
  { make: "cadillac", model: "escalade", features: {
    third_row: "The Escalade includes three-row seating; verify the exact second-row configuration.",
  } },
  { make: "lexus", model: "tx", modelMatch: "prefix", trimPattern: /\b500h\b/, features: {
    rear_axle_steering: "Dynamic Rear Steering is standard on the TX 500h F SPORT Performance; verify the VIN build sheet.",
  } },
  { make: "lexus", model: "tx", modelMatch: "prefix", features: {
    third_row: "The Lexus TX is a standard three-row SUV; verify the seating configuration in listing photos.",
  } },
  { make: "toyota", model: "grand highlander", modelMatch: "prefix", features: {
    third_row: "The Grand Highlander is a standard three-row SUV; verify the seating configuration in listing photos.",
  } },
  { make: "mazda", model: "cx 90", modelAliases: ["cx90"], modelMatch: "prefix", features: {
    third_row: "The CX-90 is a standard three-row SUV; verify the seating configuration in listing photos.",
  } },
  { make: "kia", model: "telluride", features: {
    third_row: "The Telluride is a standard three-row SUV; verify the seating configuration in listing photos.",
  } },
  { make: "hyundai", model: "palisade", features: {
    third_row: "The Palisade is a standard three-row SUV; verify the seating configuration in listing photos.",
  } },
  { make: "lincoln", model: "aviator", features: {
    third_row: "The Aviator is a standard three-row SUV; verify the seating configuration in listing photos.",
  } },
  { make: "audi", model: "sq7", features: {
    third_row: "The SQ7 is a standard three-row SUV; verify the seating configuration in listing photos.",
    air_suspension: "Adaptive air suspension is standard on the SQ7; verify the VIN build sheet and suspension condition.",
  } },
  { make: "genesis", model: "gv80", features: {
    adaptive_cruise_lane_centering: "Highway Driving Assist is standard on the GV80; verify the fitted HDA generation on the exact vehicle.",
  } },
]);

function expectedFeatureRules(listing) {
  const result = new Map();
  const year = Number(listing?.year);
  const make = normalized(listing?.make);
  const model = normalized(listing?.model);
  const trim = normalized(listing?.trim ?? listing?.title);

  for (const rule of EXPECTED_EQUIPMENT_RULES) {
    if (rule.make !== make) continue;
    const models = [rule.model, ...(rule.modelAliases ?? [])];
    const matchesModel = models.some((candidate) => rule.modelMatch === "prefix"
      ? model.startsWith(candidate)
      : rule.modelMatch === "includes" ? model.includes(candidate) : model === candidate);
    if (!matchesModel) continue;
    if (rule.trimPattern && !rule.trimPattern.test(trim)) continue;
    if (rule.yearMin !== undefined && !(year >= rule.yearMin)) continue;
    if (rule.yearMax !== undefined && !(year <= rule.yearMax)) continue;
    for (const [key, note] of Object.entries(rule.features)) {
      if (!result.has(key)) result.set(key, note);
    }
  }
  return result;
}

function detailStrings(detail) {
  return uniqueStrings([
    ...flattenStrings(detail?.extra?.options),
    ...flattenStrings(detail?.extra?.features),
    ...flattenStrings(detail?.extra?.high_value_features),
    ...flattenStrings(detail?.extra?.options_packages),
    ...flattenStrings(detail?.build?.options),
    ...flattenStrings(detail?.build?.features),
  ], 200, 500);
}

// Search-response text (dealer headings, summary arrays) is provider-authored but is not
// window-sticker-grade, so it can only ever produce `expected` evidence — never `confirmed`.
function summaryStrings(listing) {
  return uniqueStrings([
    ...flattenStrings(listing?.heading),
    ...flattenStrings(listing?.title),
    ...flattenStrings(listing?.summaryTexts),
    ...flattenStrings(listing?.extra?.options),
    ...flattenStrings(listing?.extra?.features),
    ...flattenStrings(listing?.extra?.high_value_features),
    ...flattenStrings(listing?.extra?.options_packages),
    ...flattenStrings(listing?.build?.options),
    ...flattenStrings(listing?.build?.features),
  ], 200, 500);
}

function flattenStrings(value) {
  const strings = [];
  const stack = [{ value, depth: 0 }];
  const visited = new WeakSet();
  let visitedNodes = 0;
  while (stack.length > 0 && strings.length < 500 && visitedNodes < 5_000) {
    const current = stack.pop();
    visitedNodes += 1;
    if (typeof current.value === "string") {
      strings.push(current.value);
      continue;
    }
    if (!current.value || typeof current.value !== "object" || current.depth >= 20 || visited.has(current.value)) continue;
    visited.add(current.value);
    const children = Array.isArray(current.value) ? current.value : Object.values(current.value);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ value: children[index], depth: current.depth + 1 });
    }
  }
  return strings;
}

function uniqueStrings(values, limit, maxLength) {
  return [...new Set(values.map((value) => cleanText(value, maxLength)).filter(Boolean))].slice(0, limit);
}

function uniqueFeatureKeys(values) {
  return [...new Set(values)].filter((value) => FEATURE_KEYS.includes(value)).slice(0, FEATURE_KEYS.length);
}

function featureScore(features) {
  if (features.length === 0) return 0;
  const points = features.reduce((sum, feature) => sum + (feature.status === "confirmed" ? 100 : feature.status === "expected" ? 65 : 0), 0);
  return Math.round(points / features.length);
}

function familyScore({ bodyStyle, seatingCapacity, featureEvidence }) {
  let score = 35;
  if (seatingCapacity >= 5) score += 20;
  if (seatingCapacity >= 7) score += 15;
  if (/suv|wagon|van/i.test(bodyStyle ?? "")) score += 15;
  if (hasExpectedOrConfirmed(featureEvidence, "third_row")) score += 10;
  if (hasExpectedOrConfirmed(featureEvidence, "surround_view")) score += 5;
  return Math.min(100, score);
}

function hasExpectedOrConfirmed(features, key) {
  return features.some((feature) => feature.key === key && feature.status !== "unknown");
}

function normalizedPowertrain(...values) {
  const text = values.map(normalized).join(" ");
  if (/\b(ev|bev|electric)\b/.test(text) && !/phev|hybrid/.test(text)) return "ev";
  if (/\bphev\b|plug in hybrid/.test(text)) return "phev";
  if (/\b(hev|mhev|hybrid)\b/.test(text)) return "hybrid";
  if (/\b(gas|combustion|unleaded|diesel|premium)\b/.test(text)) return "gas";
  return "any";
}

function normalizedGarageGroup(explicit, profile, offerKind, powertrain) {
  if (["ev", "gas", "lease", "enthusiast", "other"].includes(explicit)) return explicit;
  if (offerKind === "lease" || profile === "lease") return "lease";
  if (profile === "enthusiast") return "enthusiast";
  if (profile === "family_ev" || powertrain === "ev") return "ev";
  if (profile === "family_gas" || ["gas", "hybrid", "phev"].includes(powertrain)) return "gas";
  return "other";
}

function daysOnMarket(detail, listing) {
  const firstSeen = detail?.first_seen_at_mc_date ?? detail?.first_seen_at_source_date;
  if (!firstSeen) return boundedInteger(listing?.dom, 0, 10_000);
  const timestamp = new Date(firstSeen).getTime();
  if (!Number.isFinite(timestamp)) return boundedInteger(listing?.dom, 0, 10_000);
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function booleanOrNull(value) {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0") return false;
  return null;
}

function boundedInteger(value, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function boundedSignedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= 10_000_000 ? number : null;
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const result = value.replace(/\s+/g, " ").trim();
  return result ? result.slice(0, maxLength) : null;
}

function normalized(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
}
