import { matchesBodyStyle, matchesTrim } from "./vehicle-filters";
import type { CandidateLeaseOffer, CandidateListing, CandidateOffer, ManualPhotoEvidence, OfferKind, RecommendationHistory, VehicleFeatureKey } from "./types";
import { effectiveMonthlyCost, leaseDealScore } from "./offer-economics";
import { SEARCH_POLICY } from "./search-policy";

export type EligibilityReason =
  | "eligible"
  | "price_over_cap"
  | "mileage_over_cap"
  | "outside_radius"
  | "manual_photo_unverified"
  | "lease_terms_incomplete"
  | "effective_monthly_over_cap"
  | "due_at_signing_over_cap"
  | "annual_miles_below_min"
  | "year_out_of_range"
  | "required_feature_missing"
  | "search_mismatch";

export interface CandidateEvaluation {
  eligible: boolean;
  reason: EligibilityReason;
  score: number;
  manualConfidence: number;
  discountPercent: number | null;
  featureMatchScore?: number;
  familyFitScore?: number;
}

export interface OfferEvaluationPolicy {
  offerKind: OfferKind;
  make: string;
  model: string;
  trim?: string | null;
  aliases?: string[];
  trimAliases?: string[];
  bodyStyle?: string | null;
  transmission: "any" | "manual" | "automatic";
  radiusMiles?: number | null;
  maxPrice?: number | null;
  maxMileage?: number | null;
  region?: string | null;
  maxEffectiveMonthly?: number | null;
  maxDueAtSigning?: number | null;
  minAnnualMiles?: number | null;
  yearMin?: number | null;
  yearMax?: number | null;
  targetPrice?: number | null;
  desiredFeatures?: readonly VehicleFeatureKey[];
  requiredFeatures?: readonly VehicleFeatureKey[];
}

export type ManualVerificationStatus = "verified" | "pending" | "unverified" | "not_applicable";

export interface ManualVerification {
  status: ManualVerificationStatus;
  confidence: number;
  evidence: CandidateListing["manualEvidence"][number] | null;
}

const MIN_VISUAL_MANUAL_CONFIDENCE = 0.72;

export function mergeManualEvidence(
  current: ManualPhotoEvidence[],
  persisted: ManualPhotoEvidence[],
): ManualPhotoEvidence[] {
  const byImageUrl = new Map(persisted.map((evidence) => [evidence.imageUrl, evidence]));
  for (const evidence of current) byImageUrl.set(evidence.imageUrl, evidence);
  return [...byImageUrl.values()];
}

export function claimsManualTransmission(claim: string | null | undefined): boolean {
  if (!claim) return false;
  const normalized = claim.toLowerCase();
  if (/\b(automatic|cvt|dct|dual[- ]clutch|paddle)\b/.test(normalized)) return false;
  return /\b(manual|stick(?: shift)?|[456][ -]?speed)\b/.test(normalized);
}

export function bestManualEvidence(listing: CandidateListing) {
  return listing.manualEvidence
    .filter(
      (evidence) =>
        evidence.manualLeverVisible &&
        evidence.matchingInteriorLikely,
    )
    .sort((a, b) => b.confidence - a.confidence)[0];
}

export function manualVerification(listing: CandidateListing): ManualVerification {
  const evidence = bestManualEvidence(listing) ?? null;
  if (evidence && evidence.confidence >= MIN_VISUAL_MANUAL_CONFIDENCE) {
    return { status: "verified", confidence: evidence.confidence, evidence };
  }
  if (claimsManualTransmission(listing.transmissionClaim)) {
    return { status: "pending", confidence: evidence?.confidence ?? 0, evidence };
  }
  return { status: "unverified", confidence: evidence?.confidence ?? 0, evidence };
}

export function evaluateCandidate(listing: CandidateListing): CandidateEvaluation {
  const evaluation = evaluatePurchaseOffer(listing, {
    offerKind: listing.offerKind ?? "used",
    make: listing.make,
    model: listing.model,
    transmission: "manual",
    maxPrice: SEARCH_POLICY.maxPrice,
    maxMileage: SEARCH_POLICY.maxMileage,
    radiusMiles: SEARCH_POLICY.maxDistanceMiles,
  });
  return {
    eligible: evaluation.eligible,
    reason: evaluation.reason,
    score: evaluation.score,
    manualConfidence: evaluation.manualConfidence,
    discountPercent: evaluation.discountPercent,
  };
}

export function evaluateOffer(
  listing: CandidateOffer,
  policy?: OfferEvaluationPolicy,
): CandidateEvaluation & { verificationStatus: ManualVerificationStatus } {
  if (policy && !matchesSearchIdentity(listing, policy)) {
    return withVehicleScores(rejected("search_mismatch", 0, null, "not_applicable"), listing);
  }
  if (policy && missingRequiredFeature(listing, policy)) {
    return withVehicleScores(rejected("required_feature_missing", 0, null, "not_applicable"), listing);
  }
  const evaluation = listing.offerKind === "lease"
    ? evaluateLeaseOffer(listing, policy)
    : evaluatePurchaseOffer(listing, policy);
  return withVehicleScores(evaluation, listing);
}

function evaluatePurchaseOffer(
  listing: CandidateListing,
  policy?: OfferEvaluationPolicy,
): CandidateEvaluation & { verificationStatus: ManualVerificationStatus } {
  const manualRequired = policy?.transmission === "manual"
    || (policy?.transmission === undefined && listing.requiresManualVerification !== false);
  const verification = manualRequired
    ? manualVerification(listing)
    : { status: "not_applicable" as const, confidence: 0, evidence: null };

  const discountPercent = listing.marketEstimate
    ? ((listing.marketEstimate - listing.price) / listing.marketEstimate) * 100
    : listing.msrp && listing.msrp > listing.price
      ? ((listing.msrp - listing.price) / listing.msrp) * 100
      : null;
  const reject = (reason: EligibilityReason) => rejected(
    reason,
    verification.confidence,
    discountPercent,
    verification.status,
  );
  const maxPrice = policy?.maxPrice ?? (manualRequired && !policy ? SEARCH_POLICY.maxPrice : null);
  const maxMileage = policy?.maxMileage ?? (manualRequired && !policy ? SEARCH_POLICY.maxMileage : null);
  const maxDistance = policy?.radiusMiles ?? (manualRequired && !policy ? SEARCH_POLICY.maxDistanceMiles : null);
  if ((policy?.yearMin !== null && policy?.yearMin !== undefined && listing.year < policy.yearMin)
    || (policy?.yearMax !== null && policy?.yearMax !== undefined && listing.year > policy.yearMax)) {
    return reject("year_out_of_range");
  }
  if (maxPrice !== null && listing.price > maxPrice) return reject("price_over_cap");
  if (maxMileage !== null && listing.mileage > maxMileage) return reject("mileage_over_cap");
  if (maxDistance !== null && listing.distanceMiles > maxDistance) return reject("outside_radius");
  if (policy?.transmission === "automatic" && claimsManualTransmission(listing.transmissionClaim)) {
    return reject("search_mismatch");
  }
  if (manualRequired && verification.status !== "verified") return reject("manual_photo_unverified");

  if (manualRequired && verification.evidence) {
    const value = discountPercent === null ? 10 : Math.max(0, Math.min(35, discountPercent));
    const mileage = Math.max(0, ((maxMileage ?? SEARCH_POLICY.maxMileage) - listing.mileage) / 4_000);
    const distance = Math.max(0, ((maxDistance ?? SEARCH_POLICY.maxDistanceMiles) - listing.distanceMiles) / 15);
    const confidence = verification.evidence.confidence * 20;
    return {
      eligible: true,
      reason: "eligible",
      score: Math.round((value + mileage + distance + 10 + confidence) * 10) / 10,
      manualConfidence: verification.evidence.confidence,
      discountPercent,
      verificationStatus: verification.status,
    };
  }

  const value = discountPercent === null ? 25 : Math.max(0, Math.min(55, discountPercent * 2));
  const lowMileage = Math.max(0, Math.min(20, 20 - listing.mileage / 10_000));
  const proximity = Math.max(0, Math.min(15, 15 - listing.distanceMiles / 25));
  return {
    eligible: true,
    reason: "eligible",
    score: Math.round((value + lowMileage + proximity + 10) * 10) / 10,
    manualConfidence: 0,
    discountPercent,
    verificationStatus: "not_applicable",
  };
}

function evaluateLeaseOffer(
  listing: CandidateLeaseOffer,
  policy?: OfferEvaluationPolicy,
): CandidateEvaluation & { verificationStatus: ManualVerificationStatus } {
  const effectiveMonthly = listing.effectiveMonthly ?? effectiveMonthlyCost({
    monthlyPayment: listing.monthlyPayment,
    dueAtSigning: listing.dueAtSigning,
    termMonths: listing.termMonths,
    brokerFee: listing.brokerFee,
    acquisitionFee: listing.acquisitionFee,
    acquisitionFeeIncludedInDueAtSigning: listing.acquisitionFeeIncludedInDueAtSigning,
    dueAtSigningIncludesFirstPayment: listing.dueAtSigningIncludesFirstPayment ?? undefined,
    securityDeposit: listing.securityDeposit,
    securityDepositRefundable: listing.securityDepositRefundable,
  });
  const role = listing.offerRole ?? "active_offer";
  if (role !== "active_offer") {
    const score = effectiveMonthly === null
      ? Math.max(1, Math.round((listing.parseConfidence ?? 0.25) * 20 * 10) / 10)
      : leaseDealScore({
          effectiveMonthly,
          msrp: listing.msrp,
          parseConfidence: listing.parseConfidence ?? 0.5,
          dueAtSigning: listing.dueAtSigning,
        });
    return {
      eligible: true,
      reason: "eligible",
      score,
      manualConfidence: 0,
      discountPercent: listing.discountPercent ?? null,
      verificationStatus: "not_applicable",
    };
  }
  if (effectiveMonthly === null) {
    return rejected("lease_terms_incomplete", 0, listing.discountPercent ?? null, "not_applicable");
  }
  if (policy?.maxEffectiveMonthly && effectiveMonthly > policy.maxEffectiveMonthly) {
    return rejected("effective_monthly_over_cap", 0, listing.discountPercent ?? null, "not_applicable");
  }
  if (policy?.maxDueAtSigning !== null && policy?.maxDueAtSigning !== undefined) {
    if (listing.dueAtSigning === null || listing.dueAtSigning === undefined) {
      return rejected("lease_terms_incomplete", 0, listing.discountPercent ?? null, "not_applicable");
    }
    if (listing.dueAtSigning > policy.maxDueAtSigning) {
      return rejected("due_at_signing_over_cap", 0, listing.discountPercent ?? null, "not_applicable");
    }
  }
  if (policy?.minAnnualMiles) {
    if (!listing.annualMiles) return rejected("lease_terms_incomplete", 0, listing.discountPercent ?? null, "not_applicable");
    if (listing.annualMiles < policy.minAnnualMiles) {
      return rejected("annual_miles_below_min", 0, listing.discountPercent ?? null, "not_applicable");
    }
  }
  return {
    eligible: true,
    reason: "eligible",
    score: leaseDealScore({
      effectiveMonthly,
      msrp: listing.msrp,
      parseConfidence: listing.parseConfidence ?? 0.5,
      dueAtSigning: listing.dueAtSigning,
    }),
    manualConfidence: 0,
    discountPercent: listing.discountPercent ?? null,
    verificationStatus: "not_applicable",
  };
}

function rejected(
  reason: EligibilityReason,
  manualConfidence: number,
  discountPercent: number | null,
  verificationStatus: ManualVerificationStatus,
): CandidateEvaluation & { verificationStatus: ManualVerificationStatus } {
  return { eligible: false, reason, score: 0, manualConfidence, discountPercent, verificationStatus };
}

function withVehicleScores<T extends CandidateEvaluation & { verificationStatus: ManualVerificationStatus }>(
  evaluation: T,
  listing: CandidateOffer,
): T {
  const featureMatchScore = boundedScore(listing.featureMatchScore);
  const familyFitScore = boundedScore(listing.familyFitScore);
  if (!evaluation.eligible || (featureMatchScore === 0 && familyFitScore === 0)) {
    return { ...evaluation, featureMatchScore, familyFitScore };
  }
  const score = Math.round(Math.min(100, evaluation.score + featureMatchScore * 0.2 + familyFitScore * 0.1) * 10) / 10;
  return { ...evaluation, score, featureMatchScore, familyFitScore };
}

function boundedScore(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Number(value))) : 0;
}

// A required feature is satisfied by confirmed or expected evidence. Benchmarks and market
// signals stay visible as negotiation context, so only active offers are gated.
function missingRequiredFeature(listing: CandidateOffer, policy: OfferEvaluationPolicy) {
  if (!policy.requiredFeatures?.length) return false;
  if ((listing.offerRole ?? "active_offer") !== "active_offer") return false;
  const evidence = listing.featureEvidence ?? [];
  return policy.requiredFeatures.some((key) => !evidence.some(
    (feature) => feature.key === key && (feature.status === "confirmed" || feature.status === "expected"),
  ));
}

function matchesSearchIdentity(listing: CandidateOffer, policy: OfferEvaluationPolicy) {
  const offerKind = listing.offerKind ?? "used";
  if (offerKind !== policy.offerKind) return false;
  if (normalized(listing.make) !== normalized(policy.make)) return false;
  const model = normalized(listing.model);
  const models = [policy.model, ...(policy.aliases ?? [])].map(normalized).filter(Boolean);
  if (!models.some((candidate) => model === candidate || model.includes(candidate))) return false;
  if (!matchesTrim(listing.trim, policy.trim, policy.trimAliases)) return false;
  if (!matchesBodyStyle(listing.bodyStyle, policy.bodyStyle)) return false;
  if (listing.offerKind === "lease" && policy.region) {
    const region = normalized(listing.region ?? listing.location);
    if (!region.includes(normalized(policy.region))) return false;
  }
  return true;
}

function normalized(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function shouldRecommend(
  listing: CandidateListing,
  history: RecommendationHistory,
  now = new Date(),
): boolean {
  if (history.disposition !== "neutral") return false;
  if (!history.lastEmailedAt) return true;

  const previous = history.lastEmailedPrice;
  const materiallyCheaper =
    previous !== null &&
    (previous - listing.price >= 750 || (previous - listing.price) / previous >= 0.05);
  if (materiallyCheaper) return true;

  return now.getTime() - history.lastEmailedAt.getTime() >= 14 * 86_400_000;
}
