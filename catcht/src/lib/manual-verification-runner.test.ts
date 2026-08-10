import { describe, expect, it, vi } from "vitest";
import { runPendingPhotoVerification } from "./manual-verification-runner";
import { VisionVerifierError } from "./vision";

const candidate = {
  offerKind: "used" as const,
  condition: "used" as const,
  source: "marketcheck" as const,
  sourceListingId: "source-1",
  url: "https://dealer.example.com/car-1",
  vin: "JF1ZCAC19E9602638",
  year: 2014,
  make: "Subaru",
  model: "BRZ",
  title: "2014 Subaru BRZ",
  price: 12_900,
  mileage: 103_302,
  distanceMiles: 73,
  location: "Toms River, NJ",
  transmissionClaim: "6-Speed Manual",
  imageUrls: ["https://images.example.com/exterior.jpg", "https://images.example.com/shifter.jpg"],
  manualEvidence: [],
};

describe("runPendingPhotoVerification", () => {
  it("verifies unseen gallery photos and records non-secret health", async () => {
    const recordSourceRuns = vi.fn();
    const evidence = {
      imageUrl: candidate.imageUrls[1],
      shiftPatternVisible: true,
      manualLeverVisible: true,
      stockStyleShifter: true,
      matchingInteriorLikely: true,
      confidence: 0.94,
      observedPattern: "6-speed H-pattern",
      notes: "Clear conventional lever.",
      verifierModel: "openai/gpt-5.4-mini",
    };
    const upsertCandidate = vi.fn().mockResolvedValue({ verification: { status: "verified" } });

    const result = await runPendingPhotoVerification({
      getVisionAvailability: () => ({ configured: true, provider: "vercel-gateway", model: "openai/gpt-5.4-mini", messageCode: null }),
      getPendingVerificationCandidates: vi.fn().mockResolvedValue([{ candidate, rawPayload: { provider: "test" } }]),
      getPersistedManualEvidence: vi.fn().mockResolvedValue([]),
      verifyShifterPhotos: vi.fn().mockResolvedValue([evidence]),
      upsertCandidate,
      recordSourceRuns,
      now: () => new Date("2026-07-16T20:00:00Z"),
    });

    expect(result).toMatchObject({ status: "success", searchedCount: 1, verifiedCount: 1 });
    expect(upsertCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ manualEvidence: [evidence] }),
      { provider: "test" },
    );
    expect(recordSourceRuns).toHaveBeenCalledWith([
      expect.objectContaining({
        source: "manual_photo_verification",
        status: "success",
        searchedCount: 1,
        acceptedCount: 1,
      }),
    ]);
  });

  it("reports an unavailable verifier without attempting billable work", async () => {
    const recordSourceRuns = vi.fn();
    const verifyShifterPhotos = vi.fn();

    const result = await runPendingPhotoVerification({
      getVisionAvailability: () => ({ configured: false, provider: "disabled", model: null, messageCode: "provider_disabled" }),
      getPendingVerificationCandidates: vi.fn(),
      getPersistedManualEvidence: vi.fn(),
      verifyShifterPhotos,
      upsertCandidate: vi.fn(),
      recordSourceRuns,
      now: () => new Date("2026-07-16T20:00:00Z"),
    });

    expect(result).toMatchObject({ status: "unavailable", searchedCount: 0, verifiedCount: 0 });
    expect(verifyShifterPhotos).not.toHaveBeenCalled();
    expect(recordSourceRuns).toHaveBeenCalledWith([
      expect.objectContaining({ status: "unavailable", messageCode: "provider_disabled" }),
    ]);
  });

  it("records a bounded provider failure without throwing the collection cycle", async () => {
    const recordSourceRuns = vi.fn();
    const verifyShifterPhotos = vi.fn().mockRejectedValue(
      new VisionVerifierError("customer_verification_required", 403),
    );

    const result = await runPendingPhotoVerification({
      getVisionAvailability: () => ({ configured: true, provider: "vercel-gateway", model: "openai/gpt-5.4-mini", messageCode: null }),
      getPendingVerificationCandidates: vi.fn().mockResolvedValue([
        { candidate, rawPayload: {} },
        { candidate: { ...candidate, sourceListingId: "source-2" }, rawPayload: {} },
      ]),
      getPersistedManualEvidence: vi.fn().mockResolvedValue([]),
      verifyShifterPhotos,
      upsertCandidate: vi.fn(),
      recordSourceRuns,
      now: () => new Date("2026-07-16T20:00:00Z"),
    });

    expect(result).toMatchObject({ status: "failed", searchedCount: 1, failedCount: 1 });
    expect(verifyShifterPhotos).toHaveBeenCalledTimes(1);
    expect(recordSourceRuns).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "failed",
        messageCode: "customer_verification_required",
        searchedCount: 1,
      }),
    ]);
  });
});
