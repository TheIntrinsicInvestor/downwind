// How fires are chosen today, and what Downwind adds: three sourced facts about the rule and 2026 practice, then the
// measured difference between Downwind's top ten and the ten largest fires. Static copy; opaque like the other content
// sections. The table values come from prioritisation-check/overlap.py run on the shipped day files for 18 to 20
// September 2026 (share = the day file's modelled share of smoke over residents, as on the rest of the site). Re-run it
// and update ROWS if the day files are rebuilt. Neither ordering is a record of what crews did.

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

const ROWS = [
  { day: "18 Sep", fires: 85, downwind: "51.0%", size: "31.2%", shared: 3 },
  { day: "19 Sep", fires: 346, downwind: "33.9%", size: "30.2%", shared: 6 },
  { day: "20 Sep", fires: 349, downwind: "28.4%", size: "25.3%", shared: 7 },
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

        <div className="mt-14 grid gap-10 border-t border-rule pt-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="label">What Downwind adds</p>
            <p className="mt-3 max-w-[30rem] text-[15px] leading-relaxed text-ink-2">
              Downwind puts an order inside Priority 1, by how many residents each fire&apos;s smoke will reach in the next 48 hours.
              The ten fires it ranks first hold more of the day&apos;s smoke over residents than the ten largest fires do.
            </p>
            <p className="mt-4 max-w-[30rem] text-xs leading-relaxed text-ink-3">
              Neither list is a record of what crews did: no public record shows which fires were chosen. Smoke shares are modelled, over three days.
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Share of the day&apos;s modelled smoke over residents held by ten fires, by how the ten are chosen</caption>
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className="label pb-3 pr-3 font-normal">Day</th>
                <th scope="col" className="label pb-3 pr-3 text-right font-normal">Downwind&apos;s top 10</th>
                <th scope="col" className="label pb-3 pr-3 text-right font-normal">Ten largest</th>
                <th scope="col" className="label pb-3 text-right font-normal">On both lists</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.day} className="border-b border-rule">
                  <th scope="row" className="py-3 pr-3 text-left font-normal text-ink-2">{r.day}<span className="block text-xs text-ink-3">{r.fires} fires</span></th>
                  <td className="figure py-3 pr-3 text-right text-ember-hot">{r.downwind}</td>
                  <td className="figure py-3 pr-3 text-right text-ink">{r.size}</td>
                  <td className="figure py-3 text-right text-ink-2">{r.shared} of 10</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default memo(Practice);
