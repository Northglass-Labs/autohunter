import { z } from "zod";
import { isAuthorizedMachineRequest } from "@/lib/machine-auth";
import { BrowserRequiredError, fetchPublicListing } from "@/lib/listing-fetch";

const requestSchema = z.object({ urls: z.array(z.string().url()).min(1).max(20) });

export async function POST(request: Request) {
  if (!isAuthorizedMachineRequest(request, "INGEST_SECRET")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const results = await Promise.allSettled(parsed.data.urls.map(fetchPublicListing));
  return Response.json({
    results: results.map((result, index) =>
      result.status === "fulfilled"
        ? { ok: true, ...result.value }
        : {
            ok: false,
            url: parsed.data.urls[index],
            code: result.reason instanceof BrowserRequiredError ? result.reason.code : "scrape_failed",
            error: result.reason instanceof Error ? result.reason.message : "scrape failed",
          },
    ),
  });
}
