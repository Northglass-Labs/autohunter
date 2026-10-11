import { describe, expect, it } from "vitest";
import { lanePreview } from "./queue-preview";

describe("lanePreview", () => {
  const listings = Array.from({ length: 30 }, (_, index) => index);

  it("shows each lane's best twelve in the all-lanes overview", () => {
    expect(lanePreview(listings, false)).toEqual({ shown: listings.slice(0, 12), hidden: 18 });
  });

  it("shows the whole lane once it is selected", () => {
    expect(lanePreview(listings, true)).toEqual({ shown: listings, hidden: 0 });
  });

  it("hides nothing in a short lane", () => {
    expect(lanePreview(listings.slice(0, 5), false)).toEqual({ shown: listings.slice(0, 5), hidden: 0 });
  });
});
