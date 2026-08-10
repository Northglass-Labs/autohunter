import type { VehicleSafetyEvidence } from "./types";

export function parseSafetyEvidence(value: unknown): VehicleSafetyEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.source !== "nhtsa" || !["rated", "not_rated"].includes(String(row.ratingStatus))) return null;

  const overallRating = rating(row.overallRating);
  const frontalCrashRating = rating(row.frontalCrashRating);
  const sideCrashRating = rating(row.sideCrashRating);
  const rolloverRating = rating(row.rolloverRating);
  const ratings = [overallRating, frontalCrashRating, sideCrashRating, rolloverRating];
  if (ratings.includes(undefined)) return null;
  if (row.ratingStatus === "rated" && ratings.every((candidate) => candidate === null)) return null;
  if (row.ratingStatus === "not_rated" && ratings.some((candidate) => candidate !== null)) return null;

  const availableVariantCount = boundedInteger(row.availableVariantCount, 0, 100);
  const testedVariantCount = boundedInteger(row.testedVariantCount, 0, 5);
  const recallCampaignCount = boundedInteger(row.recallCampaignCount, 0, 100_000);
  if (availableVariantCount === null || testedVariantCount === null || recallCampaignCount === null
    || testedVariantCount > availableVariantCount) return null;

  if (!Array.isArray(row.recallCampaigns) || row.recallCampaigns.length > 10) return null;
  const recallCampaigns = row.recallCampaigns.map(campaign);
  if (recallCampaigns.some((candidate) => candidate === null) || recallCampaigns.length > recallCampaignCount) return null;

  const retrievedAt = new Date(String(row.retrievedAt));
  if (!Number.isFinite(retrievedAt.getTime())) return null;
  return {
    source: "nhtsa",
    ratingStatus: row.ratingStatus as VehicleSafetyEvidence["ratingStatus"],
    overallRating: overallRating!,
    frontalCrashRating: frontalCrashRating!,
    sideCrashRating: sideCrashRating!,
    rolloverRating: rolloverRating!,
    availableVariantCount,
    testedVariantCount,
    recallCampaignCount,
    recallCampaigns: recallCampaigns as VehicleSafetyEvidence["recallCampaigns"],
    retrievedAt: retrievedAt.toISOString(),
  };
}

function rating(value: unknown): number | null | undefined {
  if (value === null) return null;
  const result = Number(value);
  return Number.isInteger(result) && result >= 1 && result <= 5 ? result : undefined;
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  const result = Number(value);
  return Number.isInteger(result) && result >= minimum && result <= maximum ? result : null;
}

function campaign(value: unknown): VehicleSafetyEvidence["recallCampaigns"][number] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const campaignNumber = String(row.campaignNumber ?? "");
  const component = String(row.component ?? "");
  const reportReceivedDate = String(row.reportReceivedDate ?? "");
  if (!/^[A-Za-z0-9-]{1,30}$/.test(campaignNumber)
    || component.length < 1 || component.length > 200
    || !/^\d{4}-\d{2}-\d{2}$/.test(reportReceivedDate)) return null;
  return { campaignNumber, component, reportReceivedDate };
}
