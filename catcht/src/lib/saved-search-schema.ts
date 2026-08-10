import { z } from "zod";

export const entityIdSchema = z.uuid();
export const dispositionInputSchema = z.enum(["neutral", "interested", "ignored"]);

const featureKeySchema = z.enum([
  "hands_free_highway",
  "adaptive_cruise_lane_centering",
  "rear_axle_steering",
  "air_suspension",
  "third_row",
  "surround_view",
  "tow_package",
]);

const nullableText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().min(1).max(max).nullable(),
);

const nullableInteger = (min: number, max: number) => z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return null;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
    return value;
  },
  z.number().int().min(min).max(max).nullable(),
);

const commaSeparated = <T extends z.ZodType>(schema: T, max: number) => z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return [];
    if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
    return value;
  },
  z.array(schema).max(max),
);

export const savedSearchInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  offerKind: z.enum(["used", "new", "lease"]),
  make: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(150),
  trim: nullableText(150).default(null),
  zip: nullableText(5).default(null),
  radiusMiles: nullableInteger(1, 500).default(null),
  region: nullableText(150).default(null),
  transmission: z.enum(["any", "manual", "automatic"]).default("any"),
  maxPrice: nullableInteger(1, 10_000_000).default(null),
  maxMileage: nullableInteger(0, 10_000_000).default(null),
  maxEffectiveMonthly: nullableInteger(1, 100_000).default(null),
  maxDueAtSigning: nullableInteger(0, 1_000_000).default(null),
  minAnnualMiles: nullableInteger(1_000, 100_000).default(null),
  profile: z.enum(["enthusiast", "family_ev", "family_gas", "lease", "general"]).optional(),
  garageGroup: z.enum(["ev", "gas", "lease", "enthusiast", "other"]).optional(),
  powertrainCategory: z.enum(["ev", "gas", "phev", "hybrid", "any"]).optional(),
  yearMin: nullableInteger(1980, 2100).optional(),
  yearMax: nullableInteger(1980, 2100).optional(),
  targetPrice: nullableInteger(1, 10_000_000).optional(),
  aliases: commaSeparated(z.string().trim().min(1).max(150), 20).optional(),
  trimAliases: commaSeparated(z.string().trim().min(1).max(150), 20).optional(),
  desiredFeatures: commaSeparated(featureKeySchema, 20).optional(),
  requiredFeatures: commaSeparated(featureKeySchema, 20).optional(),
  rationale: nullableText(500).optional(),
  priority: nullableInteger(0, 100).optional(),
}).superRefine((search, context) => {
  if (search.yearMin !== null && search.yearMin !== undefined && search.yearMax !== null && search.yearMax !== undefined && search.yearMin > search.yearMax) {
    context.addIssue({ code: "custom", path: ["yearMin"], message: "Minimum year cannot exceed maximum year" });
  }
  if (search.targetPrice && search.maxPrice && search.targetPrice > search.maxPrice) {
    context.addIssue({ code: "custom", path: ["targetPrice"], message: "Target price cannot exceed the hard price cap" });
  }
  if (search.offerKind === "lease") {
    if (!search.region) context.addIssue({ code: "custom", path: ["region"], message: "A lease region is required" });
    if (!search.zip || !/^\d{5}$/.test(search.zip)) {
      context.addIssue({ code: "custom", path: ["zip"], message: "A five-digit ZIP is required for regional OEM lease programs" });
    }
    return;
  }
  if (!search.zip || !/^\d{5}$/.test(search.zip)) {
    context.addIssue({ code: "custom", path: ["zip"], message: "A five-digit ZIP is required" });
  }
  if (search.radiusMiles === null) {
    context.addIssue({ code: "custom", path: ["radiusMiles"], message: "A search radius is required" });
  }
});
