import Link from "next/link";
import { verifyActionToken } from "@/lib/action-token";
import { getCoreEnv } from "@/lib/env";
import { getListing } from "@/lib/dal";
import { INSTANCE_CONFIG } from "@/lib/instance-config";

export const dynamic = "force-dynamic";

export default async function ActionPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  let payload;
  try {
    payload = verifyActionToken(token, getCoreEnv().ACTION_SIGNING_SECRET);
  } catch {
    return <Message title="This link is no longer valid" body={`Open a newer ${INSTANCE_CONFIG.appName} email or use the dashboard.`} />;
  }
  const listing = await getListing(payload.recipientId, payload.listingId);
  if (!listing) return <Message title="That car is no longer available" body="It may have been removed from the source listing." />;
  const verb = payload.action === "interested" ? "save as Interested" : "ignore";
  return (
    <main className="center-shell">
      <section className="confirm-card">
        <p className="eyebrow">Confirm action</p>
        <h1>{payload.action === "interested" ? "Save this one?" : "Hide this one?"}</h1>
        <p className="confirm-title">{listing.title}</p>
        <p className="muted">This confirmation prevents email-security scanners from changing your list automatically.</p>
        <form method="post" action="/api/action">
          <input type="hidden" name="token" value={token} />
          <button className={payload.action === "interested" ? "button primary" : "button secondary"} type="submit">
            Yes, {verb}
          </button>
        </form>
        <Link href="/" className="text-link">Cancel</Link>
      </section>
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return <main className="center-shell"><section className="confirm-card"><h1>{title}</h1><p className="muted">{body}</p></section></main>;
}
