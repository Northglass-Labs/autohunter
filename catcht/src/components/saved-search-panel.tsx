"use client";

import { useActionState, useState } from "react";
import { addSavedSearchAction, setSavedSearchActiveAction, type AddSavedSearchState } from "@/app/actions";
import type { SavedSearch } from "@/lib/dal";

const initialState: AddSavedSearchState = { ok: false, message: null };

interface SavedSearchPanelProps {
  searches: SavedSearch[];
}

export function SavedSearchPanel({ searches }: SavedSearchPanelProps) {
  const [offerKind, setOfferKind] = useState<SavedSearch["offerKind"]>("used");
  const [garageGroup, setGarageGroup] = useState<SavedSearch["garageGroup"]>("ev");
  const [state, formAction, pending] = useActionState(addSavedSearchAction, initialState);
  const isLease = offerKind === "lease";

  return (
    <section className="search-studio" id="search-studio">
      <div className="search-studio-copy">
        <p className="eyebrow">Build your radar</p>
        <h2>Saved searches</h2>
        <p>
          Describe the exact car or lease you want once. AutoHunter normalizes matching offers from
          every enabled source, remembers your decisions, and only resurfaces meaningful changes.
        </p>
        <div className="saved-search-list" aria-label="Saved searches">
          {searches.map((search) => {
            const toggle = setSavedSearchActiveAction.bind(null, search.id, !search.active);
            return (
            <article key={search.id} className={`saved-search ${search.garageGroup} ${search.active ? "" : "paused"}`}>
              <span>{laneLabel(search.garageGroup)} · {search.offerKind}</span>
              <strong>{search.name}</strong>
              <small>{search.make} {search.model}{search.trim ? ` ${search.trim}` : ""}</small>
              <small>{searchSummary(search)}</small>
              <form action={toggle}><button type="submit">{search.active ? "Pause" : "Resume"}</button></form>
            </article>
          );})}
        </div>
      </div>

      <form action={formAction} className="search-form">
        <div className="form-heading">
          <div>
            <p className="eyebrow">New target</p>
            <h3>What should join the hunt?</h3>
          </div>
          <label>
            Offer type
            <select
              name="offerKind"
              value={offerKind}
              onChange={(event) => {
                const next = event.target.value as SavedSearch["offerKind"];
                setOfferKind(next);
                if (next === "lease") setGarageGroup("lease");
              }}
            >
              <option value="used">Used</option>
              <option value="new">New</option>
              <option value="lease">Lease</option>
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label className="span-2">Search name<input name="name" required maxLength={120} placeholder="Manual weekend car" /></label>
          <label>Make<input name="make" required maxLength={100} placeholder="Mazda" /></label>
          <label>Model<input name="model" required maxLength={150} placeholder="MX-5 Miata" /></label>
          <label>Trim, optional<input name="trim" maxLength={150} placeholder="Club" /></label>
          <label>
            Transmission
            <select name="transmission" defaultValue="any">
              <option value="any">Any</option>
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </select>
          </label>
          <label>
            Queue lane
            <select name="garageGroup" value={garageGroup} onChange={(event) => setGarageGroup(event.target.value as SavedSearch["garageGroup"])}>
              <option value="ev">EV</option>
              <option value="gas">Gas + hybrid</option>
              <option value="lease">Lease</option>
              <option value="enthusiast">Enthusiast</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Search profile
            <select name="profile" defaultValue="family_ev">
              <option value="family_ev">Family EV</option>
              <option value="family_gas">Family gas</option>
              <option value="lease">Lease</option>
              <option value="enthusiast">Enthusiast</option>
              <option value="general">General</option>
            </select>
          </label>
          <label>
            Powertrain
            <select name="powertrainCategory" defaultValue="any">
              <option value="any">Any</option>
              <option value="ev">EV</option>
              <option value="gas">Gas</option>
              <option value="phev">Plug-in hybrid</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>

          {isLease ? (
            <>
              <label>Region<input name="region" required maxLength={150} placeholder="Northeast" /></label>
              <label>ZIP code<input name="zip" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} placeholder="10001" /></label>
              <label>Max effective / month<input name="maxEffectiveMonthly" inputMode="numeric" placeholder="650" /></label>
              <label>Max due at signing<input name="maxDueAtSigning" inputMode="numeric" placeholder="3000" /></label>
              <label>Minimum annual miles<input name="minAnnualMiles" inputMode="numeric" placeholder="10000" /></label>
            </>
          ) : (
            <>
              <label>ZIP code<input name="zip" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} placeholder="10001" /></label>
              <label>Radius in miles<input name="radiusMiles" required inputMode="numeric" placeholder="150" /></label>
              <label>Max price<input name="maxPrice" inputMode="numeric" placeholder="25000" /></label>
              <label>Target price<input name="targetPrice" inputMode="numeric" placeholder="55000" /></label>
              <label>Max mileage<input name="maxMileage" inputMode="numeric" placeholder={offerKind === "new" ? "500" : "100000"} /></label>
              <label>Minimum model year<input name="yearMin" inputMode="numeric" placeholder="2022" /></label>
              <label>Maximum model year<input name="yearMax" inputMode="numeric" placeholder="2026" /></label>
            </>
          )}
          <label className="span-2">Desired features<input name="desiredFeatures" placeholder="hands_free_highway, rear_axle_steering" /></label>
          <label className="span-2">Required features, optional — hides offers without confirmed or expected evidence<input name="requiredFeatures" placeholder="adaptive_cruise_lane_centering" /></label>
          <label className="span-2">Why it belongs<textarea name="rationale" maxLength={500} placeholder="Family utility, highway tech, driving character, and value thesis." /></label>
          <label>Priority (0–100)<input name="priority" inputMode="numeric" placeholder="80" /></label>
        </div>

        <button className="button primary search-submit" type="submit" disabled={pending}>
          {pending ? "Adding radar…" : "Add saved search"}
        </button>
        {state.message ? <p className={`form-message ${state.ok ? "success" : "error"}`} role="status">{state.message}</p> : null}
      </form>
    </section>
  );
}

function searchSummary(search: SavedSearch) {
  if (search.offerKind === "lease") {
    return [
      search.region,
      search.zip ? `OEM programs near ${search.zip}` : null,
      search.maxEffectiveMonthly ? `≤ $${search.maxEffectiveMonthly}/mo effective` : null,
      search.minAnnualMiles ? `${search.minAnnualMiles.toLocaleString()} mi/year` : null,
    ].filter(Boolean).join(" · ");
  }
  return [
    laneLabel(search.garageGroup),
    search.yearMin || search.yearMax ? `${search.yearMin ?? "any"}–${search.yearMax ?? "new"}` : null,
    search.zip && search.radiusMiles ? `${search.radiusMiles} mi from ${search.zip}` : null,
    search.targetPrice ? `target $${search.targetPrice.toLocaleString()}` : null,
    search.maxPrice ? `≤ $${search.maxPrice.toLocaleString()}` : null,
    search.maxMileage !== null ? `≤ ${search.maxMileage.toLocaleString()} mi` : null,
    search.transmission !== "any" ? search.transmission : null,
  ].filter(Boolean).join(" · ");
}

function laneLabel(group: SavedSearch["garageGroup"]) {
  if (group === "ev") return "EV";
  if (group === "gas") return "Gas + hybrid";
  if (group === "lease") return "Lease";
  if (group === "enthusiast") return "Enthusiast";
  return "Other";
}
