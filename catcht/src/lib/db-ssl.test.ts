import { describe, expect, it } from "vitest";
import { databaseSslOptions } from "./db-ssl";

describe("databaseSslOptions", () => {
  it("uses the system trust store when no private CA is configured", () => {
    expect(databaseSslOptions()).toEqual({ rejectUnauthorized: true });
  });

  it("normalizes an environment-safe PEM before adding it to the trust store", () => {
    expect(databaseSslOptions("-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----\\n")).toEqual({
      rejectUnauthorized: true,
      ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n",
    });
  });

  it("rejects a non-certificate CA value", () => {
    expect(() => databaseSslOptions("not a certificate")).toThrow(
      "DATABASE_CA_CERT must contain a PEM certificate",
    );
  });

  it("allows an explicit local-development TLS opt-out", () => {
    expect(databaseSslOptions(undefined, "disable")).toBe(false);
  });
});
