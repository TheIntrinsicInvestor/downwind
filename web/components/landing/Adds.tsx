// What Downwind adds: Downwind's top ten against the ten largest fires, by share of the day's modelled smoke over
// residents. Static copy; opaque like the other content sections. The table values come from
// prioritisation-check/overlap.py run on the shipped day files for 18 to 20 September 2026 (share = the day file's
// modelled share of smoke over residents, as on the rest of the site). Re-run it and update ROWS if the day files are
// rebuilt; "times" is downwind / size, rounded to one decimal.

import { memo } from "react";

const ROWS = [
  { day: "18 Sep", fires: 85, downwind: "51.0%", size: "31.2%", times: "1.6×", shared: 3 },
  { day: "19 Sep", fires: 346, downwind: "33.9%", size: "30.2%", times: "1.1×", shared: 6 },
  { day: "20 Sep", fires: 349, downwind: "28.4%", size: "25.3%", times: "1.1×", shared: 7 },
];

function Adds() {
  return (
    <section id="what-it-adds" aria-labelledby="adds-title" className="scroll-mt-16 border-t border-rule px-5 py-20 sm:px-10 lg:px-16 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="dateline">What Downwind adds</p>
        <h2 id="adds-title" className="mt-4 max-w-3xl font-display text-3xl leading-tight text-ink sm:text-4xl">
          Same ten crews, 1.1 to 1.6 times more of the smoke over people.
        </h2>
        <div className="mt-12 overflow-x-auto border-t border-rule pt-8">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <caption className="sr-only">Share of the day&apos;s modelled smoke over residents held by ten fires, by how the ten are chosen</caption>
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className="label pb-3 pr-3 font-normal">Day</th>
                <th scope="col" className="label pb-3 pr-3 text-right font-normal">Downwind&apos;s top 10</th>
                <th scope="col" className="label pb-3 pr-3 text-right font-normal">Ten largest fires</th>
                <th scope="col" className="label pb-3 pr-3 text-right font-normal">Times more</th>
                <th scope="col" className="label pb-3 text-right font-normal">On both lists</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.day} className="border-b border-rule">
                  <th scope="row" className="py-3 pr-3 text-left font-normal text-ink-2">{r.day}<span className="block text-xs text-ink-3">{r.fires} Priority 1 fires</span></th>
                  <td className="figure py-3 pr-3 text-right text-ember-hot">{r.downwind}</td>
                  <td className="figure py-3 pr-3 text-right text-ink">{r.size}</td>
                  <td className="figure py-3 pr-3 text-right text-ember-hot">{r.times}</td>
                  <td className="figure py-3 text-right text-ink-2">{r.shared} of 10</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-[44rem] text-xs leading-relaxed text-ink-3">
          Share of the day&apos;s modelled smoke over residents held by each list of ten. &ldquo;Ten largest&rdquo; is by heat. The gap is widest when fewer fires burn.
        </p>
      </div>
    </section>
  );
}

export default memo(Adds);
