// The landing page's first screen: eyebrow, headline, sub, two actions, and the stakes strip (why the order matters:
// three published figures with their sources). Desktop: text column left over a legibility scrim, map right. Phone: the map shows
// in the top 55% (as in the story below) and the copy sits under it on the page background.

import { memo, type MouseEvent } from "react";
import Link from "next/link";
import { Arrow } from "./TopBar";

export type LoadStatus = "loading" | "ready" | "failed";


export function OpenMapLink({ onOpenApp, className = "" }: { onOpenApp: () => void; className?: string }) {
  return (
    <Link href="/app" onClick={onOpenApp}
      className={`focus-ring inline-flex min-h-12 items-center gap-2.5 bg-ink px-6 text-[15px] font-medium tracking-[0.01em] text-bg transition-colors hover:bg-ink-2 ${className}`}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-ember shadow-[0_0_0_3px_rgb(229_57_27/0.22)]" aria-hidden="true" />
      Open the live map <Arrow />
    </Link>
  );
}

const STAKES = [
  { n: "425,167", label: <>respiratory infections linked to the fires, 95,627 in children under five</> },
  { n: "~3,560", hot: true, label: <>deaths in September estimated to have been caused by short-term smoke exposure</> },
];

// Why the order matters: one sentence tying the harm to the ranking, then the two figures and their sources.
function Stakes() {
  return (
    <div className="border-t border-rule pt-5">
      <p className="label">Why the order matters</p>
      <p className="mt-2 max-w-[52rem] text-[15px] leading-relaxed text-ink-2">
        The harm comes from smoke reaching people, and from peat that keeps burning. Downwind orders the fires by the
        first of these: how many people their smoke will reach.
      </p>
      <ul className="mt-4 max-md:divide-y max-md:divide-rule max-md:border-y max-md:border-rule md:flex">
        {STAKES.map((it) => (
          <li key={it.n}
            className="flex items-baseline gap-4 py-3 md:mr-10 md:block md:border-r md:border-rule md:py-0 md:pr-10 md:last:mr-0 md:last:border-r-0 md:last:pr-0">
            <span className={`figure w-[5.5rem] shrink-0 text-2xl tracking-[-0.02em] md:w-auto md:text-[30px] ${it.hot ? "text-ember-hot" : "text-ink"}`}>
              {it.n}
            </span>{" "}
            <span className="text-[13px] leading-snug text-ink-3 md:mt-1.5 md:block md:max-w-[13.5rem]">{it.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        This fire season, national figures. Sources: Indonesian Ministry of Health to 5 November 2026 (via Bloomberg
        Technoz); CREA, 29 October 2026.
      </p>
    </div>
  );
}

type Props = {
  status: LoadStatus;
  onRetry: () => void; onOpenApp: () => void; onSeeHow: (e: MouseEvent<HTMLAnchorElement>) => void;
};

function Hero({ status, onRetry, onOpenApp, onSeeHow }: Props) {
  return (
    <section aria-labelledby="hero-title" className="relative md:flex md:min-h-[max(100svh,640px)] md:flex-col">
      {/* Legibility scrim behind the text column and the figure strip (desktop; on phones the copy sits on --bg). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 max-md:hidden"
        style={{ background: "linear-gradient(90deg, rgb(239 230 212 / 0.97) 0%, rgb(239 230 212 / 0.94) 30%, rgb(239 230 212 / 0.6) 50%, rgb(239 230 212 / 0) 70%), linear-gradient(0deg, rgb(239 230 212 / 0.92) 0%, rgb(239 230 212 / 0) 26%)" }} />
      <div aria-hidden="true" className="h-[55svh] md:hidden" />

      <div className="pointer-events-auto relative bg-bg px-4 pb-8 pt-7 max-md:border-t max-md:border-rule md:flex-1 md:bg-transparent md:px-8 md:pb-8 md:pt-[clamp(6rem,14svh,8.5rem)] lg:px-16">
        <div data-hero-copy className="max-w-[35rem]">
          <p className="flex items-center gap-3 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-ochre">
            <span className="h-px w-7 bg-ochre" aria-hidden="true" />West Kalimantan peat fires
          </p>
          <h1 id="hero-title"
            className="mt-6 font-display text-[clamp(2.375rem,4.75vw,4.25rem)] font-medium leading-[1.04] tracking-[-0.015em] text-ink [font-variation-settings:'opsz'_72] md:mt-7">
            The biggest fire is <em className="text-ember-hot">not</em> the one to fight first.
          </h1>
          <p className="mt-6 max-w-[31rem] text-base leading-relaxed text-ink-2 md:mt-7 md:text-lg md:leading-[1.6]">
            Downwind ranks West Kalimantan&apos;s Priority 1 peat fires by how many people their smoke will reach in the
            next 48 hours, putting in order the fires that Indonesia&apos;s official tiers leave unranked. The fire task
            force sees which fires to send crews to first; district offices see when smoke will reach their schools and
            clinics.
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

      <div data-hero-strip className="pointer-events-auto relative flex items-end justify-between gap-8 bg-bg px-4 pb-10 md:bg-transparent md:px-8 md:pb-8 lg:px-16">
        <div className="w-full md:w-auto md:min-w-[40rem] md:max-w-[52rem]">
          <Stakes />
          {status === "failed" && (
            <div role="alert" className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-rule pt-5">
              <p className="text-[15px] text-ink">The replay data could not be loaded.</p>
              <button type="button" onClick={onRetry}
                className="focus-ring min-h-11 bg-ink px-5 text-[13px] font-semibold text-bg transition-colors hover:bg-ink-2">
                Retry
              </button>
            </div>
          )}
          {status === "loading" && (
            <p role="status" className="mt-4 flex items-center gap-3 text-sm text-ink-3">
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
