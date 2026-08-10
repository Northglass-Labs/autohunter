import { normalizeVin } from "./identity";

export interface VehicleRow {
  identity_key: unknown;
  vin?: unknown;
  disposition?: unknown;
  verification_status?: unknown;
  eligibility_reason?: unknown;
  primary_image_url?: unknown;
  expires_at?: unknown;
  last_seen_at?: unknown;
  deal_score?: unknown;
}

export function vehicleCorrelationKey(row: VehicleRow): string {
  const vin = normalizeVin(typeof row.vin === "string" ? row.vin : null);
  return vin ? `vin:${vin}` : `identity:${String(row.identity_key)}`;
}

export function canonicalizeVehicleRows<T extends VehicleRow>(rows: T[], now = new Date()): T[] {
  const canonical = new Map<string, T>();
  for (const row of rows) {
    const key = vehicleCorrelationKey(row);
    const current = canonical.get(key);
    if (!current || compareRows(row, current, now) > 0) canonical.set(key, row);
  }
  return [...canonical.values()];
}

export function isCurrentListingRow(row: VehicleRow, now = new Date()): boolean {
  const expiresAt = timestamp(row.expires_at);
  if (expiresAt !== null) return expiresAt > now.getTime();
  const lastSeenAt = timestamp(row.last_seen_at);
  return lastSeenAt !== null && lastSeenAt > now.getTime() - 14 * 86_400_000;
}

export function needsManualPhotoVerification(row: VehicleRow, now = new Date()): boolean {
  return row.disposition === "neutral"
    && row.verification_status === "pending"
    && row.eligibility_reason === "manual_photo_unverified"
    && isCurrentListingRow(row, now);
}

export function matchesListingView(
  row: VehicleRow,
  disposition: "neutral" | "interested" | "ignored",
  verificationStatus: "verified" | "pending",
  now = new Date(),
): boolean {
  if (row.disposition !== disposition) return false;
  if (disposition !== "neutral") {
    return ["verified", "pending", "not_applicable"].includes(String(row.verification_status));
  }
  if (verificationStatus === "pending") return needsManualPhotoVerification(row, now);
  return isCurrentListingRow(row, now)
    && ["verified", "not_applicable"].includes(String(row.verification_status))
    && row.eligibility_reason === "eligible";
}

function compareRows(candidate: VehicleRow, current: VehicleRow, now: Date): number {
  const candidateRank = rank(candidate, now);
  const currentRank = rank(current, now);
  for (let index = 0; index < candidateRank.length; index += 1) {
    if (candidateRank[index] !== currentRank[index]) return candidateRank[index] - currentRank[index];
  }
  return String(current.identity_key).localeCompare(String(candidate.identity_key));
}

function rank(row: VehicleRow, now: Date): number[] {
  return [
    dispositionRank(row.disposition),
    isCurrentListingRow(row, now) ? 1 : 0,
    verificationRank(row.verification_status),
    row.eligibility_reason === "eligible" ? 1 : 0,
    row.primary_image_url ? 1 : 0,
    finiteNumber(row.deal_score),
    timestamp(row.last_seen_at) ?? 0,
  ];
}

function dispositionRank(value: unknown) {
  if (value === "interested") return 3;
  if (value === "ignored") return 2;
  if (value === "neutral") return 1;
  return 0;
}

function verificationRank(value: unknown) {
  if (value === "verified") return 3;
  if (value === "not_applicable") return 2;
  if (value === "pending") return 1;
  return 0;
}

function timestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = new Date(String(value)).getTime();
  return Number.isFinite(result) ? result : null;
}

function finiteNumber(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}
