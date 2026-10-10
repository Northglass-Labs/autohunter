import assert from "node:assert/strict";
import test from "node:test";
import { auditFindings } from "./audit-gate.mjs";

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

test("an exception never covers the same advisory on a different package", () => {
  const moved = { vulnerabilities: { other: { name: "other", severity: "critical", via: [advisory("other", "GHSA-vfj7-8cjw-p6xm", "critical")] } } };
  assert.deepEqual(auditFindings(moved, allowlist, "2026-10-10").blocking, ["other GHSA-vfj7-8cjw-p6xm (critical)"]);
});

test("a clean report passes", () => {
  assert.deepEqual(auditFindings({ vulnerabilities: {} }, allowlist, "2026-10-10"), { blocking: [], excepted: [] });
});
