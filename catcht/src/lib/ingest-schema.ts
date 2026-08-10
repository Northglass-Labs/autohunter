import { z } from "zod";

const sourceSchema = z.enum([
  "cargurus",
  "autotrader",
  "cars.com",
  "autotempest",
  "hemmings",
  "craigslist",
  "carsandbids",
  "bringatrailer",
  "ebay",
  "dealer",
  "facebook",
  "marketcheck",
  "auto_dev",
  "marketcheck_incentives",
  "nhtsa",
  "leasehackr",
  "email_alert",
  "dealer_feed",
  "other",
]);

const httpsUrlSchema = z.string().url().refine(
  (value) => new URL(value).protocol === "https:",
  "Only HTTPS URLs are allowed",
);

const manualEvidenceSchema = z.object({
  imageUrl: httpsUrlSchema,
  shiftPatternVisible: z.boolean(),
  manualLeverVisible: z.boolean(),
  stockStyleShifter: z.boolean(),
  matchingInteriorLikely: z.boolean(),
  confidence: z.number().min(0).max(1),
  observedPattern: z.string().max(100).nullable(),
  notes: z.string().min(1).max(500),
  verifierModel: z.string().min(1).max(100).optional(),
});

const featureKeySchema = z.enum([
  "hands_free_highway",
  "adaptive_cruise_lane_centering",
  "rear_axle_steering",
  "air_suspension",
  "third_row",
  "surround_view",
  "tow_package",
]);

const featureEvidenceSchema = z.object({
  key: featureKeySchema,
  label: z.string().trim().min(1).max(100),
  status: z.enum(["confirmed", "expected", "unknown"]),
  source: z.enum(["provider_listing", "model_rule", "search_target"]),
  evidence: z.string().trim().min(1).max(500),
});

const safetyRatingSchema = z.number().int().min(1).max(5).nullable();
const recallCampaignSchema = z.object({
  campaignNumber: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9-]+$/),
  component: z.string().trim().min(1).max(200),
  reportReceivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
const safetyEvidenceSchema = z.object({
  source: z.literal("nhtsa"),
  ratingStatus: z.enum(["rated", "not_rated"]),
  overallRating: safetyRatingSchema,
  frontalCrashRating: safetyRatingSchema,
  sideCrashRating: safetyRatingSchema,
  rolloverRating: safetyRatingSchema,
  availableVariantCount: z.number().int().min(0).max(100),
  testedVariantCount: z.number().int().min(0).max(5),
  recallCampaignCount: z.number().int().min(0).max(100_000),
  recallCampaigns: z.array(recallCampaignSchema).max(10),
  retrievedAt: z.string().datetime(),
}).strict().superRefine((evidence, context) => {
  if (evidence.testedVariantCount > evidence.availableVariantCount) {
    context.addIssue({ code: "custom", path: ["testedVariantCount"], message: "Tested variants cannot exceed available variants" });
  }
  if (evidence.recallCampaigns.length > evidence.recallCampaignCount) {
    context.addIssue({ code: "custom", path: ["recallCampaigns"], message: "Campaign details cannot exceed the reported count" });
  }
  const ratings = [evidence.overallRating, evidence.frontalCrashRating, evidence.sideCrashRating, evidence.rolloverRating];
  if (evidence.ratingStatus === "rated" && ratings.every((rating) => rating === null)) {
    context.addIssue({ code: "custom", path: ["ratingStatus"], message: "Rated evidence requires at least one rating" });
  }
  if (evidence.ratingStatus === "not_rated" && ratings.some((rating) => rating !== null)) {
    context.addIssue({ code: "custom", path: ["ratingStatus"], message: "Not-rated evidence cannot include ratings" });
  }
});

export const ingestCandidateSchema = z.object({
  offerKind: z.enum(["used", "new", "lease"]).default("used"),
  condition: z.enum(["used", "new", "cpo", "unknown"]).default("used"),
  offerRole: z.enum(["active_offer", "benchmark", "market_signal"]).default("active_offer"),
  sourceMethod: z.enum(["api", "authorized_email", "manual_import"]).default("api"),
  source: sourceSchema,
  sourceListingId: z.string().max(200).nullish(),
  originSource: z.string().max(200).nullish(),
  searchId: z.string().uuid().or(z.string().max(100)).nullish(),
  url: httpsUrlSchema,
  vin: z.string().max(30).nullish(),
  year: z.number().int().min(1886).max(2100).nullish(),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(150),
  trim: z.string().max(150).nullish(),
  title: z.string().min(1).max(300),
  price: z.number().int().positive().max(10_000_000).nullish(),
  mileage: z.number().int().min(0).max(10_000_000).nullish(),
  distanceMiles: z.number().min(0).max(5_000).nullish(),
  location: z.string().min(1).max(250),
  transmissionClaim: z.string().max(200).nullish(),
  imageUrls: z.array(httpsUrlSchema).max(100),
  primaryImageUrl: httpsUrlSchema.nullish(),
  marketEstimate: z.number().int().positive().max(10_000_000).nullish(),
  msrp: z.number().int().positive().max(10_000_000).nullish(),
  sellerName: z.string().max(200).nullish(),
  requiresManualVerification: z.boolean().optional(),
  monthlyPayment: z.number().positive().max(100_000).nullish(),
  dueAtSigning: z.number().min(0).max(1_000_000).nullish(),
  dueAtSigningIncludesFirstPayment: z.boolean().nullish(),
  termMonths: z.number().int().positive().max(120).nullish(),
  annualMiles: z.number().int().positive().max(100_000).nullish(),
  brokerFee: z.number().min(0).max(100_000).nullish(),
  acquisitionFee: z.number().min(0).max(100_000).nullish(),
  acquisitionFeeIncludedInDueAtSigning: z.boolean().nullish(),
  dispositionFee: z.number().min(0).max(100_000).nullish(),
  securityDeposit: z.number().min(0).max(1_000_000).nullish(),
  securityDepositRefundable: z.boolean().nullish(),
  moneyFactor: z.number().min(0).max(1).nullish(),
  residualPercent: z.number().min(0).max(100).nullish(),
  discountPercent: z.number().min(-100).max(100).nullish(),
  taxesIncluded: z.boolean().nullish(),
  effectiveMonthly: z.number().positive().max(100_000).nullish(),
  region: z.string().max(150).nullish(),
  parseConfidence: z.number().min(0).max(1).default(1),
  publishedAt: z.string().datetime().nullish(),
  expiresAt: z.string().datetime().nullish(),
  garageGroup: z.enum(["ev", "gas", "lease", "enthusiast", "other"]).optional(),
  powertrainCategory: z.enum(["ev", "gas", "phev", "hybrid", "any"]).optional(),
  bodyStyle: z.string().trim().min(1).max(100).nullish(),
  seatingCapacity: z.number().int().min(2).max(15).nullish(),
  packageNames: z.array(z.string().trim().min(1).max(200)).max(40).optional(),
  featureEvidence: z.array(featureEvidenceSchema).max(20).optional(),
  featureMatchScore: z.number().int().min(0).max(100).optional(),
  familyFitScore: z.number().int().min(0).max(100).optional(),
  daysOnMarket: z.number().int().min(0).max(10_000).nullish(),
  priceChange: z.number().min(-10_000_000).max(10_000_000).nullish(),
  oneOwner: z.boolean().nullish(),
  cleanTitle: z.boolean().nullish(),
  exteriorColor: z.string().trim().min(1).max(100).nullish(),
  interiorColor: z.string().trim().min(1).max(100).nullish(),
  enrichmentStatus: z.enum(["not_requested", "enriched", "budget_deferred", "unavailable", "failed"]).optional(),
  safetyEvidence: safetyEvidenceSchema.nullish(),
  manualEvidence: z.array(manualEvidenceSchema).max(100).optional(),
}).superRefine((candidate, context) => {
  if (candidate.offerKind !== "lease" && candidate.offerRole !== "active_offer") {
    context.addIssue({ code: "custom", path: ["offerRole"], message: "Purchase inventory must be an active offer" });
  }
  if (candidate.securityDepositRefundable !== null && candidate.securityDepositRefundable !== undefined
    && (candidate.securityDeposit === null || candidate.securityDeposit === undefined)) {
    context.addIssue({ code: "custom", path: ["securityDepositRefundable"], message: "Deposit amount is required when refundability is disclosed" });
  }
  if (candidate.acquisitionFeeIncludedInDueAtSigning !== null && candidate.acquisitionFeeIncludedInDueAtSigning !== undefined
    && (candidate.acquisitionFee === null || candidate.acquisitionFee === undefined)) {
    context.addIssue({ code: "custom", path: ["acquisitionFeeIncludedInDueAtSigning"], message: "Acquisition fee is required when inclusion is disclosed" });
  }
  if (candidate.offerKind !== "lease") {
    for (const field of ["year", "price", "mileage", "distanceMiles"] as const) {
      if (candidate[field] === null || candidate[field] === undefined) {
        context.addIssue({ code: "custom", path: [field], message: `${field} is required for purchase inventory` });
      }
    }
  }
  const submittedImages = new Set(candidate.imageUrls);
  for (const [index, evidence] of (candidate.manualEvidence ?? []).entries()) {
    if (!submittedImages.has(evidence.imageUrl)) {
      context.addIssue({
        code: "custom",
        path: ["manualEvidence", index, "imageUrl"],
        message: "Manual evidence must reference a submitted listing photo",
      });
    }
  }
});

export type IngestCandidate = z.infer<typeof ingestCandidateSchema>;

export const sourceRunSchema = z.object({
  adapter: z.string().min(1).max(100),
  source: sourceSchema,
  status: z.enum(["success", "empty", "unavailable", "challenged", "failed"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  searchedCount: z.number().int().min(0).max(100_000),
  discoveredCount: z.number().int().min(0).max(1_000_000),
  acceptedCount: z.number().int().min(0).max(1_000_000),
  messageCode: z.string().max(100).nullish(),
});

export const ingestRequestSchema = z.object({
  candidates: z.array(ingestCandidateSchema).max(50),
  sourceRuns: z.array(sourceRunSchema).max(100).default([]),
}).refine((payload) => payload.candidates.length > 0 || payload.sourceRuns.length > 0, {
  message: "At least one candidate or source run is required",
});
