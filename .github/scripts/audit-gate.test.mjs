import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditFindings, parseAuditReport, resolveAuditMode } from "./audit-gate.mjs";

const advisory = (name, id, severity = "high") => ({ source: 1, name, severity, url: `https://github.com/advisories/${id}` });
const report = {
  vulnerabilities: {
    braces: { name: "braces", severity: "high", via: [advisory("braces", "GHSA-vfj7-8cjw-p6xm")] },
    micromatch: { name: "micromatch", severity: "high", via: ["braces"] },
    next: { name: "next", severity: "high", via: [advisory("next", "GHSA-3w37-wq28-93x7")] },
    "left-pad": { name: "left-pad", severity: "moderate", via: [advisory("left-pad", "GHSA-xxxx-moderate", "moderate")] },
  },
};
const allowlist = [{ id: "GHSA-vfj7-8cjw-p6xm", package: "braces", reason: "dev-only, unpatched", expires: "2026-12-31" }];

test("blocks every high advisory except a matching, unexpired exception", () => {
  const { blocking, excepted } = auditFindings(report, allowlist, "2026-10-10");
  assert.deepEqual(blocking, ["next GHSA-3w37-wq28-93x7 (high)"]);
  assert.deepEqual(excepted, ["braces GHSA-vfj7-8cjw-p6xm (high) until 2026-12-31: dev-only, unpatched"]);
});

test("an expired exception blocks again", () => {
  const { blocking } = auditFindings(report, allowlist, "2027-01-01");
  assert.ok(blocking.includes("braces GHSA-vfj7-8cjw-p6xm (high)"));
});

test("missing or unknown advisory severities fail closed", () => {
  for (const severity of [undefined, "future-severity"]) {
    const malformed = {
      vulnerabilities: {
        package: {
          name: "package",
          severity: "high",
          via: [{ source: 1, url: "https://github.com/advisories/GHSA-unknown", severity }],
        },
      },
    };
    assert.throws(
      () => auditFindings(malformed, [], "2026-10-10"),
      /unsupported npm audit severity/,
    );
  }
});

test("a realistic nested transitive report resolves to its direct advisories", () => {
  const nested = {
    vulnerabilities: {
      "camoufox-js": { name: "camoufox-js", severity: "moderate", via: ["glob"] },
      glob: {
        name: "glob",
        severity: "moderate",
        via: [advisory("glob", "GHSA-3g3m-2fjr-6pw4", "moderate"), "minimatch"],
      },
      minimatch: {
        name: "minimatch",
        severity: "moderate",
        via: [advisory("minimatch", "GHSA-g3hv-75wg-m249", "moderate")],
      },
    },
  };

  assert.deepEqual(
    auditFindings(nested, [], "2026-10-10", { minimumSeverity: "moderate", allowExceptions: false })
      .blocking,
    ["glob GHSA-3g3m-2fjr-6pw4 (moderate)", "minimatch GHSA-g3hv-75wg-m249 (moderate)"],
  );
});

test("partial, empty, inconsistent, or string-only cyclic advisory graphs fail closed", () => {
  const malformedReports = [
    {
      vulnerabilities: {
        outer: { name: "outer", severity: "critical", via: ["missing-direct-package"] },
      },
    },
    {
      vulnerabilities: {
        outer: { name: "outer", severity: "critical", via: [] },
      },
    },
    {
      vulnerabilities: {
        outer: {
          name: "outer",
          severity: "critical",
          via: [advisory("outer", "GHSA-low-direct", "low")],
        },
      },
    },
    {
      vulnerabilities: {
        first: { name: "first", severity: "critical", via: ["second"] },
        second: { name: "second", severity: "critical", via: ["first"] },
      },
    },
    {
      vulnerabilities: {
        first: {
          name: "first",
          severity: "critical",
          via: ["second", advisory("first", "GHSA-low-ground", "low")],
        },
        second: { name: "second", severity: "critical", via: ["first"] },
      },
    },
  ];

  for (const malformed of malformedReports) {
    assert.throws(() => auditFindings(malformed, [], "2026-10-10"), /malformed npm audit graph/);
  }
});

test("every direct advisory requires a stable URL or numeric source identifier", () => {
  const malformed = {
    vulnerabilities: {
      package: {
        name: "package",
        severity: "critical",
        via: [{ name: "package", severity: "critical", url: "" }],
      },
    },
  };

  assert.throws(() => auditFindings(malformed, [], "2026-10-10"), /stable identifier/);
});

test("a branching ungrounded graph fails in bounded time", () => {
  const vulnerabilities = {};
  const packageCount = 35;
  for (let index = 0; index < packageCount - 2; index += 1) {
    vulnerabilities[`package-${index}`] = {
      name: `package-${index}`,
      severity: "critical",
      via: [`package-${index + 1}`, `package-${index + 2}`],
    };
  }
  vulnerabilities[`package-${packageCount - 2}`] = {
    name: `package-${packageCount - 2}`,
    severity: "critical",
    via: [`package-${packageCount - 1}`],
  };
  vulnerabilities[`package-${packageCount - 1}`] = {
    name: `package-${packageCount - 1}`,
    severity: "critical",
    via: [`package-${packageCount - 2}`],
  };

  const startedAt = performance.now();
  assert.throws(
    () => auditFindings({ vulnerabilities }, [], "2026-10-10"),
    /does not resolve to a direct advisory/,
  );
  assert.ok(performance.now() - startedAt < 1_000, "graph validation must stay polynomially bounded");
});

test("today and exception expiries require real zero-padded ISO calendar dates", () => {
  for (const today of ["2026-2-01", "2026-02-30", "not-a-date"]) {
    assert.throws(() => auditFindings(report, allowlist, today), /invalid audit date/);
  }
  for (const expires of ["9999-not-a-date", "2026-2-01", "2026-02-30"]) {
    assert.throws(
      () => auditFindings(report, [{ ...allowlist[0], expires }], "2026-10-10"),
      /invalid audit exception expiry/,
    );
  }
});

test("the exception allowlist requires exact non-empty unique package and advisory entries", () => {
  const invalidAllowlists = [
    {},
    [null],
    [{ ...allowlist[0], package: "" }],
    [{ ...allowlist[0], id: " GHSA-vfj7-8cjw-p6xm" }],
    [{ ...allowlist[0], reason: "  " }],
    [allowlist[0], { ...allowlist[0], reason: "duplicate" }],
  ];
  for (const invalid of invalidAllowlists) {
    assert.throws(() => auditFindings(report, invalid, "2026-10-10"), /invalid audit allowlist/);
  }
});

test("an exception never covers the same advisory on a different package", () => {
  const moved = { vulnerabilities: { other: { name: "other", severity: "critical", via: [advisory("other", "GHSA-vfj7-8cjw-p6xm", "critical")] } } };
  assert.deepEqual(auditFindings(moved, allowlist, "2026-10-10").blocking, ["other GHSA-vfj7-8cjw-p6xm (critical)"]);
});

test("a production audit blocks moderate advisories without exceptions", () => {
  const productionAllowlist = [
    ...allowlist,
    { id: "GHSA-xxxx-moderate", package: "left-pad", reason: "must not apply to runtime", expires: "2026-12-31" },
  ];
  const { blocking, excepted } = auditFindings(report, productionAllowlist, "2026-10-10", {
    minimumSeverity: "moderate",
    allowExceptions: false,
  });

  assert.deepEqual(blocking, [
    "braces GHSA-vfj7-8cjw-p6xm (high)",
    "next GHSA-3w37-wq28-93x7 (high)",
    "left-pad GHSA-xxxx-moderate (moderate)",
  ]);
  assert.deepEqual(excepted, []);
});

test("a full audit keeps moderate development findings non-blocking", () => {
  const { blocking } = auditFindings(report, allowlist, "2026-10-10", {
    minimumSeverity: "high",
    allowExceptions: true,
  });

  assert.equal(blocking.some((finding) => finding.includes("GHSA-xxxx-moderate")), false);
});

test("a clean report passes", () => {
  assert.deepEqual(auditFindings({ vulnerabilities: {} }, allowlist, "2026-10-10"), { blocking: [], excepted: [] });
});

test("audit JSON accepts the local Safe-chain informational suffix", () => {
  const output = `${JSON.stringify(report)}\nℹ Safe-chain: Some package versions were suppressed.\n  To disable this check, use the documented override.\n`;
  assert.deepEqual(parseAuditReport(output), report);
});

test("audit JSON rejects unrecognized trailing output", () => {
  assert.throws(() => parseAuditReport(`${JSON.stringify(report)}\nunexpected output\n`), SyntaxError);
});

test("an npm audit transport error fails closed", () => {
  const failedAudit = { error: { code: "EAUDITENDPOINT", summary: "audit endpoint returned an error" } };
  assert.throws(
    () => auditFindings(failedAudit, allowlist, "2026-10-10"),
    /npm audit did not return vulnerability data/,
  );
});

test("an audit mode must be explicit", () => {
  assert.throws(() => resolveAuditMode(), /usage: audit-gate\.mjs \[full\|production\]/);
  assert.equal(resolveAuditMode("production").minimumSeverity, "moderate");
});

test("CI applies both audit policies to every npm root and isolates attestation permissions", () => {
  const workflow = readFileSync(new URL("../workflows/ci.yml", import.meta.url), "utf8");
  assert.equal(workflow.match(/node \.\.\/\.github\/scripts\/audit-gate\.mjs production/g)?.length, 2);
  assert.equal(workflow.match(/node \.\.\/\.github\/scripts\/audit-gate\.mjs full/g)?.length, 2);
  assert.equal(workflow.match(/node \.\.\/\.\.\/\.github\/scripts\/audit-gate\.mjs production/g)?.length, 1);
  assert.equal(workflow.match(/node \.\.\/\.\.\/\.github\/scripts\/audit-gate\.mjs full/g)?.length, 1);
  assert.match(workflow, /github\.repository == 'Northglass-Labs\/autohunter'/);
  assert.match(
    workflow,
    /- name: Verify checks did not modify tracked Worker files\n\s+run: \|\n\s+git diff --exit-code -- \.\n\s+git diff --cached --exit-code -- \./,
  );
  assert.match(workflow, /xargs -0 sha256sum --/);
  assert.match(workflow, /uses: actions\/download-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /subject-path: \$\{\{ runner\.temp \}\}\/ebay-account-deletion-worker\.tar\.gz/);
});
