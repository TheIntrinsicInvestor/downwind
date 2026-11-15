// How it differs: the existing ways of choosing or seeing fires, then the row Downwind adds. Static copy; opaque like
// the other content sections.

import { memo } from "react";

const ROWS = [
  { name: "Official tiers (P.8/2018)", text: "Sort hotspots into three groups. No order within Priority 1, and no count of the people downwind." },
  { name: "Haze forecasts (BMKG, ASMC)", text: "Show where haze is, not which fire causes it." },
  { name: "SMOKE Policy Tool (Harvard, Columbia)", text: "Ranks areas for pre-season planning, not live fires." },
];

function Differs() {
  return (
    <section id="how-it-differs" aria-labelledby="differs-title" className="scroll-mt-16 border-t border-rule px-5 py-20 sm:px-10 lg:px-16 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="dateline">How it differs</p>
        <h2 id="differs-title" className="mt-4 max-w-3xl font-display text-3xl leading-tight text-ink sm:text-4xl">
          Existing tools sort hotspots or map haze. None ranks today&apos;s fires by who breathes it.
        </h2>
        <dl className="mt-12 border-t border-rule">
          {ROWS.map((r) => (
            <div key={r.name} className="grid gap-1 border-b border-rule py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-10">
              <dt className="text-[15px] font-medium text-ink">{r.name}</dt>
              <dd className="text-[15px] leading-relaxed text-ink-2">{r.text}</dd>
            </div>
          ))}
          {/* Same grid and padding as the rows above so the columns line up; the red bar hangs in the section's left gutter. */}
          <div className="relative grid gap-1 border-b border-rule py-4 before:absolute before:inset-y-3 before:-left-3 before:w-[3px] before:bg-ember-hot md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-10">
            <dt className="text-[15px] font-semibold text-ink">Downwind</dt>
            <dd className="text-[15px] leading-relaxed text-ink">Ranks today&apos;s individual fires by the people their smoke will reach.</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-ink-3">Official tiers: Permen LHK P.8/2018, Pasal 9 and 14.</p>
      </div>
    </section>
  );
}

export default memo(Differs);
