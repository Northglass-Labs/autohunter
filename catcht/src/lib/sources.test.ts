import { describe, expect, it } from "vitest";
import { SOURCE_SEARCHES } from "./sources";

describe("SOURCE_SEARCHES", () => {
  it("uses the configured $15k and 120k-mile limits on sources that expose those filters", () => {
    const filtered = SOURCE_SEARCHES.filter(({ source }) =>
      ["autotempest", "cargurus", "autotrader", "cars.com"].includes(source),
    );

    expect(filtered).toHaveLength(4);
    for (const search of filtered) {
      expect(search.url).toMatch(/15000|under-15000/);
      expect(search.url).toContain("120000");
    }
  });
});
