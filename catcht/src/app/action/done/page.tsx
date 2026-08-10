import Link from "next/link";
import { INSTANCE_CONFIG } from "@/lib/instance-config";

export default async function DonePage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const interested = (await searchParams).action === "interested";
  return (
    <main className="center-shell"><section className="confirm-card"><p className="eyebrow">Saved</p><h1>{interested ? "Added to Interested" : "Ignored"}</h1><p className="muted">{INSTANCE_CONFIG.appName} will remember this choice in future searches.</p><Link href="/" className="button primary">Open dashboard</Link></section></main>
  );
}
