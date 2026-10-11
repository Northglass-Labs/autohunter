import { getSourceHealth } from "@/lib/dal";
import { scheduledSourcesHealthy } from "@/lib/source-health-summary";

export const dynamic = "force-dynamic";

// Public uptime contract for scheduled collection. It answers only "ok" or "degraded", so it
// reveals no source names, counts or timings; administrators see the detail on the dashboard.
export async function GET() {
  const healthy = scheduledSourcesHealthy(await getSourceHealth());
  return Response.json(
    { status: healthy ? "ok" : "degraded" },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
