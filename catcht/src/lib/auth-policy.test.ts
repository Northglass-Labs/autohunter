import { describe, expect, it } from "vitest";
import { normalizeEmail, safeNextPath } from "./auth-policy";

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
});
