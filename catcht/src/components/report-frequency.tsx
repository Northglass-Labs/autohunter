"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateReportSettingsAction, type ReportSettingsState } from "@/app/actions";
import { REPORT_FREQUENCIES, type ReportFrequency } from "@/lib/report-settings";

const initialState: ReportSettingsState = { ok: false, message: null };

export function ReportFrequencyForm({ current }: { current: ReportFrequency }) {
  const [state, formAction, pending] = useActionState(updateReportSettingsAction, initialState);
  return (
    <form action={formAction} className="report-settings">
      <fieldset role="radiogroup" aria-label="Email me a report">
        <legend>Email me a report</legend>
        <div className="report-frequency-options">
          {REPORT_FREQUENCIES.map((option) => (
            <label key={option.value}>
              <input type="radio" name="frequency" value={option.value} defaultChecked={option.value === current} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p>A report goes out only when something new clears one of your searches. A quiet week sends a short check-in instead. <Link href="/guides/how-it-works">How AutoHunter works</Link></p>
      <button className="button primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save report settings"}</button>
      {state.message ? <p className={`form-message ${state.ok ? "success" : "error"}`} role="status">{state.message}</p> : null}
    </form>
  );
}
