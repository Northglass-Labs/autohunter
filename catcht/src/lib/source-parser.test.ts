import { describe, expect, it } from "vitest";
import { parseVehicleJsonLd } from "./source-parser";

describe("parseVehicleJsonLd", () => {
  it("extracts normalized vehicle fields and photos from public JSON-LD", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Vehicle",
      name: "2019 Honda Civic Si",
      vehicleIdentificationNumber: "2HGFC3A59KH000001",
      mileageFromOdometer: { value: 71000 },
      vehicleTransmission: "6-Speed Manual",
      image: ["https://img.example/1.jpg", "https://img.example/shift.jpg"],
      offers: { price: "18995", priceCurrency: "USD" },
    })}</script>`;
    expect(parseVehicleJsonLd(html)).toMatchObject({
      title: "2019 Honda Civic Si",
      vin: "2HGFC3A59KH000001",
      mileage: 71000,
      price: 18995,
      transmissionClaim: "6-Speed Manual",
    });
  });
});
