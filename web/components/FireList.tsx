"use client";

// The ranked list as a bulletin table: rank numeral, place with a share bar, share in mono. Memoised: the app shell
// re-renders on every smoke frame while playing, and none of these props change then.

import { memo, useMemo, useState } from "react";
import { type Day, type Mode, orderForMode, pct, rankedFires } from "@/lib/replay";
import { officialColor } from "@/lib/mapstyle";

type Props = { day: Day; selected: number | null; onSelect: (i: number) => void; mode: Mode };

function FireList({ day, selected, onSelect, mode }: Props) {
  const [showAll, setShowAll] = useState(false);
  const ranked = useMemo(() => (mode === "official" ? orderForMode(day.fires, "official") : rankedFires(day)), [day, mode]);
  if (ranked.length === 0) {
    return <p className="py-6 text-sm text-ink-2">No Priority 1 fires in West Kalimantan on this day.</p>;
  }
  const shown = showAll ? ranked : ranked.slice(0, 20);
  const maxShare = mode === "downwind" ? (day.fires[ranked[0]].share ?? 0) : 0;
  return (
    <div>
      <div className="label grid grid-cols-[2.5rem_1fr_auto] gap-x-3 border-b border-rule pb-2" aria-hidden="true">
        <span className="text-right">{mode === "official" ? "Tier" : "Rank"}</span>
        <span>Location</span>
        {mode === "downwind" && <span className="text-right">Share</span>}
      </div>
      <ol className="divide-y divide-rule">
        {shown.map((i) => {
          const f = day.fires[i];
          const active = i === selected;
          const top = mode === "downwind" && (f.rank as number) <= 10;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={active ? "true" : undefined}
                className={`focus-ring-inset relative mx-[calc(-1*var(--pad,0px))] grid min-h-11 w-[calc(100%+2*var(--pad,0px))] grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 px-[var(--pad,0px)] py-1.5 text-left transition-colors ${
                  active ? "bg-ember/10" : "hover:bg-ink/[0.05]"}`}
              >
                {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-ember" aria-hidden="true" />}
                {mode === "official" ? (
                  <span className="flex items-center justify-end gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${officialColor(f.tier).join(",")})` }} aria-hidden="true" />
                    <span className="figure text-xs text-ink-2">P{f.tier}</span>
                  </span>
                ) : (
                  <span className={`text-right font-display text-xl leading-none [font-variant-numeric:lining-nums_tabular-nums] ${
                    top ? "text-ember-hot" : "text-ink-3"}`}>
                    {f.rank}
                  </span>
                )}
                <span className={`min-w-0 truncate text-sm ${active || top ? "text-ink" : "text-ink-2"}`}>
                  {f.place ?? `${f.lat.toFixed(2)}, ${f.lon.toFixed(2)}`}
                </span>
                {mode === "downwind" && (
                  <span className="flex items-center justify-end gap-2.5">
                    {maxShare > 0 && (
                      <span className="block h-1 w-12" aria-hidden="true">
                        <span className={`block h-full ${top ? "bg-ember" : "bg-ink-3/50"}`}
                          style={{ width: `${Math.max(3, ((f.share ?? 0) / maxShare) * 100)}%` }} />
                      </span>
                    )}
                    <span className={`figure w-11 text-right text-[13px] ${top ? "text-ink" : "text-ink-2"}`}>{pct(f.share, 1)}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {ranked.length > 20 && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="focus-ring-inset mt-1 min-h-11 w-full border-t border-rule text-[13px] font-medium text-ink-2 transition-colors hover:text-ember-hot"
        >
          {showAll ? "Show top 20" : `Show all ${ranked.length}`}
        </button>
      )}
    </div>
  );
}

export default memo(FireList);
