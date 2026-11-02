import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const projectRoot = new URL("../../", import.meta.url);
const readProjectFile = (relativePath: string) =>
  readFileSync(new URL(relativePath, projectRoot), "utf8");

describe("private Supabase schema contract", () => {
  it("keeps catcht outside the Data API", () => {
    const config = readProjectFile("supabase/config.toml");

    expect(config).toContain('schemas = ["public", "graphql_public"]');
    expect(config).not.toMatch(/schemas\s*=\s*\[[^\]]*"catcht"/);
  });

  it("has an executable database contract for every browser-facing role and table", () => {
    const contract = readProjectFile("supabase/tests/private_schema_privileges.test.sql");

    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(contract).toContain(`'${role}'`);
    }
    expect(contract).toContain("acl.grantee = 0");
    expect(contract).toContain("information_schema.tables");
    expect(contract).toContain("has_schema_privilege");
    expect(contract).toContain("has_table_privilege");
    expect(contract).toContain("pg_default_acl");
    expect(contract).toContain("catcht_app");
    expect(contract).toContain("mookmobile_app");
  });

  it("removes historical UPDATE drift from append-only tables", () => {
    const migration = readProjectFile(
      "supabase/migrations/20261102030000_restrict_append_only_runtime_access.sql",
    );

    expect(migration).toMatch(
      /revoke update on catcht\.digest_items, catcht\.source_runs from mookmobile_app/i,
    );
    expect(migration).toMatch(
      /revoke update on catcht\.digest_items, catcht\.source_runs from catcht_app/i,
    );
  });
});
