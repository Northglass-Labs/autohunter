import { describe, expect, it } from "vitest";
import { reportFrequencyFor, reportSettingsFor } from "./report-settings";

describe("report frequency", () => {
  it("names a profile's cadence the way the report settings offer it", () => {
    expect(reportFrequencyFor({ digestEnabled: true, digestCadenceHours: 23 })).toBe("daily");
    expect(reportFrequencyFor({ digestEnabled: true, digestCadenceHours: 24 })).toBe("daily");
    expect(reportFrequencyFor({ digestEnabled: true, digestCadenceHours: 72 })).toBe("every_third_day");
    expect(reportFrequencyFor({ digestEnabled: true, digestCadenceHours: 168 })).toBe("weekly");
    expect(reportFrequencyFor({ digestEnabled: false, digestCadenceHours: 72 })).toBe("paused");
  });

  it("maps an unusual operator cadence to the nearest offered choice", () => {
    expect(reportFrequencyFor({ digestEnabled: true, digestCadenceHours: 48 })).toBe("every_third_day");
    expect(reportFrequencyFor({ digestEnabled: true, digestCadenceHours: 336 })).toBe("weekly");
  });

  it("turns a choice into profile settings, keeping the cadence when reports are paused", () => {
    expect(reportSettingsFor("daily")).toEqual({ digestEnabled: true, digestCadenceHours: 24 });
    expect(reportSettingsFor("every_third_day")).toEqual({ digestEnabled: true, digestCadenceHours: 72 });
    expect(reportSettingsFor("weekly")).toEqual({ digestEnabled: true, digestCadenceHours: 168 });
    expect(reportSettingsFor("paused")).toEqual({ digestEnabled: false, digestCadenceHours: null });
  });
});
