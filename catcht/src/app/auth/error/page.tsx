import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="center-shell">
      <section className="confirm-card">
        <p className="eyebrow">Sign-in problem</p>
        <h1>That link has expired or is no longer valid.</h1>
        <p className="muted">Magic links are single-use. Request a fresh one from the private AutoHunter sign-in screen.</p>
        <Link className="button primary" href="/login">Request another link</Link>
      </section>
    </main>
  );
}
