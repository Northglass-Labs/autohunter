import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedMachineRequest } from "./machine-auth";

describe("isAuthorizedMachineRequest", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only the complete configured bearer secret", () => {
    const secret = "collector-secret-" + "a".repeat(32);
    vi.stubEnv("INGEST_SECRET", secret);

    expect(isAuthorizedMachineRequest(requestWith(`Bearer ${secret}`), "INGEST_SECRET")).toBe(true);
    expect(isAuthorizedMachineRequest(requestWith(`Bearer ${secret.slice(0, -1)}`), "INGEST_SECRET")).toBe(false);
    expect(isAuthorizedMachineRequest(requestWith(`bearer ${secret}`), "INGEST_SECRET")).toBe(false);
    expect(isAuthorizedMachineRequest(requestWith(null), "INGEST_SECRET")).toBe(false);
  });

  it("fails closed when a machine secret is too weak", () => {
    vi.stubEnv("CRON_SECRET", "short-secret");
    expect(() => isAuthorizedMachineRequest(requestWith("Bearer short-secret"), "CRON_SECRET"))
      .toThrow("CRON_SECRET must be at least 32 characters");
  });
});

function requestWith(authorization: string | null) {
  const headers = new Headers();
  if (authorization !== null) headers.set("authorization", authorization);
  return new Request("https://autohunter.example.test/api/test", { headers });
}
