import { describe, expect, it } from "vitest";
import { canonicalRedirectUrl } from "./canonical-origin";

describe("canonicalRedirectUrl", () => {
  it("permanently moves legacy product origins while preserving path and query", () => {
    expect(canonicalRedirectUrl(
      "https://mookmobile.tomstetson.dev/reports?lane=ev",
      "https://autohunter.northglass.io",
    )?.toString()).toBe("https://autohunter.northglass.io/reports?lane=ev");

    expect(canonicalRedirectUrl(
      "https://mookmobile.vercel.app/login",
      "https://autohunter.northglass.io",
    )?.toString()).toBe("https://autohunter.northglass.io/login");
  });

  it("does not redirect canonical, preview, or local origins", () => {
    expect(canonicalRedirectUrl(
      "https://autohunter.northglass.io/login",
      "https://autohunter.northglass.io",
    )).toBeNull();
    expect(canonicalRedirectUrl(
      "http://127.0.0.1:3100/login",
      "https://autohunter.northglass.io",
    )).toBeNull();
  });

  it("fails closed when the configured application origin is absent or invalid", () => {
    expect(canonicalRedirectUrl("https://mookmobile.vercel.app/login", undefined)).toBeNull();
    expect(canonicalRedirectUrl("https://mookmobile.vercel.app/login", "not-a-url")).toBeNull();
  });
});
