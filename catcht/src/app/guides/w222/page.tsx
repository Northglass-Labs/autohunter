import Link from "next/link";
import { AutoHunterLockup } from "@/components/autohunter-brand";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const brochure2018 = "https://www.auto-brochures.com/makes/Mercedes_Benz/S-Class/Mercedes%20Benz_US%20S-Class_2018.pdf";
const brochure2019 = "https://www.auto-brochures.com/makes/Mercedes_Benz/S-Class/Mercedes%20Benz_US%20S-Class_2019.pdf";
const brochure2020 = "https://www.auto-brochures.com/makes/Mercedes_Benz/S-Class/Mercedes%20Benz_US%20S-Class_2020.pdf";

export default async function W222GuidePage() {
  if (!await currentUser()) redirect("/login");
  return <main className="report-shell buying-guide">
    <header className="report-nav"><Link className="brand-lockup" href="/"><AutoHunterLockup /></Link><Link className="report-back" href="/">Back to your hunt</Link></header>
    <section className="guide-hero">
      <p className="eyebrow">Mercedes-Benz · US-market W222 sedans</p>
      <h1>The S-Class value hunt</h1>
      <p>A well-optioned 2018–2020 S560 below $25,000 is worth investigating. Condition, service history and verified equipment decide whether the individual car is a good buy.</p>
      <div className="guide-facts"><span><strong>2018–2020</strong>Facelift sedans</span><span><strong>Up to $25k</strong>Asking price</span><span><strong>S560 + S450</strong>V8 target · V6 comparison</span></div>
    </section>
    <section className="guide-section"><h2>Start with two searches</h2><p>The S560 has a 4.0-liter twin-turbo V8 and a nine-speed automatic. The S450 has a 3.0-liter twin-turbo V6 and the same number of gears. Both rear-wheel drive and 4MATIC are eligible; neither drivetrain proves optional equipment. <a href={brochure2018}>Mercedes 2018 US sedan brochure</a>.</p><p>The presets allow up to 120,000 miles to find budget candidates. That is a discovery limit, not a condition recommendation. They use your existing search area, with provider coverage limits shown in source health. Leave required equipment empty until you want to exclude cars with incomplete descriptions.</p><Link className="button primary" href="/#search-studio">Set up the searches →</Link></section>
    <section className="guide-section"><h2>What “well optioned” means here</h2><p>These are US sedan specifications. Confirm the individual car with its VIN build sheet or original window sticker, then test the equipment in person.</p>
      <div className="guide-options">
        <article><h3>Phone integration · standard</h3><p>Apple CarPlay and Android Auto are listed as standard for these facelift sedans. Factory operation is wired; test your phone in the correct USB port. An aftermarket wireless adapter is a separate accessory.</p></article>
        <article><h3>Premium Package · prioritize</h3><p>Optional on the S450 and S560. It groups surround-view cameras, ventilated and rapid-heating front seats, and active multicontour front seats with massage. “Premium audio” does not establish this package.</p></article>
        <article><h3>Driver Assistance Package · prioritize</h3><p>Optional, with Premium Package required in the US brochures. Active Distance Assist DISTRONIC and Active Steering Assist provide adaptive cruise and steering assistance. This is a hands-on system; lane-departure warnings or adaptive cruise alone do not prove lane centering.</p></article>
        <article><h3>Warmth &amp; Comfort · a useful extra</h3><p>Optional heated armrests, heated steering wheel and upgraded rear-seat comfort. Verify the exact year and package contents instead of assuming every heated surface or seat is fitted.</p></article>
        <article><h3>AMG Line Exterior · appearance</h3><p>Optional styling and wheels, with no implied AMG engine or performance upgrade. Wheels alone are insufficient proof of the factory package.</p></article>
        <article><h3>Burmester High-End 3D · rare extra</h3><p>A separate optional system from standard Burmester surround sound. Rotating front tweeters are a useful clue, but a build sheet is better proof than a cosmetic detail or a generic Burmester badge.</p></article>
        <article><h3>MAGIC BODY CONTROL · verify carefully</h3><p>This camera-assisted active suspension was unavailable with 4MATIC. AWD cars use AIRMATIC. The 2019 and 2020 US brochures restrict MAGIC BODY CONTROL to the S560 sedan; do not assume S450 availability across every year. MAGIC SKY CONTROL is a different roof feature.</p></article>
      </div><p className="guide-source">Equipment sources: <a href={brochure2018}>2018 Mercedes US brochure, equipment tables</a> , <a href={brochure2019}>2019 Mercedes US brochure</a>, and <a href={brochure2020}>2020 Mercedes US brochure, features and options</a>. Manufacturer documents hosted by an archive; reviewed September 8, 2026.</p>
    </section>
    <section className="guide-section guide-inspection"><p className="eyebrow">Before a deposit</p><h2>Make the independent inspection count</h2><ol><li><strong>Use a Mercedes specialist.</strong> Request a full-module diagnostic scan with legitimate Mercedes-capable equipment, not just generic engine-code reading. Review service records, cold-start behavior, leaks, cooling, brakes and tires.</li><li><strong>Check the suspension overnight.</strong> Look for a low corner after parking, and test ride-height operation. A car that stays level still needs a professional inspection; there is no universal replacement interval for air struts or valve blocks.</li><li><strong>Operate the expensive options.</strong> Seats, massage, ventilation, cameras, assistance systems, audio, sunroof and phone integration should all work. A brochure establishes availability, not the condition of this car.</li><li><strong>Get the total price and a repair reserve.</strong> The $25,000 search ceiling covers asking price. Obtain an itemized out-the-door quote and budget separately for maintenance and repairs.</li><li><strong>Check recalls by VIN.</strong> Model-year campaign counts do not say whether this specific car has an open recall. Use the listing’s NHTSA VIN link.</li></ol><p>Mercedes publishes scheduled maintenance guidance, but it does not substantiate a blanket claim that the S560 powertrain is more reliable than the S550. Prefer the better documented, better inspected car. <a href="https://www.mbusa.com/en/owners/service-maintenance">Mercedes service guidance</a>.</p></section>
    <section className="guide-section"><h2>About earlier S550s</h2><p>The 2017 US sedan brochure does not list factory CarPlay or Android Auto. Do not assume one COMAND version or a universal retrofit for every 2014–2017 car. Verify the installed hardware and any retrofit by VIN and with the installer before widening the search. <a href="https://www.auto-brochures.com/makes/Mercedes_Benz/S-Class/Mercedes%20Benz_US%20S-Class_2017.pdf">2017 Mercedes US sedan brochure</a>.</p></section>
  </main>;
}
