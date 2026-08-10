import { ingestRequestSchema, type IngestCandidate } from "@/lib/ingest-schema";
import { getPersistedManualEvidence, recordSourceRuns, upsertCandidate } from "@/lib/dal";
import { isAuthorizedMachineRequest } from "@/lib/machine-auth";
import type { CandidateOffer, ManualPhotoEvidence } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorizedMachineRequest(request, "INGEST_SECRET")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = ingestRequestSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const results = [];
  for (const candidate of parsed.data.candidates) {
    const evidence = await evidenceFor(candidate);
    results.push(
      await upsertCandidate(
        candidateWithEvidence(candidate, evidence),
        { receivedAt: new Date().toISOString(), candidate },
      ),
    );
  }
  await recordSourceRuns(parsed.data.sourceRuns);
  return Response.json({ accepted: results.length, sourceRuns: parsed.data.sourceRuns.length, results });
}

async function evidenceFor(candidate: IngestCandidate): Promise<ManualPhotoEvidence[]> {
  if (candidate.manualEvidence !== undefined) return candidate.manualEvidence;
  if (candidate.offerKind === "lease" || candidate.requiresManualVerification === false) return [];
  const normalized = candidateWithEvidence(candidate, []);
  return getPersistedManualEvidence(normalized);
}

function candidateWithEvidence(
  candidate: IngestCandidate,
  manualEvidence: ManualPhotoEvidence[],
): CandidateOffer {
  if (candidate.offerKind === "lease") {
    return {
      ...candidate,
      offerKind: "lease",
      condition: candidate.condition === "used" ? "new" : candidate.condition,
      price: null,
      mileage: null,
      manualEvidence,
    };
  }
  if (
    candidate.year === null || candidate.year === undefined
    || candidate.price === null || candidate.price === undefined
    || candidate.mileage === null || candidate.mileage === undefined
    || candidate.distanceMiles === null || candidate.distanceMiles === undefined
  ) {
    throw new Error("validated purchase inventory is missing required facts");
  }
  return {
    ...candidate,
    offerKind: candidate.offerKind,
    condition: candidate.condition ?? candidate.offerKind,
    year: candidate.year,
    price: candidate.price,
    mileage: candidate.mileage,
    distanceMiles: candidate.distanceMiles,
    manualEvidence,
  };
}
