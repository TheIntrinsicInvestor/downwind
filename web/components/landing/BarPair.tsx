// One comparison chart for the results section: two horizontal bars on a 0 to max axis, Downwind's in ember and the
// baseline in ink-3, values in mono at the bar ends, a hairline axis with ticks at 0, 0.5 and 1, and an optional
// bracket under the baseline bar for the gain's range. Inline SVG that scales with its container; the geometry
// comes from lib/chart.ts. Title, reading and small print are HTML around it.

import { barWidth, gainBracket } from "@/lib/chart";

type Bar = { label: string; value: number };

const W = 400;          // viewBox width
const AXIS = 352;       // bar scale width, leaving room at the right for the value at the end of a full bar
const MONO = "var(--font-jetbrains-mono), ui-monospace, monospace";
const SANS = "var(--font-plex-sans), system-ui, sans-serif";

export default function BarPair({ title, a, b, max, bracket, reading, small }: {
  title: string; a: Bar; b: Bar; max: number;
  bracket?: { low: number; high: number };
  reading: string; small: string;
}) {
  const rows = [
    { bar: a, y: 0, fill: "var(--ember)", text: "var(--ink)" },
    { bar: b, y: 64, fill: "var(--ink-3)", text: "var(--ink-2)" },
  ];
  const br = bracket ? gainBracket(b.value, bracket.low, bracket.high, max, AXIS) : null;
  const axisY = br ? 168 : 118;
  const H = axisY + 24;
  const aria = `${a.label} ${a.value.toFixed(2)}, ${b.label} ${b.value.toFixed(2)}` +
    (bracket ? `. Gain over the baseline, 95% range ${bracket.low.toFixed(2)} to ${bracket.high.toFixed(2)}.` : ".");
  return (
    <figure className="m-0">
      <h3 className="font-display text-xl leading-snug text-ink lg:min-h-14">{title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} className="mt-6 block h-auto w-full overflow-visible">
        {rows.map(({ bar, y, fill, text }) => {
          const w = barWidth(bar.value, max, AXIS);
          return (
            <g key={bar.label}>
              <text x={0} y={y + 14} fontSize="14" fill="var(--ink-2)" fontFamily={SANS}>{bar.label}</text>
              <rect x={0} y={y + 24} width={w} height="26" fill={fill} />
              <text x={w + 8} y={y + 43} fontSize="16" fill={text} fontFamily={MONO}
                style={{ fontVariantNumeric: "tabular-nums lining-nums" }}>{bar.value.toFixed(2)}</text>
            </g>
          );
        })}
        {br && bracket && (
          <g>
            <path d={`M${br.x1} 122V130H${br.x2}V122`} stroke="var(--ember-hot)" strokeWidth="1.5" fill="none" />
            <text x={(br.x1 + br.x2) / 2} y={148} textAnchor="middle" fontSize="13" fill="var(--ember-hot)" fontFamily={MONO}>
              gain {bracket.low.toFixed(2)} to {bracket.high.toFixed(2)} (95% range)
            </text>
          </g>
        )}
        <line x1={0} x2={AXIS} y1={axisY} y2={axisY} stroke="var(--rule)" strokeWidth="1" />
        {[0, 0.5, 1].map((t) => {
          const x = barWidth(t * max, max, AXIS);
          return (
            <g key={t}>
              <line x1={x} x2={x} y1={axisY} y2={axisY + 5} stroke="var(--ink-3)" strokeWidth="1" />
              <text x={x} y={axisY + 19} fontSize="12" fill="var(--ink-3)" textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
                fontFamily={MONO}>{t === 0 ? "0" : t === 1 ? "1" : "0.5"}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-6">
        <p className="text-[15px] leading-relaxed text-ink">{reading}</p>
        <p className="figure mt-3 text-xs leading-relaxed text-ink-3">{small}</p>
      </figcaption>
    </figure>
  );
}
