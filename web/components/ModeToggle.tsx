"use client";

import { type Day, type Mode, tierColor } from "@/lib/replay";

type Props = { mode: Mode; onMode: (m: Mode) => void; day: Day };

const rgb = (t: 1 | 2 | 3) => `rgb(${tierColor(t).join(",")})`;

export default function ModeToggle({ mode, onMode, day }: Props) {
  const { p1, p2, p3 } = day.counts;
  return (
    <div className="border-b border-stone-200 px-4 py-3 text-sm">
      <div role="radiogroup" aria-label="Ranking view" className="grid grid-cols-2 rounded-md bg-stone-100 p-0.5">
        {(["official", "downwind"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onMode(m)}
            className={`rounded px-2 py-1.5 text-xs font-semibold ${mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"}`}
          >
            {m === "official" ? "Official tiers" : "Downwind order"}
          </button>
        ))}
      </div>

      {mode === "official" ? (
        <div className="mt-3">
          <ul className="space-y-1">
            {([[1, p1], [2, p2], [3, p3]] as const).map(([t, n]) => (
              <li key={t} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: rgb(t) }} />
                <span className="flex-1">Priority {t}</span>
                <span className="tabular-nums">{n.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-stone-800">
            Tiers follow our reading of P.8/2018, Pasal 9: {p1.toLocaleString("en-US")} fires share Priority 1, with no order among them.
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Our reading counts a fire on peat, in a cluster of 3 or more detections, or seen 3 days running. The regulation gives no cluster size, so that number is ours; its visible-smoke input is not computed here. Satellite &quot;low&quot; confidence stands in for the rule&apos;s &quot;under 30%&quot;, an approximation.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-stone-800">
          Downwind&apos;s order inside Priority 1. An extra layer on the official rule; the task force decides.
        </p>
      )}
    </div>
  );
}
