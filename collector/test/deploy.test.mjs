import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("scheduler templates collect daily while the app owns the digest cooldown", async () => {
  const [launchd, systemd, github, ci] = await Promise.all([
    readFile(new URL("../deploy/launchd/io.northglass.autohunter.collector.plist.example", import.meta.url), "utf8"),
    readFile(new URL("../deploy/systemd/autohunter-collector.timer.example", import.meta.url), "utf8"),
    readFile(new URL("../../.github/workflows/collector.yml", import.meta.url), "utf8"),
    readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
  ]);

  assert.match(launchd, /<key>StartInterval<\/key>\s*<integer>86400<\/integer>/);
  assert.doesNotMatch(launchd, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(launchd, /<string>platform:cycle<\/string>/);
  assert.match(systemd, /^OnUnitActiveSec=24h$/m);

  assert.match(github, /^\s*schedule:\s*$/m);
  assert.match(github, /^\s*- cron: ["']17 10 \* \* \*["']\s*$/m);
  assert.match(github, /^\s*workflow_dispatch:\s*$/m);
  assert.match(github, /collection_only:\s*\n\s+description:.*\n\s+type: boolean\s*\n\s+default: true/);
  assert.match(github, /- run: npm run platform:collect\s*\n\s+if:.*github\.event_name == 'workflow_dispatch'.*inputs\.collection_only/);
  assert.match(github, /- run: npm run platform:cycle\s*\n\s+if:.*github\.event_name == 'schedule'.*!inputs\.collection_only/);
  assert.match(github, /^permissions:\s*\n\s+contents: read\s*$/m);
  assert.match(github, /^\s+timeout-minutes: 15\s*$/m);
  assert.match(github, /uses: actions\/checkout@[0-9a-f]{40}/);
  assert.match(github, /uses: actions\/setup-node@[0-9a-f]{40}/);
  assert.match(github, /^\s+persist-credentials: false\s*$/m);
  assert.match(github, /^\s+- run: npm ci --ignore-scripts\s*$/m);
  assert.match(github, /^\s+- run: npm run platform:cycle\s*$/m);

  for (const name of [
    "AUTOHUNTER_APP_URL",
    "AUTOHUNTER_INGEST_SECRET",
    "AUTOHUNTER_CRON_SECRET",
    "MARKETCHECK_API_KEY",
  ]) {
    assert.match(
      github,
      new RegExp(`^\\s+${name}: \\$\\{\\{ secrets\\.${name} \\}\\}\\s*$`, "m"),
    );
  }
  assert.ok(github.indexOf("npm ci --ignore-scripts") < github.indexOf("AUTOHUNTER_APP_URL:"));
  assert.doesNotMatch(github, /(?:printenv|env\s*$|set -x|--body)/m);

  for (const workflow of [github, ci]) {
    assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/);
    assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\.0\.0/);
  }
});
