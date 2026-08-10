import { runDigest } from "@/lib/digest";
import { isAuthorizedMachineRequest } from "@/lib/machine-auth";
import { runPendingPhotoVerification } from "@/lib/manual-verification-runner";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedMachineRequest(request, "CRON_SECRET")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const verification = await runPendingPhotoVerification({}, {
    oidcToken: request.headers.get("x-vercel-oidc-token"),
  });
  return Response.json({ ...await runDigest(), verification });
}
