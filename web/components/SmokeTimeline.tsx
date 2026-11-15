"use client";

import { useId, useState } from "react";
import { forecastTime } from "@/lib/replay";
import {
  REF_LEVEL, areaPath, clockTicks, fmtLevel, hasSmoke, indexAtX, linePath, midnights, nightSpans, niceMax, peakIndex, xAt, yAt, type Box,
} from "@/lib/timeline";

// Drawn at 320 units wide and scaled to the panel, so it fits a 360 px phone with no overflow.
const B: Box = { w: 320, h: 156, left: 30, right: 8, top: 14, bottom: 24 };
const MONO = "var(--font-public-sans), system-ui, sans-serif";   // chart figures in the text face (tabular numbers)
const SURFACE = "#F3ECDE";

type Props = { windowStartUtc: string; values: number[] };

export default function SmokeTimeline({ windowStartUtc, values }: Props) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;

  if (!hasSmoke(values)) {
    return <p className="mt-4 text-ink-2">No modelled smoke over residents here in the 48 hours.</p>;
  }

  const peak = peakIndex(values);
  const max = niceMax(Math.max(...values));
  const peakText = forecastTime(windowStartUtc, peak);
  const shown = hover ?? peak;
  const summary = hover === null
    ? `Highest: ${peakText}, level ${fmtLevel(values[peak])}`
    : `${forecastTime(windowStartUtc, hover)}: level ${fmtLevel(values[hover])}`;
  const showRef = max >= REF_LEVEL;
  const yTicks = showRef && max > REF_LEVEL ? [0, REF_LEVEL, max] : [0, max];

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(indexAtX(((e.clientX - r.left) / r.width) * B.w, n, B));
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHover(Math.min(n - 1, (hover ?? peak) + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setHover(Math.max(0, (hover ?? peak) - 1)); }
    else if (e.key === "Escape") setHover(null);
  };

  const px = xAt(shown, n, B), py = yAt(values[shown], max, B);
  const base = yAt(0, max, B);

  return (
    <div className="mt-4">
      <div className="label">Smoke level over residents, by hour</div>
      <p className="figure mt-1 text-[13px] text-ink" aria-live="polite">{summary}</p>
      <svg
        viewBox={`0 0 ${B.w} ${B.h}`}
        className="focus-ring mt-1 block h-auto w-full touch-pan-y select-none"
        role="img"
        tabIndex={0}
        aria-label={`Smoke level by hour; highest ${peakText} at level ${fmtLevel(values[peak])}`}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={key}
      >
        <defs>
          <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ember)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--ember)" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {nightSpans(windowStartUtc, n).map(([a, b], i) => (
          <rect key={i} x={xAt(a, n, B)} y={B.top} width={xAt(b, n, B) - xAt(a, n, B)} height={base - B.top} fill="var(--ink)" opacity="0.05" />
        ))}

        {yTicks.map((t) => (
          <g key={t}>
            {t !== REF_LEVEL && t !== 0 && <line x1={B.left} x2={B.w - B.right} y1={yAt(t, max, B)} y2={yAt(t, max, B)} stroke="var(--rule)" strokeWidth="1" />}
            <text x={B.left - 5} y={yAt(t, max, B) + 3} textAnchor="end" fontSize="9.5" fill="var(--ink-3)" fontFamily={MONO}>{t}</text>
          </g>
        ))}
        <line x1={B.left} x2={B.w - B.right} y1={base} y2={base} stroke="var(--rule)" strokeWidth="1" />

        {showRef && (
          <>
            <line x1={B.left} x2={B.w - B.right} y1={yAt(REF_LEVEL, max, B)} y2={yAt(REF_LEVEL, max, B)} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="4 3" />
            <text x={B.w - B.right} y={yAt(REF_LEVEL, max, B) - 4} textAnchor="end" fontSize="9.5" fill="var(--ink-3)" fontFamily={MONO}>Sep worst hour</text>
          </>
        )}

        {midnights(windowStartUtc, n).map((m) => (
          <g key={m.h}>
            <line x1={xAt(m.h, n, B)} x2={xAt(m.h, n, B)} y1={B.top} y2={base + 4} stroke="var(--ink-3)" strokeWidth="1" opacity="0.7" />
            <text x={xAt(m.h, n, B)} y={B.h - 4} textAnchor="middle" fontSize="9.5" fill="var(--ink-2)" fontFamily={MONO}>{m.label}</text>
          </g>
        ))}
        {clockTicks(windowStartUtc, n).filter((t) => xAt(t.h, n, B) < B.w - 16).map((t) => (
          <g key={t.h}>
            <line x1={xAt(t.h, n, B)} x2={xAt(t.h, n, B)} y1={base} y2={base + 3} stroke="var(--ink-3)" strokeWidth="1" />
            <text x={xAt(t.h, n, B)} y={B.h - 4} textAnchor="middle" fontSize="9.5" fill="var(--ink-3)" fontFamily={MONO}>{t.label}</text>
          </g>
        ))}

        <path d={areaPath(values, max, B)} fill={`url(#${gid}-fill)`} />
        <path d={linePath(values, max, B)} fill="none" stroke="var(--ember-hot)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />

        {hover !== null && <line x1={px} x2={px} y1={B.top} y2={base} stroke="var(--ink-2)" strokeWidth="1" />}
        <circle cx={px} cy={py} r="4" fill="var(--ember-core)" stroke={SURFACE} strokeWidth="2" />
      </svg>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        Relative level: 100 = the worst hour any place had in the 18 to 20 Sep 2026 haze. Times are WIB and approximate. Not a
        measured concentration or a health threshold.
      </p>
    </div>
  );
}
