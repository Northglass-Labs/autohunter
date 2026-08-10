"use client";

import { useActionState } from "react";
import {
  inviteUserAction,
  setSavedSearchOwnerAction,
  type InviteUserState,
} from "@/app/actions";
import type { SavedSearch, UserProfile } from "@/lib/dal";

const initialState: InviteUserState = { ok: false, message: null };

export function TeamPanel({ people, searches }: { people: UserProfile[]; searches: SavedSearch[] }) {
  const [state, formAction, pending] = useActionState(inviteUserAction, initialState);

  return (
    <section className="team-panel" id="team">
      <div className="team-intro">
        <p className="eyebrow">Private by design</p>
        <h2>Household access</h2>
        <p>
          Each driver gets a separate review queue, search set, and digest. Shared inventory stays
          canonical, while Interested and Pass remain personal.
        </p>
        <div className="people-list" aria-label="Household members">
          {people.map((person) => (
            <article className="person-row" key={person.id}>
              <span className="person-avatar" aria-hidden="true">{initials(person.displayName)}</span>
              <span>
                <strong>{person.displayName}</strong>
                <small>{person.email ?? "Email not assigned"}</small>
              </span>
              <span className={`access-state ${person.authUserId ? "claimed" : "pending"}`}>
                {person.authUserId ? "Signed in before" : "Invite pending"}
              </span>
            </article>
          ))}
        </div>
      </div>

      <div className="team-controls">
        <form action={formAction} className="invite-form">
          <div>
            <p className="eyebrow">Invite a driver</p>
            <h3>Add private access</h3>
          </div>
          <label>
            Name
            <input name="displayName" required maxLength={100} placeholder="Member" />
          </label>
          <label>
            Email
            <input name="email" required type="email" autoComplete="email" placeholder="driver@example.com" />
          </label>
          <button className="button primary" type="submit" disabled={pending}>
            {pending ? "Adding…" : "Allow magic-link access"}
          </button>
          {state.message ? <p className={`form-message ${state.ok ? "success" : "error"}`} role="status">{state.message}</p> : null}
        </form>

        <div className="search-owners">
          <div>
            <p className="eyebrow">Queue ownership</p>
            <h3>Move searches between queues</h3>
          </div>
          <div className="search-owner-list">
            {searches.map((search) => (
              <form action={setSavedSearchOwnerAction} className="search-owner-row" key={search.id}>
                <input type="hidden" name="searchId" value={search.id} />
                <span>
                  <strong>{search.name}</strong>
                  <small>{search.make} {search.model} · {search.offerKind}</small>
                </span>
                <label>
                  <span className="sr-only">Owner for {search.name}</span>
                  <select name="ownerId" defaultValue={search.ownerId}>
                    {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
                  </select>
                </label>
                <button className="small-button" type="submit">Assign</button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}
