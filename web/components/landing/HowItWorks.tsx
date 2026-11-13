// How it works (spec section 6): six numbered steps, each a small line glyph (ink-2 with one ember accent), a title
// and one sentence. Steps 3 and 6 are the AI steps and carry a small "AI" tag. The glyphs are plain inline SVG on a
// 40 px grid, 1.5 px stroke, so they share one weight.

import { memo, type ReactNode } from "react";

const G = { width: 40, height: 40, viewBox: "0 0 40 40", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const EMBER = "var(--ember)";

// Detect: a satellite above a dot grid, one dot lit.
const detect = (
  <svg {...G} aria-hidden="true">
    <rect x="15" y="6" width="10" height="7" rx="1" />
    <path d="M15 9.5H8M25 9.5H32M20 13v4" />
    {[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => (
      r === 1 && c === 2 ? null : <circle key={`${r}${c}`} cx={10 + c * 6.7} cy={25 + r * 5} r="0.9" fill="currentColor" stroke="none" />
    )))}
    <circle cx={10 + 2 * 6.7} cy={30} r="2.2" fill={EMBER} stroke="none" />
  </svg>
);

// Tier: three stacked bars, the top one lit.
const tier = (
  <svg {...G} aria-hidden="true">
    <rect x="7" y="8" width="26" height="6" rx="1" stroke={EMBER} />
    <rect x="7" y="17" width="20" height="6" rx="1" />
    <rect x="7" y="26" width="13" height="6" rx="1" />
  </svg>
);

// Persist: a loop arrow with a lit dot, the fire seen again.
const persist = (
  <svg {...G} aria-hidden="true">
    <path d="M30 14a12 12 0 1 0 2 8" />
    <path d="M31 7v7.5h-7.5" />
    <circle cx="20" cy="20" r="3" fill={EMBER} stroke="none" />
  </svg>
);

// Carry: three wind streaks with a lit fire dot at the start.
const carry = (
  <svg {...G} aria-hidden="true">
    <circle cx="8" cy="20" r="2.4" fill={EMBER} stroke="none" />
    <path d="M14 12h14a4 4 0 1 0-4-4" />
    <path d="M14 20h18a4 4 0 1 1-4 4" />
    <path d="M14 29h10a3.5 3.5 0 1 1-3.5 3.5" />
  </svg>
);

// Count: a plume over a small group of dots, one lit.
const count = (
  <svg {...G} aria-hidden="true">
    <path d="M6 20c3-9 8-12 14-12s11 3 14 12" />
    <path d="M10 20c2.5-6 6-8 10-8s7.5 2 10 8" />
    {[[11, 29], [17, 32], [23, 29], [29, 32], [14, 35], [26, 35]].map(([x, y]) => (
      <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="currentColor" stroke="none" />
    ))}
    <circle cx="20" cy="29" r="2" fill={EMBER} stroke="none" />
  </svg>
);

// Brief: lines of text with a lit heading line.
const brief = (
  <svg {...G} aria-hidden="true">
    <rect x="8" y="5" width="24" height="30" rx="1.5" />
    <path d="M13 12h10" stroke={EMBER} strokeWidth="2.5" />
    <path d="M13 19h14M13 24h14M13 29h8" />
  </svg>
);

const STEPS: { title: string; text: string; glyph: ReactNode; ai?: boolean }[] = [
  { title: "Detect", text: "Satellite fire detections (NASA FIRMS, VIIRS).", glyph: detect },
  { title: "Tier", text: "The official P.8/2018 tiers (Pasal 9).", glyph: tier },
  { title: "Persist", text: "A learned model estimates each fire's likelihood of being seen again tomorrow.", glyph: persist, ai: true },
  { title: "Carry", text: "The morning's ECMWF wind forecast moves simulated smoke for 48 hours.", glyph: carry },
  { title: "Count", text: "Smoke is laid over where residents live (WorldPop), Indonesian places only.", glyph: count },
  { title: "Brief", text: "A language model writes the morning bulletin from checked figures.", glyph: brief, ai: true },
];

function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 border-t border-rule px-5 py-20 sm:px-10 lg:px-16 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="dateline">How it works</p>
        <h2 id="how-title" className="mt-4 max-w-2xl font-display text-3xl leading-tight text-ink sm:text-4xl">
          From detection to the morning list
        </h2>
        <ol className="mt-12 grid grid-cols-2 gap-x-6 gap-y-12 border-t border-rule pt-12 lg:grid-cols-6 lg:gap-x-8">
          {STEPS.map((s, k) => (
            <li key={s.title}>
              <div className="flex items-start justify-between">
                <span className="text-ink-2">{s.glyph}</span>
                {s.ai && <span className="label border border-ember px-1.5 text-ember" title="Uses an AI model">AI</span>}
              </div>
              <p className="mt-5 flex items-baseline gap-2.5">
                <span className="font-display text-2xl text-ember-hot">{k + 1}</span>
                <span className="font-display text-xl text-ink">{s.title}</span>
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default memo(HowItWorks);
