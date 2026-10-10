import { describe, expect, it } from "vitest";
import { isEmailLinkSession, normalizeEmail, safeNextPath } from "./auth-policy";

describe("auth policy", () => {
  it("normalizes invited email addresses at the server boundary", () => {
    expect(normalizeEmail("  Driver.Example@Example.COM ")).toBe("driver.example@example.com");
    expect(() => normalizeEmail("not-an-email")).toThrow();
  });

  it("accepts only same-origin relative post-login paths", () => {
    expect(safeNextPath("/interested?lane=ev")).toBe("/interested?lane=ev");
    expect(safeNextPath("https://attacker.example/steal")).toBe("/");
    expect(safeNextPath("//attacker.example/steal")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });

  it("accepts only sessions that an email link or code created", () => {
    expect(isEmailLinkSession([{ method: "magiclink", timestamp: 1 }])).toBe(true);
    expect(isEmailLinkSession([{ method: "otp", timestamp: 1 }])).toBe(true);
    expect(isEmailLinkSession([{ method: "email/signup", timestamp: 1 }])).toBe(true);
    expect(isEmailLinkSession(["invite"])).toBe(true);
    // A second factor on top of an email link is still an email-link session.
    expect(isEmailLinkSession([{ method: "magiclink", timestamp: 1 }, { method: "mfa/totp", timestamp: 2 }])).toBe(true);
  });

  it("refuses password, anonymous, and unidentified sessions", () => {
    expect(isEmailLinkSession([{ method: "password", timestamp: 1 }])).toBe(false);
    expect(isEmailLinkSession(["password"])).toBe(false);
    expect(isEmailLinkSession([{ method: "anonymous", timestamp: 1 }])).toBe(false);
    expect(isEmailLinkSession([{ method: "oauth", timestamp: 1 }])).toBe(false);
    // An email link cannot launder a password sign-in in the same session.
    expect(isEmailLinkSession([{ method: "password", timestamp: 1 }, { method: "otp", timestamp: 2 }])).toBe(false);
    expect(isEmailLinkSession([])).toBe(false);
    expect(isEmailLinkSession(undefined)).toBe(false);
    expect(isEmailLinkSession("magiclink")).toBe(false);
  });
});
