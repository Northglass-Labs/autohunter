import { getActiveSavedSearchesForCollector } from "@/lib/dal";
import { collectorSearch } from "@/lib/collector-config";
import { isAuthorizedMachineRequest } from "@/lib/machine-auth";
import { SEARCH_POLICY } from "@/lib/search-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedMachineRequest(request, "INGEST_SECRET")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const searches = await getActiveSavedSearchesForCollector();
  const legacyModels = searches
    .filter((search) => search.offerKind === "used" && search.transmission === "manual")
    .map(({ make, model, aliases }) => ({ make, model, aliases }));
  return Response.json({
    version: 2,
    searches: searches.map(collectorSearch),
    // Compatibility contract for the predecessor v1 collector during provider cutover.
    search: {
      condition: "used",
      zip: SEARCH_POLICY.centerZip,
      radiusMiles: SEARCH_POLICY.maxDistanceMiles,
      maxPrice: SEARCH_POLICY.maxPrice,
      maxMileage: SEARCH_POLICY.maxMileage,
      transmission: "manual",
      models: legacyModels,
    },
  });
}
