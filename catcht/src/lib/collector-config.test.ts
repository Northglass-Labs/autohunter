import { describe, expect, it } from "vitest";
import { collectorSearch } from "./collector-config";

describe("collectorSearch", () => {
  it("keeps routing identifiers but omits household display metadata", () => {
    const result = collectorSearch({
      id: "11111111-1111-4111-8111-111111111111",
      ownerId: "22222222-2222-4222-8222-222222222222",
      ownerName: "Private household member",
      name: "Family EV",
      aliases: ["EQS SUV"],
      sourceIds: { marketcheck: "eqs" },
      offerKind: "used",
    });

    expect(result).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Family EV",
      aliases: ["EQS SUV"],
      sourceIds: { marketcheck: "eqs" },
      offerKind: "used",
    });
    expect(result).not.toHaveProperty("ownerId");
    expect(result).not.toHaveProperty("ownerName");
  });
});
