import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceHealth } from "./source-health";

describe("SourceHealth", () => {
  it("discloses a provider-plan radius cap even when collection succeeds", () => {
    const html = renderToStaticMarkup(<SourceHealth sources={[{
      source: "marketcheck",
      adapter: "marketcheck-inventory-v2",
      status: "success",
      messageCode: "radius_capped_100mi",
      searchedCount: 6,
      discoveredCount: 3,
      acceptedCount: 2,
      finishedAt: "2026-07-14T12:00:00.000Z",
    }]} />);

    expect(html).toContain("2 accepted from 3 · 100-mile coverage cap");
  });
});
