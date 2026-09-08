export function vehicleTitle(title: unknown, vehicle: Record<string, unknown>) {
  const heading = typeof title === "string" ? title.trim() : "";
  if (heading && !/https?:\/\/|www\./i.test(heading)) return heading;
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).trim()).filter(Boolean).join(" ") || "Vehicle details pending";
}
