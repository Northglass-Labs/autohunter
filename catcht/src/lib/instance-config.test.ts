import { describe, expect, it } from "vitest";
import { instanceConfigFromEnv } from "./instance-config";

describe("instanceConfigFromEnv", () => {
  it("uses the Northglass AutoHunter product identity by default", () => {
    expect(instanceConfigFromEnv({})).toEqual({
      appName: "AutoHunter",
      recipientName: "your household",
      locationLabel: "your search center",
      endorsement: "a Northglass Product",
    });
  });

  it("supports an independently branded deployment", () => {
    expect(instanceConfigFromEnv({
      APP_NAME: "Private Garage",
      RECIPIENT_NAME: "Alex",
      SEARCH_LOCATION_LABEL: "Test Region",
    })).toEqual({
      appName: "Private Garage",
      recipientName: "Alex",
      locationLabel: "Test Region",
      endorsement: "a Northglass Product",
    });
  });
});
