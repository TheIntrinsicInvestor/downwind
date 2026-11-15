// The landing page's first screen (spec section 6, copy exact): eyebrow, headline, sub, two actions, and the figure
// strip read from the day file. Desktop: text column left over a legibility scrim, map right. Phone: the map shows
// in the top 55% (as in the story below) and the copy sits under it on the page background.

import { memo, type MouseEvent } from "react";
import Link from "next/link";
import type { StoryFacts } from "@/lib/story";
import { Arrow } from "./TopBar";

export type LoadStatus = "loading" | "ready" | "failed";

const num = (n: number) => n.toLocaleString("en-US");

export function OpenMapLink({ onOpenApp, className = "" }: { onOpenApp: () => void; className?: string }) {
  return (
    <Link href="/app" onClick={onOpenApp}
      className={`focus-ring inline-flex min-h-12 items-center gap-2.5 bg-ink px-6 text-[15px] font-medium tracking-[0.01em] text-bg transition-colors hover:bg-ink-2 ${className}`}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-ember shadow-[0_0_0_3px_rgb(229_57_27/0.22)]" aria-hidden="true" />
      Open the live map <Arrow />
    </Link>
  );
}

function Figures({ facts }: { facts: StoryFacts }) {
  const items = [
    { n: num(facts.nLocations), label: <>fire locations detected across the region</> },
    { n: num(facts.p1), label: <>Priority 1 fires in West Kalimantan</> },
    { n: num(facts.top10.length), hot: true,
      label: <>fires hold <span className="figure text-ember-hot">{facts.top10SharePct}</span> of the smoke over residents</> },
  ];
  return (
    <ul className="max-md:divide-y max-md:divide-rule max-md:border-y max-md:border-rule md:flex md:border-t md:border-rule md:pt-5">
      {items.map((it) => (
        <li key={it.n}
          className="flex items-baseline gap-4 py-3 md:mr-10 md:block md:border-r md:border-rule md:py-0 md:pr-10 md:last:mr-0 md:last:border-r-0 md:last:pr-0">
          <span className={`figure w-[4.25rem] shrink-0 text-2xl tracking-[-0.02em] md:w-auto md:text-[30px] ${it.hot ? "text-ember-hot" : "text-ink"}`}>
            {it.n}
          </span>{" "}
          <span className="text-[13px] leading-snug text-ink-3 md:mt-1.5 md:block md:max-w-[12.5rem]">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

type Props = {
  facts: StoryFacts | null; status: LoadStatus;
  onRetry: () => void; onOpenApp: () => void; onSeeHow: (e: MouseEvent<HTMLAnchorElement>) => void;
};

function Hero({ facts, status, onRetry, onOpenApp, onSeeHow }: Props) {
  return (
    <section aria-labelledby="hero-title" className="relative md:flex md:min-h-[max(100svh,640px)] md:flex-col">
      {/* Legibility scrim behind the text column and the figure strip (desktop; on phones the copy sits on --bg). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 max-md:hidden"
        style={{ background: "linear-gradient(90deg, rgb(239 230 212 / 0.97) 0%, rgb(239 230 212 / 0.94) 30%, rgb(239 230 212 / 0.6) 50%, rgb(239 230 212 / 0) 70%), linear-gradient(0deg, rgb(239 230 212 / 0.92) 0%, rgb(239 230 212 / 0) 26%)" }} />
      <div aria-hidden="true" className="h-[55svh] md:hidden" />

      <div className="pointer-events-auto relative bg-bg px-4 pb-8 pt-7 max-md:border-t max-md:border-rule md:flex-1 md:bg-transparent md:px-8 md:pb-10 md:pt-[clamp(7.5rem,19svh,10.5rem)] lg:px-16">
        <div data-hero-copy className="max-w-[35rem]">
          <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.14em] text-ochre">
            <span className="h-px w-7 bg-ochre" aria-hidden="true" />West Kalimantan peat fires
          </p>
          <h1 id="hero-title"
            className="mt-6 font-display text-[clamp(2.375rem,4.75vw,4.25rem)] font-light leading-[1.02] tracking-[-0.025em] text-ink [font-variation-settings:'opsz'_144] md:mt-7">
            The biggest fire is <em className="text-ember-hot">not</em> the one to fight first.
          </h1>
          <p className="mt-6 max-w-[31rem] text-base leading-relaxed text-ink-2 md:mt-7 md:text-lg md:leading-[1.6]">
            Downwind ranks West Kalimantan&apos;s Priority 1 peat fires by how many people their smoke will reach in the
            next 48 hours. It adds an order to Indonesia&apos;s official hotspot tiers. It does not replace them, and the
            task force decides.
          </p>
          <div className="mt-8 flex flex-wrap gap-3.5 md:mt-9">
            <OpenMapLink onOpenApp={onOpenApp} />
            <a href="#story" onClick={onSeeHow}
              className="focus-ring inline-flex min-h-12 items-center border border-ink/30 px-6 text-[15px] font-medium text-ink transition-colors hover:border-ink-3">
              See how it ranks
            </a>
          </div>
        </div>
      </div>

      <div data-hero-strip className="pointer-events-auto relative flex items-end justify-between gap-8 bg-bg px-4 pb-10 md:bg-transparent md:px-8 md:pb-12 lg:px-16">
        <div className="min-h-[5.5rem] w-full md:w-auto md:min-w-[40rem]">
          {status === "ready" && facts ? <Figures facts={facts} />
            : status === "failed" ? (
              <div role="alert" className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-rule pt-5">
                <p className="text-[15px] text-ink">The replay data could not be loaded.</p>
                <button type="button" onClick={onRetry}
                  className="focus-ring min-h-11 bg-ink px-5 text-[13px] font-semibold text-bg transition-colors hover:bg-ink-2">
                  Retry
                </button>
              </div>
            ) : (
              <p role="status" className="flex items-center gap-3 border-t border-rule pt-5 text-sm text-ink-3">
                <span className="h-2 w-2 rounded-full bg-ember" aria-hidden="true" />
                Loading replay data
              </p>
            )}
        </div>
        {status !== "failed" && (
          <p aria-hidden="true" className="label flex items-center gap-3.5 max-md:hidden">
            <span className="block h-11 w-px bg-ink/40" />Scroll
          </p>
        )}
      </div>
    </section>
  );
}

export default memo(Hero);
