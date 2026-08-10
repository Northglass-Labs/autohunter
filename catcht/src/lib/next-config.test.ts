import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("production response headers", () => {
  it("locks the private application to its own scripts, forms, and frame boundary", async () => {
    const rules = await nextConfig.headers!();
    const headers = new Map(rules[0].headers.map(({ key, value }) => [key, value]));

    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(headers.get("Content-Security-Policy")).toContain("form-action 'self'");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});
