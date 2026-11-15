// How fires are chosen today: three sourced facts about the rule and 2026 practice. Static copy; opaque like the other
// content sections. What Downwind adds, and the table comparing its top ten with the ten largest fires, now sit in
// Results (TopTen.tsx).

import { memo } from "react";

const FACTS = [
  {
    label: "The rule",
    text: "Indonesia's rule, P.8/2018, sorts hotspots into three priority tiers to decide which get a field check first. Inside Priority 1 it sets no order, and it does not count the people downwind.",
    source: "Source: Permen LHK P.8/2018, Pasal 9 and 14",
  },
  {
    label: "In practice",
    text: "In August, West Kalimantan's disaster agency put its air effort into the three regencies with the most hotspots and the largest burned area, citing smoke at Supadio Airport and health. The national agency says helicopters are for small fires that ground crews cannot reach.",
    source: "Sources: BPBD Kalbar, 1 August 2026; BNPB, 10 September 2026",
  },
  {
    label: "On the ground",
    text: "Resources are short. On 9 September, poor visibility kept water-bombing helicopters from flying over Kubu Raya, where a village fought fires for about 25 days on its own fuel.",
    source: "Sources: Metro TV, 9 September 2026; Mongabay, 31 August 2026",
  },
];

function Practice() {
  return (
    <section id="practice" aria-labelledby="practice-title" className="pointer-events-auto relative scroll-mt-16 border-t border-rule bg-bg px-5 py-20 sm:px-10 lg:px-16 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="dateline">How fires are chosen today</p>
        <h2 id="practice-title" className="mt-4 max-w-2xl font-display text-3xl leading-tight text-ink sm:text-4xl">
          What decides which fire gets attention
        </h2>
        <div className="mt-12 grid gap-10 border-t border-rule pt-12 md:grid-cols-3 md:gap-12">
          {FACTS.map((f) => (
            <div key={f.label}>
              <p className="label">{f.label}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{f.text}</p>
              <p className="mt-3 text-xs leading-relaxed text-ink-3">{f.source}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default memo(Practice);
