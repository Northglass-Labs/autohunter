import * as cheerio from "cheerio";

export interface ParsedVehicle {
  title: string | null;
  vin: string | null;
  mileage: number | null;
  price: number | null;
  transmissionClaim: string | null;
  imageUrls: string[];
}

type JsonRecord = Record<string, unknown>;

function records(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(records);
  if (!value || typeof value !== "object") return [];
  const record = value as JsonRecord;
  if (Array.isArray(record["@graph"])) return records(record["@graph"]);
  return [record];
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object") return numberValue((value as JsonRecord).value);
  return null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseVehicleJsonLd(html: string): ParsedVehicle | null {
  const $ = cheerio.load(html);
  for (const element of $("script[type='application/ld+json']").toArray()) {
    try {
      const parsed = JSON.parse($(element).text()) as unknown;
      const vehicle = records(parsed).find((item) => {
        const type = item["@type"];
        return type === "Vehicle" || (Array.isArray(type) && type.includes("Vehicle"));
      });
      if (!vehicle) continue;
      const offers = (vehicle.offers ?? {}) as JsonRecord;
      const rawImages = vehicle.image;
      const imageUrls = (Array.isArray(rawImages) ? rawImages : [rawImages])
        .map((image) =>
          typeof image === "string"
            ? image
            : image && typeof image === "object"
              ? textValue((image as JsonRecord).url)
              : null,
        )
        .filter((url): url is string => Boolean(url));
      return {
        title: textValue(vehicle.name),
        vin: textValue(vehicle.vehicleIdentificationNumber ?? vehicle.vin),
        mileage: numberValue(vehicle.mileageFromOdometer),
        price: numberValue(offers.price ?? vehicle.price),
        transmissionClaim: textValue(vehicle.vehicleTransmission),
        imageUrls,
      };
    } catch {
      // Ignore malformed third-party JSON-LD and continue to the next block.
    }
  }
  return null;
}
