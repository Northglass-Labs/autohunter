"use client";

import { useActionState } from "react";
import { requestMagicLinkAction, type MagicLinkState } from "./actions";

const initialState: MagicLinkState = { sent: false, message: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(requestMagicLinkAction, initialState);

  return (
    <form action={action} className="login-form">
      <label htmlFor="email">Email</label>
      <div className="login-control">
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </div>
      {state.message ? <p className={state.sent ? "form-message success" : "form-message error"} role="status">{state.message}</p> : null}
    </form>
  );
}
