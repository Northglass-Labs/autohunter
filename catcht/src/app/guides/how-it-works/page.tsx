import Link from "next/link";
import { AutoHunterLockup } from "@/components/autohunter-brand";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HowItWorksPage() {
  await requirePageUser();
  return <main className="report-shell buying-guide">
    <header className="report-nav"><Link className="brand-lockup" href="/"><AutoHunterLockup /></Link><Link className="report-back" href="/">Back to your hunt</Link></header>
    <section className="guide-hero">
      <p className="eyebrow">A short guide</p>
      <h1>How AutoHunter works</h1>
      <p>AutoHunter watches licensed listing feeds for the cars in your saved searches, prices each one against similar cars it has already seen, and emails you a short report when something new is worth a look.</p>
      <div className="guide-facts"><span><strong>Daily</strong>Collection</span><span><strong>Your choice</strong>Report frequency</span><span><strong>12 picks</strong>At most 3 per search</span></div>
    </section>

    <section className="guide-section"><h2>Where the cars come from</h2>
      <div className="guide-options">
        <article><h3>MarketCheck dealer inventory</h3><p>Used and new cars from dealer websites, checked every other day. The current plan covers 100 miles from your search ZIP, even when a search allows more.</p></article>
        <article><h3>Auto.dev dealer inventory</h3><p>A second dealer feed, checked daily, that reaches your full search radius.</p></article>
        <article><h3>Manufacturer lease programs</h3><p>Advertised factory lease offers for your region, checked weekly and at the start of each month.</p></article>
        <article><h3>NHTSA safety data</h3><p>Crash ratings and model-year recall campaigns. Each card links to the official recall check for its VIN.</p></article>
      </div>
      <p>Private sellers and auctions are not covered. Leasehackr is never crawled, because its terms forbid automated collection; lease alerts that arrive by email can be imported with your permission instead.</p>
    </section>

    <section className="guide-section"><h2>How a car becomes a pick</h2>
      <ol>
        <li><strong>Your limits come first.</strong> Model, trim, years, price cap, mileage and distance are hard limits. A car outside any of them never appears.</li>
        <li><strong>Price against similar cars.</strong> Each used car is compared with similar ones AutoHunter has seen in the last 90 days: the same model and trim, within a model year, adjusted for mileage and year. Cards say how far a car is below or above them, and how many were compared.</li>
        <li><strong>Then the rest of the fit.</strong> Lower mileage, a shorter drive, the equipment you asked for, and family practicality move a car up.</li>
        <li><strong>Data errors are dropped.</strong> A price that is really a down payment or a placeholder is not a deal, so it never reaches your queue.</li>
        <li><strong>Unusually low prices are flagged.</strong> A car 20% or more below similar cars may have a branded title or damage history. Check before you get excited.</li>
      </ol>
      <p>Leases are compared by their effective monthly cost as a share of MSRP, with a penalty for cash due at signing.</p>
    </section>

    <section className="guide-section"><h2>Reports</h2>
      <ul>
        <li>Choose daily, every 3 days, weekly, or paused on the <Link href="/reports">Reports page</Link>.</li>
        <li>A report goes out only when something new or meaningfully cheaper clears one of your searches: up to 12 picks, no more than 3 from any one search.</li>
        <li>A car you were already sent comes back only after 14 days, or after a price drop of $750 or 5%.</li>
        <li>After a quiet week, you get a short check-in instead. Every report stays on the Reports page.</li>
      </ul>
    </section>

    <section className="guide-section"><h2>Deciding and adjusting</h2>
      <ul>
        <li><strong>Interested or Pass</strong> on any card, or swipe right or left on a phone. The buttons in report emails open a confirmation first. Your decisions are private, and Back to review undoes them.</li>
        <li><strong>Edit a saved search</strong> from its card, or add a new one. After an edit, matches reappear once the next collection confirms them under the new criteria.</li>
        <li><strong>Pause a search</strong> to stop it without losing it.</li>
      </ul>
      <Link className="button primary" href="/#search-studio">Review your searches →</Link>
    </section>

    <section className="guide-section guide-inspection"><p className="eyebrow">Before a deposit</p><h2>What AutoHunter cannot tell you</h2>
      <ol>
        <li><strong>Equipment.</strong> Features marked expected come from model-year rules. Confirm them with the window sticker or VIN build sheet.</li>
        <li><strong>Recalls.</strong> Model-year campaign counts do not say whether this car has an open recall. Use the card’s VIN check.</li>
        <li><strong>Condition and total price.</strong> Get an independent inspection and an itemized out-the-door quote.</li>
      </ol>
    </section>

    <section className="guide-section"><h2>Privacy</h2><p>AutoHunter is invite-only. You sign in with a link sent to your email, and nobody else can use that link. Your searches, decisions and reports are visible only to you; the household administrator can invite people and move a search between queues.</p></section>
  </main>;
}
