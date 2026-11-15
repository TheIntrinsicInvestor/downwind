// Measured results (spec section 6): two comparison charts read from limits.json at run time, then the limits that used
// to sit in the app's Limits panel: the 2023 test, the story day's ranking, what the model ignores and what we do not
// claim. The wording is the panel's. Every block omits itself when its data is
// missing; nothing prints undefined or NaN.

import { memo, type ReactNode } from "react";
import { POPULATION_OVERLAY_MODE } from "@/lib/population";
import { type Day, type Limits, WORDS, stabilityLine } from "@/lib/replay";
import BarPair from "./BarPair";

const f2 = (n: number) => n.toFixed(2);
const word = (n: number) => WORDS[n] ?? String(n);
const fin = (...n: unknown[]) => n.every((x) => typeof x === "number" && Number.isFinite(x));

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="label">{title}</h3>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

function Dashed({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((x) => <li key={x} className="relative pl-4 before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2 before:bg-ink-3">{x}</li>)}
    </ul>
  );
}

function Results({ limits, limitsError, day }: { limits: Limits | null; limitsError: string | null; day: Day | null }) {
  const fc = limits?.forecast2026;
  const learn = limits?.learn && limits.learn.shipped ? limits.learn : null;
  const none = !fc && !learn;
  const r = limits?.replay2023;
  const show2023 = !!r && fin(r.pooled, r.pontianak, r.worst_quartile_hit, r.chance);
  const hasStability = !!day?.stability;
  const hasWeighting = typeof day?.persistence_weighted === "boolean";
  const ignores = limits?.ignores?.length ? limits.ignores : null;
  const populationLimit = POPULATION_OVERLAY_MODE === "heatmap"
    ? "The population heatmap shows relative clustering only. Its blur extends beyond where people live, including over water and plantations, and its colours change with zoom. Resident counts come from the model's population grid, not the heatmap."
    : "Population is modelled residential population (WorldPop 2026, constrained to detected settlements), not a census count, and may miss scattered or newly built housing.";
  const notClaimed = [...(limits?.not_claimed ?? []), populationLimit];
  const anyLimits = show2023 || hasStability || hasWeighting || !!ignores || notClaimed.length > 0;
  return (
    <section id="results" aria-labelledby="results-title" className="scroll-mt-16 border-t border-rule px-5 py-20 sm:px-10 lg:px-16 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="dateline">Measured results</p>
        <h2 id="results-title" className="mt-4 max-w-2xl font-display text-3xl leading-tight text-ink sm:text-4xl">
          Checked against what actually happened
        </h2>
        {none ? (
          <p className="mt-10 text-[15px] text-ink-2">
            {limits || limitsError ? "The measured results are not available right now." : "Loading the measured results."}
          </p>
        ) : (
          <div className="mt-12 grid gap-14 border-t border-rule pt-12 lg:grid-cols-2 lg:gap-20">
            {fc && (
              <BarPair
                title="A day ahead, with the morning forecast (Sep to Oct 2026)"
                a={{ label: "Downwind's smoke index", value: fc.forecast }}
                b={{ label: "Count of nearby fires", value: fc.baseline }}
                max={1}
                bracket={{ low: fc.gain_low, high: fc.gain_high }}
                reading={`Over ${fc.days} airport-days at ${word(fc.airports)} airports, Downwind's smoke index tracked observed visibility better than a count of nearby fires.`}
                small={`Correlation with airport visibility; ${f2(fc.pontianak)} at Pontianak; ${f2(fc.hindsight)} with the weather that actually followed.`}
              />
            )}
            {learn && (
              <BarPair
                title="Which fires will be seen again tomorrow (Sep to Oct 2026, a season the model never saw)"
                a={{ label: "Learned model", value: learn.test_auc_2026 }}
                b={{ label: "Counting days burned", value: learn.heuristic_auc_2026 }}
                max={1}
                reading="A model trained on three earlier seasons picks out the fires satellites see again the next day. Downwind weights each fire's smoke by it."
                small="AUC; scored once."
              />
            )}
          </div>
        )}
        {anyLimits && (
          <div className="mt-14 grid gap-12 border-t border-rule pt-12 lg:grid-cols-2 lg:gap-x-20 lg:gap-y-14">
            {show2023 && r && (
              <Block title="Tested on the 2023 haze season">
                <p>
                  In a replay of the 2023 haze season at {r.airports === 7 ? "seven" : r.airports} airports, a smoke index built
                  from the previous day&apos;s fires tracks observed visibility at {f2(r.pooled)} correlation,
                  up to {f2(r.pontianak)} at Pontianak.
                </p>
                <p>
                  It flags {Math.round(r.worst_quartile_hit * 100)}% of the worst-quartile haze days, against{" "}
                  {Math.round(r.chance * 100)}% by chance.
                </p>
                <p>
                  That test used archived weather close to what actually happened, not the forecast available each morning
                  (no archive of past forecasts reaches back to 2023). The 2026 test above uses the morning forecast.
                </p>
                <p>
                  Peat fires are weighted about 6 times heavier per unit of satellite-measured heat (GFAS emission factors,
                  Kaiser et al. 2012). Adding this kept the 2023 correlation at 0.45 and moved the worst-day hit rate from 50% to 48%.
                </p>
                <p>The top-ten list is stable across reruns (9 to 10 of 10 kept).</p>
              </Block>
            )}
            {(hasStability || hasWeighting) && day && (
              <Block title="The 20 September ranking">
                {day.stability && <p>{stabilityLine(day.stability)}</p>}
                {hasWeighting && <p>{day.persistence_weighted ? "Persistence weighting applied." : "Persistence weighting off."}</p>}
              </Block>
            )}
            {ignores && (
              <Block title="What it ignores">
                <Dashed items={ignores} />
              </Block>
            )}
            <Block title="What we do not claim">
              <Dashed items={notClaimed} />
            </Block>
          </div>
        )}
      </div>
    </section>
  );
}

export default memo(Results);
