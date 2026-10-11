import { runDigest } from "@/lib/digest";
import { isAuthorizedMachineRequest } from "@/lib/machine-auth";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedMachineRequest(request, "CRON_SECRET")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await runDigest());
}
