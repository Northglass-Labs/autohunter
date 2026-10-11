// Dealer headings carry condition labels, pipe-separated odometer and drivetrain notes, colours,
// and package lists. Cards keep the vehicle and fall back to structured identity.
const CONDITION_PREFIX = /^(?:certified\s+pre-?owned|pre-?owned|used|new|cpo)\s+/i;
const CONDITION_ONLY = /^(?:certified\s+pre-?owned|pre-?owned|used|new|cpo)$/i;
const ODOMETER_SEGMENT = /^[\d,]+\s*(?:mi|miles)\b/i;
const DRIVETRAIN_SEGMENT = /^(?:(?:all|four|front|rear)[- ]wheel[- ]drive|awd|4wd|fwd|rwd|4x4)$/i;

export function vehicleTitle(title: unknown, vehicle: Record<string, unknown>) {
  const heading = typeof title === "string" ? cleanHeading(title) : "";
  if (heading && !/https?:\/\/|www\./i.test(heading) && /[a-z]/i.test(heading.replace(/^\d{4}\s*/, ""))) return heading;
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).trim()).filter(Boolean).join(" ") || "Vehicle details pending";
}

function cleanHeading(raw: string) {
  const segments = raw.split("|").map((segment) => segment.trim())
    .filter((segment) => segment && !CONDITION_ONLY.test(segment) && !ODOMETER_SEGMENT.test(segment) && !DRIVETRAIN_SEGMENT.test(segment));
  const text = segments.join(" ")
    .replace(CONDITION_PREFIX, "")
    .split(/\s+w\/|\s+with\s+/i)[0]
    .replace(/(?:,\s*[A-Za-z][A-Za-z ]*)?,\s*mileage:?\s*[\d,]+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  // A dealer heading sometimes repeats the model ("EQS EQS 450"); keep one.
  return text.replace(/\b(\S+)\s+\1\b/gi, "$1");
}
