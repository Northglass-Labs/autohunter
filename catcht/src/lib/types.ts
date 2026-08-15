export type ListingSource =
  | "cargurus"
  | "autotrader"
  | "cars.com"
  | "autotempest"
  | "hemmings"
  | "craigslist"
  | "carsandbids"
  | "bringatrailer"
  | "ebay"
  | "dealer"
  | "facebook"
  | "marketcheck"
  | "auto_dev"
  | "marketcheck_incentives"
  | "nhtsa"
  | "leasehackr"
  | "email_alert"
  | "dealer_feed"
  | "other";

export type Disposition = "neutral" | "interested" | "ignored";
export type OfferKind = "used" | "new" | "lease";
export type OfferRole = "active_offer" | "benchmark" | "market_signal";
export type SourceMethod = "api" | "authorized_email" | "manual_import";
export type VehicleCondition = "used" | "new" | "cpo" | "unknown";
export type GarageGroup = "ev" | "gas" | "lease" | "enthusiast" | "other";
export type PowertrainCategory = "ev" | "gas" | "phev" | "hybrid" | "any";
export type SearchProfile = "enthusiast" | "family_ev" | "family_gas" | "lease" | "general";
export type VehicleFeatureKey =
  | "hands_free_highway"
  | "adaptive_cruise_lane_centering"
  | "rear_axle_steering"
  | "air_suspension"
  | "third_row"
  | "surround_view"
  | "tow_package";
export type FeatureEvidenceStatus = "confirmed" | "expected" | "unknown";
export type FeatureEvidenceSource = "provider_listing" | "provider_summary" | "model_rule" | "search_target";
export type EnrichmentStatus = "not_requested" | "enriched" | "budget_deferred" | "unavailable" | "failed";

export interface VehicleFeatureEvidence {
  key: VehicleFeatureKey;
  label: string;
  status: FeatureEvidenceStatus;
  source: FeatureEvidenceSource;
  evidence: string;
}

export interface NhtsaRecallCampaign {
  campaignNumber: string;
  component: string;
  reportReceivedDate: string;
}

export interface VehicleSafetyEvidence {
  source: "nhtsa";
  ratingStatus: "rated" | "not_rated";
  overallRating: number | null;
  frontalCrashRating: number | null;
  sideCrashRating: number | null;
  rolloverRating: number | null;
  availableVariantCount: number;
  testedVariantCount: number;
  recallCampaignCount: number;
  recallCampaigns: NhtsaRecallCampaign[];
  retrievedAt: string;
}

export interface ManualPhotoEvidence {
  imageUrl: string;
  shiftPatternVisible: boolean;
  manualLeverVisible: boolean;
  stockStyleShifter: boolean;
  matchingInteriorLikely: boolean;
  confidence: number;
  observedPattern: string | null;
  notes: string;
  verifierModel?: string;
}

interface CandidateBase {
  offerRole?: OfferRole;
  sourceMethod?: SourceMethod;
  source: ListingSource;
  sourceListingId?: string | null;
  originSource?: string | null;
  searchId?: string | null;
  url: string;
  vin?: string | null;
  make: string;
  model: string;
  trim?: string | null;
  title: string;
  location: string;
  transmissionClaim?: string | null;
  imageUrls: string[];
  primaryImageUrl?: string | null;
  marketEstimate?: number | null;
  msrp?: number | null;
  sellerName?: string | null;
  requiresManualVerification?: boolean;
  parseConfidence?: number;
  expiresAt?: string | null;
  garageGroup?: GarageGroup;
  powertrainCategory?: PowertrainCategory;
  bodyStyle?: string | null;
  seatingCapacity?: number | null;
  packageNames?: string[];
  featureEvidence?: VehicleFeatureEvidence[];
  featureMatchScore?: number;
  familyFitScore?: number;
  daysOnMarket?: number | null;
  priceChange?: number | null;
  oneOwner?: boolean | null;
  cleanTitle?: boolean | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  enrichmentStatus?: EnrichmentStatus;
  safetyEvidence?: VehicleSafetyEvidence | null;
  manualEvidence: ManualPhotoEvidence[];
}

export interface CandidateListing extends CandidateBase {
  offerKind?: "used" | "new";
  condition?: VehicleCondition;
  year: number;
  price: number;
  mileage: number;
  distanceMiles: number;
}

export interface CandidateLeaseOffer extends CandidateBase {
  offerKind: "lease";
  condition: "new" | "cpo" | "unknown";
  year?: number | null;
  price?: null;
  mileage?: null;
  distanceMiles?: number | null;
  monthlyPayment?: number | null;
  dueAtSigning?: number | null;
  dueAtSigningIncludesFirstPayment?: boolean | null;
  termMonths?: number | null;
  annualMiles?: number | null;
  brokerFee?: number | null;
  acquisitionFee?: number | null;
  acquisitionFeeIncludedInDueAtSigning?: boolean | null;
  dispositionFee?: number | null;
  securityDeposit?: number | null;
  securityDepositRefundable?: boolean | null;
  moneyFactor?: number | null;
  residualPercent?: number | null;
  discountPercent?: number | null;
  taxesIncluded?: boolean | null;
  effectiveMonthly?: number | null;
  region?: string | null;
  publishedAt?: string | null;
}

export type CandidateOffer = CandidateListing | CandidateLeaseOffer;

export interface RecommendationHistory {
  disposition: Disposition;
  lastEmailedAt: Date | null;
  lastEmailedPrice: number | null;
}
