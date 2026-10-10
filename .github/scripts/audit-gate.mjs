#!/usr/bin/env node

// Full dependency audit for CI. Every high or critical advisory blocks, except entries in
// .github/audit-allowlist.json: each names one advisory on one package, gives a reason, and
// expires. CI runs `npm audit --omit=dev` first with no exceptions, so only development
// dependencies can ever be excepted here.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

export function auditFindings(report, allowlist, today) {
  const blocking = [];
  const excepted = [];
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      // String entries point at another vulnerable package, which is reported on its own.
      if (typeof via !== "object" || !BLOCKING_SEVERITIES.has(via.severity)) continue;
      const id = String(via.url ?? via.source).split("/").pop();
      const finding = `${name} ${id} (${via.severity})`;
      const exception = allowlist.find((entry) => entry.id === id && entry.package === name && today <= entry.expires);
      if (exception) excepted.push(`${finding} until ${exception.expires}: ${exception.reason}`);
      else blocking.push(finding);
    }
  }
  return { blocking, excepted };
}

function main() {
  const allowlistPath = fileURLToPath(new URL("../audit-allowlist.json", import.meta.url));
  const { advisories } = JSON.parse(readFileSync(allowlistPath, "utf8"));
  let output;
  try {
    output = execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    // npm audit exits non-zero whenever it reports a vulnerability; the JSON is still on stdout.
    if (!error.stdout) throw error;
    output = error.stdout;
  }
  const { blocking, excepted } = auditFindings(JSON.parse(output), advisories, new Date().toISOString().slice(0, 10));
  for (const line of excepted) console.log(`excepted: ${line}`);
  if (blocking.length) {
    for (const line of blocking) console.error(`blocking: ${line}`);
    process.exitCode = 1;
  } else {
    console.log("audit gate: no blocking high or critical advisories");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
