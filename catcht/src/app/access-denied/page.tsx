import { INSTANCE_CONFIG } from "@/lib/instance-config";

export default function AccessDenied() {
  return <main className="center-shell"><section className="confirm-card"><p className="eyebrow">Private decision desk</p><h1>Use your {INSTANCE_CONFIG.appName} email link</h1><p className="muted">AutoHunter is invite-only. Request a fresh magic link from its sign-in screen.</p></section></main>;
}
