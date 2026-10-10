import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSourceHealth } from "@/lib/dal";
import { GET } from "./route";

vi.mock("@/lib/dal", () => ({ getSourceHealth: vi.fn() }));

const fresh = (source: string) => ({
  source,
  adapter: `${source}-v1`,
  status: "success" as const,
  messageCode: null,
  searchedCount: 2,
  discoveredCount: 4,
  acceptedCount: 1,
  finishedAt: new Date().toISOString(),
  lastDiscoveryAt: new Date().toISOString(),
});

describe("GET /api/health/sources", () => {
  beforeEach(() => vi.resetAllMocks());

  it("answers ok while scheduled collection is healthy, revealing nothing else", async () => {
    vi.mocked(getSourceHealth).mockResolvedValue(["marketcheck", "auto_dev", "marketcheck_incentives", "nhtsa"].map(fresh));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("answers 503 degraded when a scheduled source stops working", async () => {
    vi.mocked(getSourceHealth).mockResolvedValue([fresh("marketcheck"), fresh("nhtsa")]);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "degraded" });
  });
});
