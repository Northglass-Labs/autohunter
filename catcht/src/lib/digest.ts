import "server-only";
import {
  digestIsDue,
  failDigestRun,
  finishDigestRun,
  getDigestCandidates,
  getDigestRecipients,
  getRecipientOfferKinds,
  getSourceHealth,
  lastDigestEmailDate,
  startDigestRun,
  type UserProfile,
} from "./dal";
import { sendDigest } from "./email";
import { sourcesForOfferKinds } from "./source-health-summary";

// With nothing new to report, a recipient hears from AutoHunter once a week instead of every day.
const CHECK_IN_DAYS = 7;

function easternDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export async function runDigest(now = new Date()) {
  const scheduledFor = easternDate(now);
  const recipients = await getDigestRecipients();
  const sourceHealth = await getSourceHealth();
  const results = [];
  for (const recipient of recipients) results.push(await runRecipientDigest(recipient, scheduledFor, sourceHealth));
  const sent = results.filter((result) => result.status === "sent");
  return {
    status: sent.length ? "sent" as const : "complete" as const,
    recipientCount: recipients.length,
    sentCount: sent.length,
    quietCount: results.filter((result) => result.status === "quiet").length,
    listingCount: sent.reduce((total, result) => total + (result.listingCount ?? 0), 0),
  };
}

async function runRecipientDigest(
  recipient: UserProfile,
  scheduledFor: string,
  sourceHealth: Awaited<ReturnType<typeof getSourceHealth>>,
) {
  // startDigestRun allows one report per Eastern date, which is the whole rule for daily recipients.
  // An elapsed-hours gate skipped any day whose delayed scheduled run started earlier than the last.
  if (recipient.digestCadenceHours > 24 && !(await digestIsDue(recipient.id, recipient.digestCadenceHours))) {
    return { status: "not_due" as const };
  }
  const listings = await getDigestCandidates(recipient.id);
  let lastEmailedOn: string | null = null;
  if (!listings.length) {
    lastEmailedOn = await lastDigestEmailDate(recipient.id);
    if (lastEmailedOn && daysBetween(lastEmailedOn, scheduledFor) < CHECK_IN_DAYS) return { status: "quiet" as const };
  }
  const runId = await startDigestRun(recipient.id, scheduledFor);
  if (!runId) return { status: "already_started" as const };
  try {
    const sources = sourcesForOfferKinds(sourceHealth, await getRecipientOfferKinds(recipient.id));
    const messageId = await sendDigest(recipient, listings, scheduledFor, sources, { lastEmailedOn });
    await finishDigestRun(runId, listings, messageId, sources);
    return { status: "sent" as const, listingCount: listings.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown digest error";
    await failDigestRun(runId, message);
    throw error;
  }
}
