import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { AutoHunterLockup } from "@/components/autohunter-brand";
import { INSTANCE_CONFIG } from "@/lib/instance-config";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");

  return (
    <main className="login-shell">
      <section className="login-brand" aria-label="AutoHunter introduction">
        <div className="wordmark"><AutoHunterLockup /></div>
        <div>
          <p className="eyebrow">Private household intelligence</p>
          <h1>The family car search, without the noise.</h1>
          <p>Used inventory, OEM lease programs, signed benchmarks, and package evidence—normalized into one private decision queue.</p>
        </div>
        <ul className="login-proof" aria-label="AutoHunter benefits">
          <li><strong>Source-backed</strong><span>Original photos, links, and visible source health</span></li>
          <li><strong>Equipment-aware</strong><span>Confirmed, expected, and unknown never blur together</span></li>
          <li><strong>Household-private</strong><span>Each person gets separate searches and decisions</span></li>
        </ul>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Welcome back</p>
          <h2>Open your decision desk.</h2>
          <p>Use an invited email address. AutoHunter sends a single-use sign-in link—no password required.</p>
          <LoginForm />
          <small>Magic links are single-use. AutoHunter never exposes its private inventory database to the browser.</small>
          <span className="login-endorsement">{INSTANCE_CONFIG.endorsement}</span>
        </div>
      </section>
    </main>
  );
}
