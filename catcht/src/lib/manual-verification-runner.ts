import "server-only";
import type { CandidateOffer, ManualPhotoEvidence } from "./types";
import {
  getPendingVerificationCandidates,
  getPersistedManualEvidence,
  recordSourceRuns,
  upsertCandidate,
  type PendingVerificationCandidate,
  type SourceRunInput,
} from "./dal";
import { mergeManualEvidence } from "./ranking";
import {
  getVisionAvailability,
  verifyShifterPhotos,
  type VisionAvailability,
  type VisionRequestContext,
  VisionVerifierError,
} from "./vision";

interface VerificationResult {
  verification: { status: string };
}

interface Dependencies {
  getVisionAvailability: (context?: VisionRequestContext) => VisionAvailability;
  getPendingVerificationCandidates: (limit?: number) => Promise<PendingVerificationCandidate[]>;
  getPersistedManualEvidence: (candidate: CandidateOffer) => Promise<ManualPhotoEvidence[]>;
  verifyShifterPhotos: (imageUrls: string[], context?: VisionRequestContext) => Promise<ManualPhotoEvidence[]>;
  upsertCandidate: (candidate: CandidateOffer, rawPayload: unknown) => Promise<VerificationResult>;
  recordSourceRuns: (runs: SourceRunInput[]) => Promise<void>;
  now: () => Date;
}

const defaults: Dependencies = {
  getVisionAvailability,
  getPendingVerificationCandidates,
  getPersistedManualEvidence,
  verifyShifterPhotos,
  upsertCandidate,
  recordSourceRuns,
  now: () => new Date(),
};

export async function runPendingPhotoVerification(
  overrides: Partial<Dependencies> = {},
  context: VisionRequestContext = {},
): Promise<{
  status: SourceRunInput["status"];
  searchedCount: number;
  verifiedCount: number;
  failedCount: number;
}> {
  const dependencies = { ...defaults, ...overrides };
  const startedAt = dependencies.now().toISOString();
  const availability = dependencies.getVisionAvailability(context);
  if (!availability.configured) {
    const run = sourceRun(startedAt, dependencies.now(), "unavailable", 0, 0, 0, availability.messageCode);
    await dependencies.recordSourceRuns([run]);
    return { status: run.status, searchedCount: 0, verifiedCount: 0, failedCount: 0 };
  }

  const pending = await dependencies.getPendingVerificationCandidates(5);
  let attemptedCount = 0;
  let discoveredCount = 0;
  let verifiedCount = 0;
  let failedCount = 0;
  let failureCode: string | null = null;

  for (const item of pending) {
    attemptedCount += 1;
    try {
      const persisted = await dependencies.getPersistedManualEvidence(item.candidate);
      const reviewed = new Set(persisted.map((evidence) => evidence.imageUrl));
      const unseen = item.candidate.imageUrls.filter((imageUrl) => !reviewed.has(imageUrl));
      discoveredCount += unseen.length;
      const fresh = unseen.length ? await dependencies.verifyShifterPhotos(unseen, context) : [];
      const manualEvidence = mergeManualEvidence(fresh, persisted);
      const result = await dependencies.upsertCandidate({ ...item.candidate, manualEvidence }, item.rawPayload);
      if (result.verification.status === "verified") verifiedCount += 1;
    } catch (error) {
      failedCount += 1;
      failureCode ??= classifyFailure(error);
      if (error instanceof VisionVerifierError) break;
    }
  }

  const status: SourceRunInput["status"] = failedCount
    ? "failed"
    : verifiedCount ? "success" : "empty";
  const run = sourceRun(
    startedAt,
    dependencies.now(),
    status,
    attemptedCount,
    discoveredCount,
    verifiedCount,
    failureCode,
  );
  await dependencies.recordSourceRuns([run]);
  return { status, searchedCount: attemptedCount, verifiedCount, failedCount };
}

function sourceRun(
  startedAt: string,
  finishedAt: Date,
  status: SourceRunInput["status"],
  searchedCount: number,
  discoveredCount: number,
  acceptedCount: number,
  messageCode: string | null,
): SourceRunInput {
  return {
    adapter: "responses-vision-v1",
    source: "manual_photo_verification",
    status,
    startedAt,
    finishedAt: finishedAt.toISOString(),
    searchedCount,
    discoveredCount,
    acceptedCount,
    messageCode,
  };
}

function classifyFailure(error: unknown) {
  if (error instanceof VisionVerifierError) return error.code;
  const message = error instanceof Error ? error.message : "";
  if (/\((401|403)\)/.test(message)) return "credential_rejected";
  if (/\(402\)/.test(message)) return "budget_exceeded";
  if (/\(429\)/.test(message)) return "rate_limited";
  if (/incomplete structured output|structured output|invalid/i.test(message)) return "invalid_response";
  return "verification_failed";
}
