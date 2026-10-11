// How often a person's report may arrive, as the report settings offer it. Cadences count Eastern
// calendar days (ADR-021), so each choice stores whole days in `digest_cadence_hours`.
export const REPORT_FREQUENCIES = [
  { value: "daily", label: "Daily", hours: 24 },
  { value: "every_third_day", label: "Every 3 days", hours: 72 },
  { value: "weekly", label: "Weekly", hours: 168 },
  { value: "paused", label: "Paused", hours: null },
] as const;

export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number]["value"];

export function isReportFrequency(value: unknown): value is ReportFrequency {
  return REPORT_FREQUENCIES.some((frequency) => frequency.value === value);
}

// The offered choice for a profile; an operator-set cadence maps to the nearest one.
export function reportFrequencyFor(profile: { digestEnabled: boolean; digestCadenceHours: number }): ReportFrequency {
  if (!profile.digestEnabled) return "paused";
  const days = Math.max(1, Math.round(profile.digestCadenceHours / 24));
  if (days <= 1) return "daily";
  return days < 5 ? "every_third_day" : "weekly";
}

// Profile settings for a choice. Pausing keeps the stored cadence for when reports resume.
export function reportSettingsFor(frequency: ReportFrequency) {
  const choice = REPORT_FREQUENCIES.find((option) => option.value === frequency)!;
  return { digestEnabled: choice.hours !== null, digestCadenceHours: choice.hours };
}
