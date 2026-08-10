import { afterEach, describe, expect, it, vi } from "vitest";
import { getCoreEnv } from "./env";

describe("getCoreEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("parses only the server-side database, action, and origin boundary", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://app:password@db.example.com:5432/catcht");
    vi.stubEnv("ACTION_SIGNING_SECRET", "a".repeat(32));
    vi.stubEnv("APP_URL", "https://catcht.example.com");

    expect(getCoreEnv().APP_URL).toBe("https://catcht.example.com");
  });

  it("rejects a non-HTTPS or path-bearing production application origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://app:password@db.example.com:5432/catcht");
    vi.stubEnv("ACTION_SIGNING_SECRET", "a".repeat(32));
    vi.stubEnv("APP_URL", "http://autohunter.example.com/private");

    expect(() => getCoreEnv()).toThrow("APP_URL must be a credential-free HTTPS origin in production");
  });
});
