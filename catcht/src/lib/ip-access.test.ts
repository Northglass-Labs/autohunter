import { describe, expect, it } from "vitest";
import { isAllowedIp } from "./ip-access";

describe("IP access", () => {
  it("matches an exact IPv4 address from a comma-separated allowlist", () => {
    expect(isAllowedIp("203.0.113.42", "198.51.100.10,203.0.113.42")).toBe(true);
    expect(isAllowedIp("203.0.113.43", "198.51.100.10,203.0.113.42")).toBe(false);
  });

  it("uses the first Vercel-forwarded address and rejects missing values", () => {
    expect(isAllowedIp("203.0.113.42, 198.51.100.10", "203.0.113.42")).toBe(true);
    expect(isAllowedIp(null, "203.0.113.42")).toBe(false);
  });
});
