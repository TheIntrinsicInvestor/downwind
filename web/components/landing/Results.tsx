// Measured results (spec section 6): two comparison charts read from limits.json at run time, then a pointer to the
// live map's Limits panel. A missing block omits only its chart; nothing prints undefined or NaN.

import { memo } from "react";
import Link from "next/link";
import { type Limits, WORDS } from "@/lib/replay";
import BarPair from "./BarPair";

const f2 = (n: number) => n.toFixed(2);
const word = (n: number) => WORDS[n] ?? String(n);

function Results({ limits, limitsError }: { limits: Limits | null; limitsError: string | null }) {
  const fc = limits?.forecast2026;
  const learn = limits?.learn && limits.learn.shipped ? limits.learn : null;
  const none = !fc && !learn;
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
        <p className="mt-14 border-t border-rule pt-6 text-[15px] text-ink-2">
          What this does not show is in the{" "}
          <Link href="/app?panel=limits" className="focus-ring text-ember-hot underline underline-offset-4 hover:text-ember">live map&apos;s Limits panel</Link>.
        </p>
      </div>
    </section>
  );
}

export default memo(Results);
