import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { requireEnv } from "./env";

type MachineSecretName = "CRON_SECRET" | "INGEST_SECRET";

export function isAuthorizedMachineRequest(request: Request, secretName: MachineSecretName) {
  const expected = requireEnv(secretName);
  if (expected.length < 32) throw new Error(`${secretName} must be at least 32 characters`);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  if (!supplied || supplied.length > 4_096) return false;

  return timingSafeEqual(digest(supplied), digest(expected));
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}
