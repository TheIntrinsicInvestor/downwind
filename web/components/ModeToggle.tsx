"use client";

// The view switch (Official tiers / Downwind order) and the note that goes with each view. The app shows the switch
// in its top bar and the note above the ranked list.

import { memo } from "react";
import { type Day, type Mode } from "@/lib/replay";
import { officialColor } from "@/lib/mapstyle";

// Legend swatches use the map's own palette, so the legend matches the dots.
const rgb = (t: 1 | 2 | 3) => `rgb(${officialColor(t).join(",")})`;

export const ModeSwitch = memo(function ModeSwitch({ mode, onMode, className = "" }:
  { mode: Mode; onMode: (m: Mode) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Ranking view" className={`panel grid grid-cols-2 gap-0.5 p-0.5 ${className}`}>
      {(["official", "downwind"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onMode(m)}
          className={`focus-ring-inset min-h-9 whitespace-nowrap px-3 text-[13px] font-medium transition-colors max-md:min-h-11 ${
            mode === m
              ? m === "official" ? "bg-official/15 text-ink shadow-[inset_0_-2px_0_var(--official)]" : "bg-ember/15 text-ink shadow-[inset_0_-2px_0_var(--ember)]"
              : "text-ink-3 hover:bg-white/5 hover:text-ink"}`}
        >
          {m === "official" ? "Official tiers" : "Downwind order"}
        </button>
      ))}
    </div>
  );
});

export const ModeNote = memo(function ModeNote({ mode, day }: { mode: Mode; day: Day }) {
  const { p1, p2, p3 } = day.counts;
  if (mode !== "official") {
    return (
      <p className="text-[13px] leading-relaxed text-ink-2">
        Downwind&apos;s order inside Priority 1. An extra layer on the official rule; the task force decides.
      </p>
    );
  }
  return (
    <div className="text-[13px] leading-relaxed">
      <ul className="divide-y divide-rule border-b border-rule">
        {([[1, p1], [2, p2], [3, p3]] as const).map(([t, n]) => (
          <li key={t} className="flex items-center gap-2.5 py-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: rgb(t), boxShadow: `0 0 8px ${rgb(t)}` }} />
            <span className="flex-1 text-ink">Priority {t}</span>
            <span className="figure text-ink">{n.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-ink-2">
        Tiers follow P.8/2018, Pasal 9: {p1.toLocaleString("en-US")} fires share Priority 1, with no order among them.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        Priority 1 is a fire on peat that is also in a cluster of 3 or more detections or seen 3 days running. The regulation gives no cluster size, so that number is ours. Two of its inputs are not computed here, smoke visible on imagery and its listed land uses, so the full count would be higher. Satellite &quot;low&quot; confidence stands in for the rule&apos;s &quot;under 30%&quot;, an approximation.
      </p>
    </div>
  );
});
