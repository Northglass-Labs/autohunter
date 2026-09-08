"use client";

import { useActionState, useState } from "react";
import { addSavedSearchAction, setSavedSearchActiveAction, type AddSavedSearchState } from "@/app/actions";
import type { SavedSearch } from "@/lib/dal";
import Link from "next/link";
import { sClassPreset } from "@/lib/search-presets";
import { BODY_STYLES, VEHICLE_FEATURE_KEYS, VEHICLE_FEATURE_LABELS } from "@/lib/vehicle-features";
import type { VehicleFeatureKey } from "@/lib/types";

const initialState: AddSavedSearchState = { ok: false, message: null };

interface SavedSearchPanelProps {
  searches: SavedSearch[];
}

export function SavedSearchPanel({ searches }: SavedSearchPanelProps) {
  const [offerKind, setOfferKind] = useState<SavedSearch["offerKind"]>("used");
  const [garageGroup, setGarageGroup] = useState<SavedSearch["garageGroup"]>("other");
  const [preset, setPreset] = useState<ReturnType<typeof sClassPreset> | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [desired, setDesired] = useState<VehicleFeatureKey[]>([]);
  const [required, setRequired] = useState<VehicleFeatureKey[]>([]);
  const [state, formAction, pending] = useActionState(addSavedSearchAction, initialState);
  const isLease = offerKind === "lease";
  const existingLocation = searches.find((search) => search.offerKind === "used" && search.active && search.zip);
  function applyPreset(variant: "560" | "450" | "580") {
    const next = sClassPreset(variant);
    setPreset(next);
    setDesired(next.desiredFeatures ?? []);
    setRequired([]);
    setOfferKind("used");
    setGarageGroup("gas");
    setFormVersion((version) => version + 1);
  }

  return (
    <section className="search-studio" id="search-studio">
      <div className="search-studio-copy">
        <p className="eyebrow">Your search briefs</p>
        <h2>Saved searches</h2>
        <p>
          Describe the exact car or lease you want once. AutoHunter normalizes matching offers from
          every enabled source, remembers your decisions, and only resurfaces meaningful changes.
        </p>
        <div className="search-presets" aria-label="Search presets">
          <strong>S-Class under $40k</strong>
          <p>2018–2020 S560/S450 or 2021–2025 S580 sedans. Options stay on the checklist until there is evidence.</p>
          <div><button type="button" onClick={() => applyPreset("560")}>Use S560 preset</button><button type="button" onClick={() => applyPreset("580")}>Use S580 preset</button><button type="button" onClick={() => applyPreset("450")}>Use S450 preset</button></div>
          <Link href="/guides/w222">S-Class buying guide</Link>
        </div>
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

      <form key={formVersion} action={formAction} className="search-form">
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
          <label className="span-2">Search name<input name="name" required maxLength={120} placeholder="Manual weekend car" defaultValue={preset?.name} /></label>
          <label>Make<input name="make" required maxLength={100} placeholder="Mazda" defaultValue={preset?.make} /></label>
          <label>Model<input name="model" required maxLength={150} placeholder="MX-5 Miata" defaultValue={preset?.model} /></label>
          <label>Trim, optional<input name="trim" maxLength={150} placeholder="Club" defaultValue={preset?.trim ?? ""} /></label>
          <label>Body style<select name="bodyStyle" aria-label="Body style" defaultValue={preset?.bodyStyle ?? ""}><option value="">Any body style</option>{BODY_STYLES.map((style) => <option key={style} value={style}>{style === "suv" ? "SUV" : style[0].toUpperCase() + style.slice(1)}</option>)}</select></label>
          <label>
            Transmission
            <select name="transmission" defaultValue={preset?.transmission ?? "any"}>
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
            <select name="profile" defaultValue={preset?.profile ?? "general"}>
              <option value="family_ev">Family EV</option>
              <option value="family_gas">Family gas</option>
              <option value="lease">Lease</option>
              <option value="enthusiast">Enthusiast</option>
              <option value="general">General</option>
            </select>
          </label>
          <label>
            Powertrain
            <select name="powertrainCategory" defaultValue={preset?.powertrainCategory ?? "any"}>
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
              <label>ZIP code<input name="zip" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} placeholder="10001" defaultValue={preset ? existingLocation?.zip ?? "" : ""} /></label>
              <label>Radius in miles<input name="radiusMiles" required inputMode="numeric" placeholder="150" defaultValue={preset ? existingLocation?.radiusMiles ?? preset.radiusMiles ?? "" : ""} /></label>
              <label>Max price<input name="maxPrice" inputMode="numeric" placeholder="25000" defaultValue={preset?.maxPrice ?? ""} /></label>
              <label>Target price<input name="targetPrice" inputMode="numeric" placeholder="22000" defaultValue={preset?.targetPrice ?? ""} /></label>
              <label>Max mileage<input name="maxMileage" inputMode="numeric" placeholder={offerKind === "new" ? "500" : "100000"} defaultValue={preset?.maxMileage ?? ""} /></label>
              <label>Minimum model year<input name="yearMin" inputMode="numeric" placeholder="2018" defaultValue={preset?.yearMin ?? ""} /></label>
              <label>Maximum model year<input name="yearMax" inputMode="numeric" placeholder="2026" defaultValue={preset?.yearMax ?? ""} /></label>
            </>
          )}
          <FeaturePicker name="desiredFeatures" legend="Equipment you want" selected={desired} onChange={setDesired} />
          <details className="span-2 required-features"><summary>Require equipment to appear in results</summary><p>Only offers with confirmed or expected evidence qualify. Leave this empty to discover cars whose listings still need a build sheet.</p><FeaturePicker name="requiredFeatures" legend="Required equipment" selected={required} onChange={setRequired} /></details>
          <label className="span-2">Why it belongs<textarea name="rationale" maxLength={500} placeholder="Family utility, highway tech, driving character, and value thesis." defaultValue={preset?.rationale ?? ""} /></label>
          <label>Priority (0–100)<input name="priority" inputMode="numeric" placeholder="80" defaultValue={preset?.priority ?? ""} /></label>
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
    search.bodyStyle,
    search.yearMin || search.yearMax ? `${search.yearMin ?? "any"}–${search.yearMax ?? "new"}` : null,
    search.zip && search.radiusMiles ? `${search.radiusMiles} mi from ${search.zip}` : null,
    search.targetPrice ? `target $${search.targetPrice.toLocaleString()}` : null,
    search.maxPrice ? `≤ $${search.maxPrice.toLocaleString()}` : null,
    search.maxMileage !== null ? `≤ ${search.maxMileage.toLocaleString()} mi` : null,
    search.transmission !== "any" ? search.transmission : null,
  ].filter(Boolean).join(" · ");
}

function FeaturePicker({ name, legend, selected, onChange }: { name: string; legend: string; selected: VehicleFeatureKey[]; onChange: (values: VehicleFeatureKey[]) => void }) {
  return <fieldset className="feature-picker span-2">
    <legend>{legend}</legend>
    <input type="hidden" name={name} value={selected.join(",")} />
    <div>{VEHICLE_FEATURE_KEYS.map((key) => <label key={key}>
      <input type="checkbox" checked={selected.includes(key)} aria-label={`${name === "requiredFeatures" ? "Require " : ""}${VEHICLE_FEATURE_LABELS[key]}`}
        onChange={(event) => onChange(event.target.checked ? [...selected, key] : selected.filter((value) => value !== key))} />
      <span>{VEHICLE_FEATURE_LABELS[key]}</span>
    </label>)}</div>
  </fieldset>;
}

function laneLabel(group: SavedSearch["garageGroup"]) {
  if (group === "ev") return "EV";
  if (group === "gas") return "Gas + hybrid";
  if (group === "lease") return "Lease";
  if (group === "enthusiast") return "Enthusiast";
  return "Other";
}
