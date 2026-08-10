import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { AutoHunterLockup, AutoHunterMark } from "./autohunter-brand";

const brandDir = path.join(process.cwd(), "public", "brand");

function brandAsset(name: string) {
  return readFileSync(path.join(brandDir, name), "utf8");
}

describe("AutoHunter product identity", () => {
  it("keeps the standalone mark single-color and the endorsement separate from its accessible name", () => {
    const mark = renderToStaticMarkup(<AutoHunterMark />);
    const lockup = renderToStaticMarkup(<AutoHunterLockup />);

    expect(mark).toContain('aria-label="AutoHunter"');
    expect(mark).toContain('fill="currentColor"');
    expect(mark).not.toContain("Northglass");
    expect(lockup).toContain("AutoHunter");
    expect(lockup).toContain("a Northglass Product");
  });

  it("ships an editable identity kit with symbol, wordmark, lockup, app icon, and favicon-safe variants", () => {
    const expected = [
      "README.md",
      "autohunter-app-icon.svg",
      "autohunter-favicon-16.svg",
      "autohunter-favicon-32.svg",
      "autohunter-lockup.svg",
      "autohunter-symbol.svg",
      "autohunter-wordmark.svg",
    ];

    for (const file of expected) {
      expect(() => brandAsset(file), file).not.toThrow();
    }

    const symbol = brandAsset("autohunter-symbol.svg");
    const wordmark = brandAsset("autohunter-wordmark.svg");
    const lockup = brandAsset("autohunter-lockup.svg");
    const appIcon = brandAsset("autohunter-app-icon.svg");
    const favicon16 = brandAsset("autohunter-favicon-16.svg");
    const favicon32 = brandAsset("autohunter-favicon-32.svg");
    const readme = brandAsset("README.md");

    expect(symbol).toContain('data-mark="autohunter-a-road"');
    expect(symbol).toContain("prefers-color-scheme: dark");
    expect(symbol).not.toContain("linearGradient");
    expect(wordmark).toContain("AutoHunter");
    expect(lockup).toContain("AutoHunter");
    expect(lockup).not.toContain("a Northglass Product");
    expect(appIcon).toContain('viewBox="0 0 64 64"');
    expect(favicon16).toContain('width="16"');
    expect(favicon32).toContain('width="32"');
    expect(readme).toContain("a Northglass Product");
    expect(readme).toContain("light, dark, and single-color");
  });

  it("publishes the canonical app icon in the install manifest", () => {
    const productManifest = manifest();

    expect(productManifest.name).toBe("AutoHunter");
    expect(productManifest.icons).toContainEqual({
      src: "/brand/autohunter-app-icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    });
  });
});
