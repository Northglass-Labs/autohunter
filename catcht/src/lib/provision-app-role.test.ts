import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("the production database role runbook", () => {
  it("grants the app role access to every private multi-user table", () => {
    const script = readFileSync(
      join(process.cwd(), "supabase", "provision-app-role.psql"),
      "utf8",
    );

    for (const table of ["user_profiles", "listing_matches", "user_listing_decisions"]) {
      expect(script).toMatch(
        new RegExp(`grant\\s+select,\\s*insert,\\s*update\\s+on\\s+catcht\\.${table}\\s+to\\s+catcht_app`, "i"),
      );
    }
  });
});
