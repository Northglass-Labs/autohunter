import type { CandidateOffer, EnrichmentStatus, VehicleFeatureEvidence } from "./types";

export interface PersistedFeatureIntelligence {
  featureEvidence: VehicleFeatureEvidence[];
  packageNames: string[];
  enrichmentStatus: EnrichmentStatus;
}

const STATUS_RANK: Record<VehicleFeatureEvidence["status"], number> = {
  confirmed: 2,
  expected: 1,
  unknown: 0,
};

// A daily cycle usually re-normalizes a listing without a metered detail fetch. That fresh
// inference must never erase provider-detail evidence a previous cycle already paid for, so
// per feature key the higher-ranked evidence survives. A fresh `enriched` inference is the
// provider speaking again and replaces the persisted state entirely, downgrades included.
export function mergeFeatureIntelligence<T extends CandidateOffer>(
  candidate: T,
  persisted: PersistedFeatureIntelligence | null,
): T {
  if (!persisted) return candidate;
  const incomingStatus = candidate.enrichmentStatus ?? "not_requested";
  if (incomingStatus === "enriched") return candidate;
  const persistedEnriched = persisted.enrichmentStatus === "enriched";
  const persistedByKey = new Map(persisted.featureEvidence.map((feature) => [feature.key, feature]));
  const incoming = candidate.featureEvidence ?? [];
  const merged = incoming.map((feature) => {
    const kept = persistedByKey.get(feature.key);
    return kept && STATUS_RANK[kept.status] > STATUS_RANK[feature.status] ? kept : feature;
  });
  const evidenceChanged = merged.some((feature, index) => feature !== incoming[index]);
  if (!evidenceChanged && !persistedEnriched) return candidate;
  const packageNames = persistedEnriched
    ? [...new Set([...persisted.packageNames, ...(candidate.packageNames ?? [])])].slice(0, 40)
    : candidate.packageNames ?? [];
  return {
    ...candidate,
    featureEvidence: merged,
    packageNames,
    enrichmentStatus: persistedEnriched ? "enriched" : incomingStatus,
    featureMatchScore: featureScore(merged),
    familyFitScore: familyFitScore(candidate, merged),
  };
}

// Mirrors the collector's scoring so persisted evidence and freshly inferred evidence stay on
// one scale: confirmed 100, expected 65, unknown 0, rounded mean across the desired set.
function featureScore(features: VehicleFeatureEvidence[]) {
  if (features.length === 0) return 0;
  const points = features.reduce(
    (sum, feature) => sum + (feature.status === "confirmed" ? 100 : feature.status === "expected" ? 65 : 0),
    0,
  );
  return Math.round(points / features.length);
}

function familyFitScore(candidate: CandidateOffer, features: VehicleFeatureEvidence[]) {
  let score = 35;
  const seating = candidate.seatingCapacity ?? 0;
  if (seating >= 5) score += 20;
  if (seating >= 7) score += 15;
  if (/suv|wagon|van/i.test(candidate.bodyStyle ?? "")) score += 15;
  if (features.some((feature) => feature.key === "third_row" && feature.status !== "unknown")) score += 10;
  if (features.some((feature) => feature.key === "surround_view" && feature.status !== "unknown")) score += 5;
  return Math.min(100, score);
}
