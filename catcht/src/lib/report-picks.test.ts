import { describe, expect, it } from "vitest";
import { pickReportCandidates } from "./report-picks";

const ranked = (searches: string[]) => searches.map((search, rank) => ({ search, rank }));

describe("pickReportCandidates", () => {
  it("takes at most three picks from one search while others have candidates", () => {
    const picks = pickReportCandidates(ranked(["r1s", "r1s", "r1s", "r1s", "r1s", "s450", "sq7", "r1s", "mdx", "gv80", "mdx", "x5", "lyriq", "r1s"]), (item) => item.search);

    expect(picks).toHaveLength(12);
    expect(picks.filter((item) => item.search === "r1s").length).toBeLessThanOrEqual(5);
    expect(picks.slice(0, 3).map((item) => item.search)).toEqual(["r1s", "r1s", "r1s"]);
    expect(picks.map((item) => item.search)).toEqual(expect.arrayContaining(["s450", "sq7", "mdx", "gv80", "x5", "lyriq"]));
  });

  it("fills remaining slots with the next best candidates, kept in rank order", () => {
    const picks = pickReportCandidates(ranked(["a", "a", "a", "a", "a", "b"]), (item) => item.search, 5);

    expect(picks.map((item) => item.rank)).toEqual([0, 1, 2, 3, 5]);
  });

  it("returns every candidate when there are fewer than the limit", () => {
    expect(pickReportCandidates(ranked(["a", "b"]), (item) => item.search)).toHaveLength(2);
  });
});
