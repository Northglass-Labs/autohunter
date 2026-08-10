import "server-only";
import {
  digestIsDue,
  failDigestRun,
  finishDigestRun,
  getDigestCandidates,
  getDigestRecipients,
  getSourceHealth,
  startDigestRun,
  type UserProfile,
} from "./dal";
import { sendDigest } from "./email";

function easternDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function runDigest() {
  const scheduledFor = easternDate();
  const recipients = await getDigestRecipients();
  const sourceHealth = await getSourceHealth();
  const results = [];
  for (const recipient of recipients) results.push(await runRecipientDigest(recipient, scheduledFor, sourceHealth));
  const sent = results.filter((result) => result.status === "sent");
  return {
    status: sent.length ? "sent" as const : "complete" as const,
    recipientCount: recipients.length,
    sentCount: sent.length,
    listingCount: sent.reduce((total, result) => total + (result.listingCount ?? 0), 0),
    results,
  };
}

async function runRecipientDigest(
  recipient: UserProfile,
  scheduledFor: string,
  sourceHealth: Awaited<ReturnType<typeof getSourceHealth>>,
) {
  if (!(await digestIsDue(recipient.id, recipient.digestCadenceHours))) {
    return { userId: recipient.id, status: "not_due" as const };
  }
  const runId = await startDigestRun(recipient.id, scheduledFor);
  if (!runId) return { userId: recipient.id, status: "already_started" as const };
  try {
    const listings = await getDigestCandidates(recipient.id);
    const messageId = await sendDigest(recipient, listings, scheduledFor, sourceHealth);
    await finishDigestRun(runId, listings, messageId, sourceHealth);
    return { userId: recipient.id, status: "sent" as const, listingCount: listings.length, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown digest error";
    await failDigestRun(runId, message);
    throw error;
  }
}
