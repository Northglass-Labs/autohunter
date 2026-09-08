import type { ListingCard as Listing } from "@/lib/dal";
import { setDispositionAction } from "@/app/actions";
import { INSTANCE_CONFIG } from "@/lib/instance-config";
import { DecisionSwipeCard } from "./decision-swipe-card";
import Link from "next/link";
import { buyingChecksFor } from "@/lib/buying-checks";

type ListingView = "finds" | "pending" | "interested" | "ignored";

const SHORT_FEATURE_LABELS: Record<string, string> = {
  hands_free_highway: "Hands-free highway",
  adaptive_cruise_lane_centering: "Lane centering",
  rear_axle_steering: "Rear steering",
  air_suspension: "Air suspension",
  third_row: "Third row",
  surround_view: "360° camera",
  tow_package: "Tow package",
};

function money(value: number, maximumFractionDigits = 0) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  });
}

export function ListingCard({ listing, view }: { listing: Listing; view: ListingView }) {
  const interested = setDispositionAction.bind(null, listing.id, "interested");
  const passed = setDispositionAction.bind(null, listing.id, "ignored");
  const review = setDispositionAction.bind(null, listing.id, "neutral");
  const isLease = listing.offerKind === "lease";
  const manualPending = listing.verificationStatus === "pending";
  const buyingChecks = buyingChecksFor(listing);

  return (
    <DecisionSwipeCard listingId={listing.id} view={view}>
    <article className={`listing-card ${listing.offerKind} role-${listing.offerRole} lane-${listing.garageGroup}`}>
      <div className="listing-photo">
        {listing.primaryImageUrl ? (
          // Dynamic dealer hosts cannot be safely enumerated for Next's image proxy.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.primaryImageUrl}
            alt={`${listing.title} listing photo`}
            loading="lazy"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        ) : (
          <div className="image-placeholder">
            <span aria-hidden="true">{isLease ? "L" : "H"}</span>
            {isLease ? "Original deal post" : "Actual photo pending"}
          </div>
        )}
        <div className="photo-topline">
          <span className="source-chip">{sourceLabel(listing.source)}</span>
          <span className={`score-chip ${manualPending ? "pending" : ""}`}>
            {manualPending ? "photo pending" : `${Math.round(listing.dealScore)} deal`}
          </span>
        </div>
        <div className="photo-badges">
          <span className={`garage-badge ${listing.garageGroup}`}>{laneLabel(listing)}</span>
          <span className={`offer-kind-badge ${listing.offerKind}`}>{listing.offerKind}</span>
          {isLease ? <span className={`offer-role-badge ${listing.offerRole}`}>{offerRoleLabel(listing.offerRole)}</span> : null}
        </div>
      </div>
      <div className="listing-body">
        <p className="distance">{proximity(listing)}</p>
        <h2>{listing.title}</h2>
        <div className="price-row">
          <strong>{isLease ? (listing.monthlyPayment === null ? "Terms linked" : `${money(listing.monthlyPayment)}/mo`) : (listing.price === null ? "Ask dealer" : money(listing.price))}</strong>
          <span>{isLease ? (listing.effectiveMonthly === null ? "effective cost pending" : `${money(listing.effectiveMonthly)}/mo effective`) : (listing.mileage === null ? listing.condition : `${listing.mileage.toLocaleString()} mi`)}</span>
        </div>
        <p className="location">{[listing.sellerName, listing.region ?? listing.location].filter(Boolean).join(" · ")}</p>

        {isLease ? <LeaseTerms listing={listing} /> : <FactChips listing={listing} />}
        {listing.featureEvidence.length ? <FeatureChips listing={listing} /> : null}

        <details className="card-more">
          <summary>Evidence &amp; checks</summary>
          {buyingChecks.length ? <section className="buying-checks" aria-label="S-Class buying checks"><strong>Before you pursue this S-Class</strong><ul>{buyingChecks.map((check) => <li key={check}>{check}</li>)}</ul><Link href="/guides/w222">S-Class buying guide →</Link></section> : null}
          {listing.featureEvidence.length ? <FeatureEvidence listing={listing} /> : null}
          {listing.safetyEvidence ? <SafetyEvidence listing={listing} /> : null}
          {listing.packageNames.length ? (
            <details className="package-details">
              <summary>{listing.packageNames.length} listed package{listing.packageNames.length === 1 ? "" : "s"}</summary>
              <p>{listing.packageNames.join(" · ")}</p>
            </details>
          ) : null}
          <VerificationStrip listing={listing} />
          <div className="safety-links">
            {listing.vin ? (
              <a href={`https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(listing.vin)}`} target="_blank" rel="noopener noreferrer">Check VIN recalls ↗</a>
            ) : <span>VIN recall lookup pending</span>}
          </div>
        </details>

        <div className="card-actions">
          <a href={listing.url} target="_blank" rel="noopener noreferrer" className="button primary">
            {isLease ? listing.offerRole === "active_offer" ? "Open deal" : "Open source" : "View listing"} <span aria-hidden="true">↗</span>
          </a>
          {view === "finds" || view === "pending" ? (
            <>
              <form action={interested} data-disposition="interested"><button className="button interested">Interested</button></form>
              <form action={passed} data-disposition="ignored"><button className="button secondary">Pass</button></form>
            </>
          ) : (
            <>
              <form action={review}><button className="button review">Back to review</button></form>
              {view === "interested" ? <form action={passed}><button className="button secondary">Pass</button></form> : null}
              {view === "ignored" ? <form action={interested}><button className="button interested">Interested</button></form> : null}
            </>
          )}
        </div>
      </div>
    </article>
    </DecisionSwipeCard>
  );
}

function FactChips({ listing }: { listing: Listing }) {
  const facts = [
    listing.familyFitScore > 0 ? `${Math.round(listing.familyFitScore)} family fit` : null,
    listing.seatingCapacity ? `${listing.seatingCapacity} seats` : null,
    listing.daysOnMarket !== null ? `${listing.daysOnMarket} days listed` : null,
    listing.priceChange !== null && listing.priceChange < 0 ? `${money(Math.abs(listing.priceChange))} price drop` : null,
    listing.oneOwner === true ? "1 owner" : null,
    listing.cleanTitle === true ? "clean title" : null,
    listing.condition === "cpo" ? "CPO" : null,
  ].filter((fact): fact is string => Boolean(fact));
  return facts.length ? <ul className="family-metrics">{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : null;
}

// The desired-equipment verdict at a glance: confirmed and expected features get named chips;
// everything still unverified collapses into one muted chip instead of a wall of question marks.
function FeatureChips({ listing }: { listing: Listing }) {
  const confirmed = listing.featureEvidence.filter((feature) => feature.status === "confirmed");
  const expected = listing.featureEvidence.filter((feature) => feature.status === "expected");
  const unknown = listing.featureEvidence.filter((feature) => feature.status === "unknown");
  return (
    <ul className="feature-chips" aria-label="Desired equipment at a glance">
      {confirmed.map((feature) => (
        <li key={feature.key} className="confirmed" title={feature.evidence}><span aria-hidden="true">✓</span>{SHORT_FEATURE_LABELS[feature.key] ?? feature.label}</li>
      ))}
      {expected.map((feature) => (
        <li key={feature.key} className="expected" title={feature.evidence}><span aria-hidden="true">~</span>{SHORT_FEATURE_LABELS[feature.key] ?? feature.label}</li>
      ))}
      {unknown.length ? (
        <li className="unknown" title={unknown.map((feature) => SHORT_FEATURE_LABELS[feature.key] ?? feature.label).join(", ")}>
          <span aria-hidden="true">?</span>{unknown.length} to verify
        </li>
      ) : null}
    </ul>
  );
}

function VerificationStrip({ listing }: { listing: Listing }) {
  const isLease = listing.offerKind === "lease";
  const manualPending = listing.verificationStatus === "pending";
  const manualVerified = listing.verificationStatus === "verified";
  const familyLane = listing.garageGroup === "ev" || listing.garageGroup === "gas";
  return (
    <div className={`verification-strip ${manualPending ? "pending" : ""} ${isLease ? "lease" : ""}`}>
      <span className="verification-icon" aria-hidden="true">{isLease ? "L" : manualVerified || manualPending ? "H" : "✓"}</span>
      {manualPending ? (
        <span><strong>Manual listing; photo proof pending</strong><small>The collector will retry the full interior gallery.</small></span>
      ) : manualVerified ? (
        <span><strong>Manual lever visually verified</strong><small>{Math.round(listing.manualConfidence * 100)}% photo confidence{listing.manualConfidence < 0.8 ? " · pattern not required" : ""}</small></span>
      ) : isLease ? (
        listing.offerRole === "benchmark" ? (
          <span><strong>Signed benchmark</strong><small>Comparison only · this is not a current offer</small></span>
        ) : listing.offerRole === "market_signal" ? (
          <span><strong>Market signal</strong><small>Lead only · economics remain incomplete until the source discloses them</small></span>
        ) : (
          <span><strong>Lease economics normalized</strong><small>{Math.round(listing.parseConfidence * 100)}% term confidence · verify the original offer</small></span>
        )
      ) : familyLane ? (
        <span><strong>Equipment evidence separated from assumptions</strong><small>{enrichmentLabel(listing.enrichmentStatus)}</small></span>
      ) : (
        <span><strong>{listing.condition === "new" ? "New" : listing.condition === "cpo" ? "CPO" : "Used"} inventory normalized</strong><small>Price, mileage, location, and source identity checked</small></span>
      )}
    </div>
  );
}

function FeatureEvidence({ listing }: { listing: Listing }) {
  return (
    <section className="feature-evidence" aria-label="Desired equipment evidence">
      <div className="feature-heading"><strong>Equipment evidence</strong><span>{Math.round(listing.featureMatchScore)}% matched</span></div>
      <ul>
        {listing.featureEvidence.map((feature) => (
          <li key={feature.key} className={feature.status} title={feature.evidence}>
            <span aria-hidden="true">{feature.status === "confirmed" ? "✓" : feature.status === "expected" ? "~" : "?"}</span>
            <span><strong>{feature.label}</strong><small>{feature.status}</small><small className="evidence-note">{feature.evidence}</small></span>
          </li>
        ))}
      </ul>
      {listing.featureEvidence.some((feature) => feature.status !== "confirmed") ? (
        <p>Verify on the listing or window sticker before treating expected equipment as fitted.</p>
      ) : null}
    </section>
  );
}

function SafetyEvidence({ listing }: { listing: Listing }) {
  const evidence = listing.safetyEvidence!;
  const campaignLabel = `${evidence.recallCampaignCount} model-year recall campaign${evidence.recallCampaignCount === 1 ? "" : "s"}`;
  return (
    <section className="nhtsa-safety" aria-label="NHTSA safety evidence">
      <div className="safety-heading">
        <strong>{evidence.overallRating === null ? "NHTSA crash rating not available" : `NHTSA ${evidence.overallRating} of 5 overall`}</strong>
        <span>official data</span>
      </div>
      {evidence.ratingStatus === "rated" ? (
        <ul>
          {evidence.frontalCrashRating ? <li>Front {evidence.frontalCrashRating}/5</li> : null}
          {evidence.sideCrashRating ? <li>Side {evidence.sideCrashRating}/5</li> : null}
          {evidence.rolloverRating ? <li>Rollover {evidence.rolloverRating}/5</li> : null}
        </ul>
      ) : <p>NHTSA does not publish a 5-Star result for this exact model group; that is not a safety judgment.</p>}
      <p>
        Conservative result across {evidence.testedVariantCount} of {evidence.availableVariantCount} available tested variant{evidence.availableVariantCount === 1 ? "" : "s"}. {campaignLabel}; check this VIN for open status.
      </p>
      {evidence.recallCampaigns.length ? (
        <details>
          <summary>Campaign context</summary>
          <ul>{evidence.recallCampaigns.slice(0, 3).map((campaign) => (
            <li key={campaign.campaignNumber}>{campaign.component} · {campaign.campaignNumber}</li>
          ))}</ul>
        </details>
      ) : null}
    </section>
  );
}

function LeaseTerms({ listing }: { listing: Listing }) {
  const terms = [
    listing.dueAtSigning === null ? null : `${money(listing.dueAtSigning)} DAS`,
    listing.termMonths === null ? null : `${listing.termMonths} mo`,
    listing.annualMiles === null ? null : `${listing.annualMiles.toLocaleString()} mi/yr`,
    listing.msrp === null ? null : `${money(listing.msrp)} MSRP`,
    listing.securityDeposit === null ? null : listing.securityDepositRefundable === true
      ? `${money(listing.securityDeposit)} refundable MSDs`
      : `${money(listing.securityDeposit)} security deposit${listing.securityDepositRefundable === false ? " (non-refundable)" : ""}`,
  ].filter((term): term is string => Boolean(term));
  return terms.length ? <ul className="lease-terms">{terms.map((term) => <li key={term}>{term}</li>)}</ul> : null;
}

function offerRoleLabel(role: Listing["offerRole"]) {
  if (role === "benchmark") return "Signed benchmark";
  if (role === "market_signal") return "Market signal";
  return "Active offer";
}

function proximity(listing: Listing) {
  if (listing.distanceMiles !== null) return `${listing.distanceMiles.toFixed(0)} miles from ${INSTANCE_CONFIG.locationLabel}`;
  return listing.region ? `${listing.region} offer` : listing.location;
}

function laneLabel(listing: Listing) {
  if (listing.garageGroup === "ev") return "EV";
  if (listing.garageGroup === "gas") return listing.powertrainCategory === "phev" ? "PHEV" : listing.powertrainCategory === "hybrid" ? "Hybrid" : "Gas";
  if (listing.garageGroup === "lease") return "Lease";
  if (listing.garageGroup === "enthusiast") return "Enthusiast";
  return listing.powertrainCategory === "ev" ? "EV" : "Other";
}

function enrichmentLabel(status: Listing["enrichmentStatus"]) {
  if (status === "enriched") return "Listing packages and features inspected";
  if (status === "budget_deferred") return "Base listing saved; package detail queued for a later cycle";
  if (status === "unavailable" || status === "failed") return "Package detail unavailable; unknown equipment stays unknown";
  return "Model-year rules and listing-summary text shown as expected; window-sticker evidence still needed";
}

function sourceLabel(source: string) {
  if (source.toLowerCase() === "nhtsa") return "NHTSA";
  return source.split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
