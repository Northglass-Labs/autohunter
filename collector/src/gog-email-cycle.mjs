#!/usr/bin/env node

import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runEmailAlertAdapter } from "./adapters/email-alert.mjs";
import { readBoundedJson, validatedAppOrigin } from "./app-client.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_QUERY = 'label:"AutoHunter/Lease Inputs" newer_than:45d';
const KEYCHAIN_SERVICE = "GOG_KEYRING_PASSWORD";
const KEYCHAIN_ACCOUNT = "hermes-agent";

export function approvedGogPath(home = userInfo().homedir) {
  if (typeof home !== "string" || !isAbsolute(home) || /[\0\r\n]/.test(home)) {
    throw new Error("GOG executable home is invalid");
  }
  return join(home, ".local", "bin", "gog-autohunter-0.34.0");
}

export function buildGogArguments(query = DEFAULT_QUERY) {
  if (typeof query !== "string" || !query.trim() || query.length > 500) throw new Error("Gmail query is invalid");
  return [
    "gmail",
    "messages",
    "search",
    "--account",
    "auto",
    "--readonly",
    "--gmail-no-send",
    "--json",
    "--results-only",
    "--max=50",
    "--include-body",
    "--body-format=text",
    "--full",
    "--timezone",
    "UTC",
    query.trim(),
  ];
}

export async function runGogEmailCycle({
  appUrl = process.env.AUTOHUNTER_APP_URL ?? process.env.CAR_HUNT_APP_URL ?? process.env.CATCHT_APP_URL,
  ingestSecret = process.env.AUTOHUNTER_INGEST_SECRET ?? process.env.CAR_HUNT_INGEST_SECRET ?? process.env.CATCHT_INGEST_SECRET,
  query = process.env.AUTOHUNTER_GMAIL_QUERY ?? process.env.CAR_HUNT_GMAIL_QUERY ?? DEFAULT_QUERY,
  fetchImpl = fetch,
  execFileImpl = execFileAsync,
} = {}) {
  const origin = validatedAppOrigin(appUrl);
  if (typeof ingestSecret !== "string" || ingestSecret.length < 16 || ingestSecret.length > 4_096) {
    throw new Error("AutoHunter ingest credentials are unavailable");
  }
  const startedAt = new Date().toISOString();
  let stage = "collector_config";
  let runReported = false;
  try {
    const searches = await remoteSearches(origin, ingestSecret, fetchImpl);
    stage = "gmail_retrieval";
    const messages = await readGogMessages(query, execFileImpl);
    stage = "ingest";
    const result = await runEmailAlertAdapter({ messages, searches });
    let accepted = 0;
    if (result.offers.length === 0) {
      accepted += await ingest(origin, ingestSecret, { candidates: [], sourceRuns: [result.run] }, fetchImpl);
      runReported = true;
    } else {
      for (let index = 0; index < result.offers.length; index += 50) {
        accepted += await ingest(origin, ingestSecret, {
          candidates: result.offers.slice(index, index + 50),
          sourceRuns: index === 0 ? [result.run] : [],
        }, fetchImpl);
        runReported = true;
      }
    }
    return { messages: messages.length, accepted, status: result.run.status };
  } catch (error) {
    if (!runReported) await reportFailedRun(origin, ingestSecret, startedAt, stage, fetchImpl);
    throw error;
  }
}

async function reportFailedRun(origin, secret, startedAt, stage, fetchImpl) {
  try {
    await ingest(origin, secret, {
      candidates: [],
      sourceRuns: [{
        adapter: "gog-authorized-email-v1",
        source: "email_alert",
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        searchedCount: 0,
        discoveredCount: 0,
        acceptedCount: 0,
        messageCode: `${stage}_failed`,
      }],
    }, fetchImpl);
  } catch {
    // Best-effort visibility only: the original cycle error must stay primary.
  }
}

async function readGogMessages(query, execFileImpl) {
  let keyringPassword = "";
  try {
    ({ stdout: keyringPassword } = await execFileImpl(
      "/usr/bin/security",
      ["find-generic-password", "-w", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT],
      { encoding: "utf8", env: { PATH: "/usr/bin:/bin" }, maxBuffer: 16_384, timeout: 15_000 },
    ));
    keyringPassword = keyringPassword.trim();
    if (!keyringPassword || keyringPassword.length > 4_096 || /[\r\n]/.test(keyringPassword)) {
      throw new Error("GOG Keychain credential is invalid");
    }
    const childEnvironment = {
      HOME: userInfo().homedir,
      PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      GOG_KEYRING_PASSWORD: keyringPassword,
      GOG_TIMEZONE: "UTC",
      OP_BIOMETRIC_UNLOCK_ENABLED: "false",
    };
    let stdout;
    try {
      ({ stdout } = await execFileImpl(approvedGogPath(), buildGogArguments(query), {
        encoding: "utf8",
        env: childEnvironment,
        maxBuffer: 8 * 1024 * 1024,
        timeout: 60_000,
      }));
    } finally {
      childEnvironment.GOG_KEYRING_PASSWORD = "";
      delete childEnvironment.GOG_KEYRING_PASSWORD;
    }
    return validatedMessages(JSON.parse(stdout));
  } catch {
    throw new Error("Authorized Gmail alert retrieval failed");
  } finally {
    keyringPassword = "";
  }
}

function validatedMessages(value) {
  if (!Array.isArray(value) || value.length > 50) throw new Error("Gmail response is invalid");
  return value.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Gmail message is invalid");
    const result = {
      id: boundedText(message.id, 200),
      threadId: boundedText(message.threadId, 200),
      date: boundedText(message.date, 100),
      from: boundedText(message.from, 300),
      subject: boundedText(message.subject, 300),
      body: boundedText(message.body, 100_000),
    };
    if (!result.id || !result.subject || !result.body) throw new Error("Gmail message is incomplete");
    return result;
  });
}

async function remoteSearches(origin, secret, fetchImpl) {
  const response = await fetchImpl(`${origin}/api/collector/config`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Collector config returned HTTP ${response.status}`);
  const payload = await readBoundedJson(response);
  if (payload?.version !== 2 || !Array.isArray(payload.searches)) throw new Error("Collector config is invalid");
  return payload.searches;
}

async function ingest(origin, secret, payload, fetchImpl) {
  const response = await fetchImpl(`${origin}/api/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Ingest returned HTTP ${response.status}`);
  const result = await readBoundedJson(response);
  if (result.accepted !== payload.candidates.length) throw new Error("Ingest did not accept the complete email batch");
  return result.accepted;
}

function boundedText(value, maximum) {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

async function main() {
  const result = await runGogEmailCycle();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`autohunter email import: ${error instanceof Error ? error.message : "failed"}\n`);
    process.exitCode = 1;
  });
}
