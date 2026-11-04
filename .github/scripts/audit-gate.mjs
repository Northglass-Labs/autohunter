#!/usr/bin/env node

// Dependency audit gate for CI. Production audits block moderate, high, and critical advisories
// without exceptions. Full audits block high and critical advisories except entries in
// .github/audit-allowlist.json: each names one advisory on one package, gives a reason, and expires.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEVERITY_RANK = new Map([
  ["info", -1],
  ["low", 0],
  ["moderate", 1],
  ["high", 2],
  ["critical", 3],
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

const AUDIT_MODES = {
  full: {
    allowExceptions: true,
    minimumSeverity: "high",
    npmArgs: ["audit", "--json"],
  },
  production: {
    allowExceptions: false,
    minimumSeverity: "moderate",
    npmArgs: ["audit", "--omit=dev", "--json"],
  },
};

export function resolveAuditMode(modeName) {
  const mode = AUDIT_MODES[modeName];
  if (!mode) throw new Error("usage: audit-gate.mjs [full|production]");
  return mode;
}

export function parseAuditReport(output) {
  try {
    return JSON.parse(output);
  } catch (error) {
    const noticeMarker = "\nℹ Safe-chain:";
    const noticeIndex = output.indexOf(noticeMarker);
    const notice = noticeIndex === -1 ? "" : output.slice(noticeIndex + 1);
    if (!/^ℹ Safe-chain: [^\r\n]+(?:\r?\n {2}[^\r\n]+)*\r?\n?$/u.test(notice)) throw error;
    return JSON.parse(output.slice(0, noticeIndex));
  }
}

function validateIsoDate(value, label) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw new Error(`invalid ${label}: expected YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`invalid ${label}: expected a real calendar date`);
  }
  return value;
}

function validateAuditAllowlist(allowlist) {
  if (!Array.isArray(allowlist)) throw new Error("invalid audit allowlist: expected an array");
  const seen = new Set();
  for (const [index, entry] of allowlist.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`invalid audit allowlist entry ${index}: expected an object`);
    }
    for (const field of ["package", "id", "reason"]) {
      if (typeof entry[field] !== "string" || !entry[field] || entry[field].trim() !== entry[field]) {
        throw new Error(`invalid audit allowlist entry ${index}: ${field} must be an exact non-empty string`);
      }
    }
    validateIsoDate(entry.expires, "audit exception expiry");
    const key = JSON.stringify([entry.package, entry.id]);
    if (seen.has(key)) {
      throw new Error(`invalid audit allowlist: duplicate package and advisory at entry ${index}`);
    }
    seen.add(key);
  }
  return allowlist;
}

function severityRank(value, context) {
  const rank = SEVERITY_RANK.get(value);
  if (rank === undefined) {
    throw new Error(`unsupported npm audit severity for ${context}: ${String(value)}`);
  }
  return rank;
}

function directAdvisoryId(advisory, packageName) {
  if (typeof advisory.url === "string" && advisory.url && advisory.url.trim() === advisory.url) {
    try {
      const pathname = new URL(advisory.url).pathname;
      const candidate = pathname.split("/").filter(Boolean).at(-1);
      if (
        candidate &&
        candidate !== "undefined" &&
        candidate !== "null" &&
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(candidate)
      ) {
        return candidate;
      }
    } catch {
      // Fall back to npm's numeric advisory source below.
    }
  }
  if (Number.isSafeInteger(advisory.source) && advisory.source > 0) return String(advisory.source);
  throw new Error(`npm audit direct advisory for ${packageName} has no stable identifier`);
}

function validateAuditGraph(vulnerabilities) {
  const claimedRanks = new Map();
  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (
      !vulnerability ||
      typeof vulnerability !== "object" ||
      Array.isArray(vulnerability) ||
      vulnerability.name !== name ||
      !Array.isArray(vulnerability.via) ||
      vulnerability.via.length === 0
    ) {
      throw new Error(`malformed npm audit graph for ${name}`);
    }
    claimedRanks.set(name, severityRank(vulnerability.severity, name));
    for (const via of vulnerability.via) {
      if (typeof via === "string") {
        if (!via || via.trim() !== via) throw new Error(`malformed npm audit graph reference for ${name}`);
        continue;
      }
      if (!via || typeof via !== "object" || Array.isArray(via)) {
        throw new Error(`malformed npm audit graph advisory for ${name}`);
      }
      severityRank(via.severity, name);
      directAdvisoryId(via, name);
    }
  }

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    const viaRanks = vulnerability.via.map((via) => {
      if (typeof via !== "string") return severityRank(via.severity, name);
      const referencedRank = claimedRanks.get(via);
      if (referencedRank === undefined) {
        throw new Error(`malformed npm audit graph: ${name} references missing package ${via}`);
      }
      return referencedRank;
    });
    if (claimedRanks.get(name) !== Math.max(...viaRanks)) {
      throw new Error(`malformed npm audit graph: ${name} severity does not match its via entries`);
    }
  }

  function reachesDirectAdvisory(name, visiting) {
    const vulnerability = vulnerabilities[name];
    if (vulnerability.via.some((via) => typeof via !== "string")) return true;
    if (visiting.has(name)) return false;
    const next = new Set(visiting);
    next.add(name);
    return vulnerability.via.some((via) => reachesDirectAdvisory(via, next));
  }

  for (const name of Object.keys(vulnerabilities)) {
    if (!reachesDirectAdvisory(name, new Set())) {
      throw new Error(`malformed npm audit graph: ${name} does not reach a direct advisory`);
    }
  }
}

export function auditFindings(
  report,
  allowlist,
  today,
  { minimumSeverity = "high", allowExceptions = true } = {},
) {
  if (
    !report ||
    typeof report !== "object" ||
    Array.isArray(report) ||
    report.error ||
    !report.vulnerabilities ||
    typeof report.vulnerabilities !== "object" ||
    Array.isArray(report.vulnerabilities)
  ) {
    throw new Error("npm audit did not return vulnerability data");
  }

  const minimumRank = SEVERITY_RANK.get(minimumSeverity);
  if (minimumRank === undefined) throw new Error(`unsupported minimum audit severity: ${minimumSeverity}`);
  validateIsoDate(today, "audit date");
  const validatedAllowlist = validateAuditAllowlist(allowlist);
  validateAuditGraph(report.vulnerabilities);

  const blocking = [];
  const excepted = [];
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via) {
      // String entries point at another vulnerable package, which is reported on its own.
      if (typeof via === "string") continue;
      if (severityRank(via.severity, name) < minimumRank) continue;
      const id = directAdvisoryId(via, name);
      const finding = `${name} ${id} (${via.severity})`;
      const exception = allowExceptions
        ? validatedAllowlist.find((entry) => entry.id === id && entry.package === name && today <= entry.expires)
        : undefined;
      if (exception) excepted.push(`${finding} until ${exception.expires}: ${exception.reason}`);
      else blocking.push(finding);
    }
  }
  return { blocking, excepted };
}

function main() {
  const modeName = process.argv[2];
  let mode;
  try {
    mode = resolveAuditMode(modeName);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  const allowlistPath = fileURLToPath(new URL("../audit-allowlist.json", import.meta.url));
  const { advisories } = JSON.parse(readFileSync(allowlistPath, "utf8"));
  let output;
  try {
    output = execFileSync("npm", mode.npmArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    // npm audit exits non-zero whenever it reports a vulnerability; the JSON is still on stdout.
    if (!error.stdout) throw error;
    output = error.stdout;
  }
  const { blocking, excepted } = auditFindings(
    parseAuditReport(output),
    advisories,
    new Date().toISOString().slice(0, 10),
    mode,
  );
  for (const line of excepted) console.log(`excepted: ${line}`);
  if (blocking.length) {
    for (const line of blocking) console.error(`blocking: ${line}`);
    process.exitCode = 1;
  } else {
    console.log(`audit gate (${modeName}): no blocking advisories at ${mode.minimumSeverity} or higher`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
