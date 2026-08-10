import "server-only";
import { Resend } from "resend";
import type { ListingCard, SourceHealth, UserProfile } from "./dal";
import { getCoreEnv, requireEnv } from "./env";
import { renderDigestEmail } from "./email-template";
import { INSTANCE_CONFIG } from "./instance-config";
import { SEARCH_POLICY } from "./search-policy";

let resend: Resend | null = null;

function getResend() {
  if (!resend) resend = new Resend(requireEnv("RESEND_API_KEY"));
  return resend;
}

export async function sendDigest(
  recipient: UserProfile,
  listings: ListingCard[],
  scheduledFor: string,
  sourceHealth: SourceHealth[],
) {
  const env = getCoreEnv();
  if (!recipient.email) throw new Error("digest recipient has no email");
  const from = requireEnv("EMAIL_FROM");
  const message = renderDigestEmail(listings, scheduledFor, {
    appUrl: env.APP_URL,
    recipientId: recipient.id,
    actionSecret: env.ACTION_SIGNING_SECRET,
    brandName: INSTANCE_CONFIG.appName,
    maxPrice: SEARCH_POLICY.maxPrice,
  }, sourceHealth);
  const { data, error } = await getResend().emails.send(
    { from, to: recipient.email, subject: message.subject, html: message.html, text: message.text },
    { idempotencyKey: `catcht-digest-${recipient.id}-${scheduledFor}` },
  );
  if (error || !data?.id) throw new Error(error?.message ?? "email provider returned no message id");
  return data.id;
}
