"use client";

import { useState } from "react";
import { type Day, type Mode, orderForMode, pct, rankedFires } from "@/lib/replay";

type Props = { day: Day; selected: number | null; onSelect: (i: number) => void; mode: Mode };

export default function FireList({ day, selected, onSelect, mode }: Props) {
  const [showAll, setShowAll] = useState(false);
  const ranked = mode === "official" ? orderForMode(day.fires, "official") : rankedFires(day);
  if (ranked.length === 0) {
    return <p className="px-4 py-6 text-sm text-stone-600">No Priority 1 fires in West Kalimantan on this day.</p>;
  }
  const shown = showAll ? ranked : ranked.slice(0, 20);
  return (
    <div>
      <ol className="divide-y divide-stone-200">
        {shown.map((i) => {
          const f = day.fires[i];
          const active = i === selected;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-stone-100 ${active ? "bg-amber-50" : ""}`}
              >
                {mode === "official" ? (
                  <span className="w-8 shrink-0 text-xs font-semibold text-stone-500">P{f.tier}</span>
                ) : (
                  <span className={`w-8 shrink-0 font-semibold tabular-nums ${(f.rank as number) <= 10 ? "text-red-800" : "text-stone-500"}`}>
                    {f.rank}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{f.place ?? `${f.lat.toFixed(2)}, ${f.lon.toFixed(2)}`}</span>
                {mode === "downwind" && <span className="shrink-0 tabular-nums text-stone-600">{pct(f.share, 1)}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {ranked.length > 20 && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="w-full px-4 py-3 text-sm font-medium text-stone-700 underline-offset-2 hover:underline"
        >
          {showAll ? "Show top 20" : `Show all ${ranked.length}`}
        </button>
      )}
    </div>
  );
}
