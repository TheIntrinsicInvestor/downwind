"use client";

// The five-beat story (spec section 6) over the shared map. Scroll position alone decides the beat: a passive,
// requestAnimationFrame-throttled listener turns it into progress, beatAt picks the beat, and on a change the beat's
// mode, focus, frame and camera go to the provider. Nothing is carried over from the previous beat, so reload, reverse
// or a fast fling cannot leave the map stale. Above the story the hero view applies (the official beat's camera in the
// Downwind view). Desktop: one viewport per beat, the card scrolls over the map and lights up as it reaches the beat
// line. Under 768 px: the map stays in the top 55%, the cards cross-fade in a panel below it, the camera jumps, and the
// smoke does not follow scroll (also with reduced motion).

import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { type Day, localLabel } from "@/lib/replay";
import { officialColor } from "@/lib/mapstyle";
import { type Beat, type BeatId, type Camera, type StoryFacts, FIRE_OFFSET_PX, beatAt, offsetCamera, ordinal } from "@/lib/story";
import { useReplay } from "../ReplayProvider";
import BeatCard from "./BeatCard";
import RankTable from "./RankTable";
import { OpenMapLink } from "./Hero";

const WIDE = "(min-width: 768px)";
const REDUCED = "(prefers-reduced-motion: reduce)";
const PROBE = 0.35;            // desktop: a beat starts when its section's top crosses 35% down the viewport
const PHONE_MAP_SHARE = 0.55;  // phone: the map's share of the viewport height
const PHONE_BAR_PX = 56;       // phone: the top bar over the map
const STILL_TOP_FRAME = 36;    // the top beat's hour when the smoke does not follow scroll

function useMedia(query: string, server: boolean): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => server,
  );
}

// Desktop: the beat's subject sits in the middle of the map area right of the text column (story.ts already moves fire
// cameras FIRE_OFFSET_PX west, so only the rest is added). Phone: the subject sits in the middle of the visible map.
function cameraFor(b: Beat, wide: boolean, vh: number, colRight: number): Camera {
  if (wide) return offsetCamera(b.camera, colRight / 2 - (b.id === "biggest" || b.id === "top" ? FIRE_OFFSET_PX : 0), 0);
  return offsetCamera(b.cameraPhone, 0, (PHONE_BAR_PX + PHONE_MAP_SHARE * vh) / 2 - vh / 2);
}

function TierTable({ facts }: { facts: StoryFacts }) {
  return (
    <>
      <ul className="mt-5 divide-y divide-rule border-y border-rule text-sm">
        {([[1, facts.p1], [2, facts.p2], [3, facts.p3]] as const).map(([t, n]) => {
          const c = `rgb(${officialColor(t).join(",")})`;
          return (
            <li key={t} className="flex items-center gap-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} aria-hidden="true" />
              <span className="flex-1 text-ink">Priority {t}</span>
              <span className="figure text-ink">{n.toLocaleString("en-US")}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">Tiers follow P.8/2018, Pasal 9. The cluster size of 3 is our own.</p>
    </>
  );
}

const SmokeClock = memo(function SmokeClock({ day, frame }: { day: Day; frame: number }) {
  return (
    <p className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule pt-3">
      <span className="label whitespace-nowrap">Smoke shown</span>
      <span className="figure whitespace-nowrap text-xs text-ink-2 md:text-[13px]">{localLabel(day.window_start_utc, frame)}</span>
    </p>
  );
});

type Props = {
  day: Day | null; beats: Beat[] | null; facts: StoryFacts | null;
  beatRef: RefObject<number>; onOpenApp: () => void;
};

export default function Story({ day, beats, facts, beatRef, onOpenApp }: Props) {
  const { setMode, setStoryFocus, setFrame, flyTo, mapReady, frame } = useReplay();
  const wide = useMedia(WIDE, true);
  const reduced = useMedia(REDUCED, false);
  const [active, setActive] = useState(-1);
  const deskRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const railBoxRef = useRef<HTMLDivElement>(null);
  const hours = day?.hours ?? 0;

  useEffect(() => {
    const el = wide ? deskRef.current : phoneRef.current;
    if (!beats || !el) return;
    const hero: Beat = { ...beats[1], mode: "downwind", focus: null };   // above the story: the official beat's view
    const scrub = wide && !reduced;
    let shown = NaN;       // beat index last applied; NaN forces the next update to apply, with a jump
    let shownFrame = -1;
    let raf = 0;

    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = wide ? (PROBE * vh - r.top) / r.height : -r.top / (r.height - vh);
      if (!Number.isFinite(p) || r.height <= vh) return;     // hidden or not laid out yet
      const before = wide ? p < 0 : r.top > 0;
      const { index: i, local } = beatAt(p);
      const index = before ? -1 : i;
      if (railBoxRef.current) railBoxRef.current.style.opacity = p >= 0 && p <= 1 ? "1" : "0";   // only while the story is on screen
      if (railRef.current) railRef.current.style.transform = `scaleY(${Math.min(1, Math.max(0, p))})`;

      const b = index < 0 ? hero : beats[index];
      if (index !== shown) {
        const jump = Number.isNaN(shown) || !wide || reduced;
        shown = index;
        shownFrame = -1;
        setMode(b.mode);
        setStoryFocus(b.focus);
        if (b.frame !== "scrub") setFrame(b.frame);
        else if (!scrub) setFrame(STILL_TOP_FRAME);
        flyTo(cameraFor(b, wide, vh, colRef.current?.getBoundingClientRect().right ?? 0), { instant: jump });
        beatRef.current = index;
        setActive(index);
      }
      if (b.frame === "scrub" && scrub && !before) {
        const f = Math.round(local * (hours - 1));
        if (f !== shownFrame) { shownFrame = f; setFrame(f); }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    const onResize = () => { shown = NaN; onScroll(); };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
    // mapReady: a map that becomes ready later (or is rebuilt) gets the current view again.
  }, [beats, hours, wide, reduced, mapReady, setMode, setStoryFocus, setFrame, flyTo, beatRef]);

  const emphasis = useMemo<Record<BeatId, string[]>>(() => {
    if (!facts) return { region: [], official: [], biggest: [], top: [], shortlist: [] };
    const n = (x: number) => x.toLocaleString("en-US");
    return {
      region: [n(facts.nLocations)],
      official: [n(facts.p1)],
      biggest: [`${facts.biggest.frp.toFixed(1)} MW`, `${ordinal(facts.biggest.rank)} of ${n(facts.p1)}`, facts.biggest.sharePct],
      top: [`${facts.top.frp.toFixed(1)} MW`, `${n(facts.top.people)} residents`, facts.top.sharePct],
      shortlist: [facts.top10SharePct],
    };
  }, [facts]);

  const extras = (b: Beat, variant: "float" | "flat"): ReactNode => {
    if (!day || !facts) return null;
    if (b.id === "official") return <TierTable facts={facts} />;
    if (b.id === "top") return <SmokeClock day={day} frame={frame} />;
    if (b.id === "shortlist") {
      return (
        <>
          {variant === "float" && <div className="mt-5"><RankTable day={day} fires={facts.top10} /></div>}
          <OpenMapLink onOpenApp={onOpenApp} className="mt-6" />
        </>
      );
    }
    return null;
  };
  const card = (b: Beat, k: number, variant: "float" | "flat") => (
    <BeatCard beat={b} variant={variant} emphasis={emphasis[b.id]}
      active={variant === "float" ? k === active : k === Math.max(active, 0)}>
      {extras(b, variant)}
    </BeatCard>
  );
  const ids = beats?.map((b) => b.id) ?? (["region", "official", "biggest", "top", "shortlist"] as BeatId[]);

  return (
    <div id="story" aria-label="How Downwind ranks the fires">
      {/* Desktop: one viewport per beat. The rail is pinned for the whole story and takes no space. */}
      <div ref={deskRef} className="relative max-md:hidden">
        <div ref={railBoxRef} aria-hidden="true" className="pointer-events-none sticky top-0 z-10 -mb-[100svh] h-svh opacity-0 transition-opacity duration-300">
          <div className="absolute right-8 top-1/2 flex -translate-y-1/2 gap-3 lg:right-12">
            <ol className="flex flex-col justify-between">
              {ids.map((id, k) => (
                <li key={id} className={`figure text-[11px] leading-none transition-colors duration-500 ${k === active ? "text-ember-hot" : "text-ink-3/70"}`}>
                  {String(k + 1).padStart(2, "0")}
                </li>
              ))}
            </ol>
            <div className="relative h-[34svh] w-px bg-rule">
              <div ref={railRef} className="absolute inset-0 origin-top bg-ember-hot" style={{ transform: "scaleY(0)" }} />
            </div>
          </div>
        </div>
        {ids.map((id, k) => (
          <div key={id} className="flex h-svh min-h-[700px] items-center px-8 lg:px-16">
            <div ref={k === 0 ? colRef : undefined} className="pointer-events-auto w-[min(31rem,100%)]">
              {beats && card(beats[k], k, "float")}
            </div>
          </div>
        ))}
      </div>

      {/* Phone: the map in the top 55%, the cards in a pinned panel under it, then the rank table. */}
      <div className="md:hidden">
        <div ref={phoneRef} className="relative h-[500svh]">
          <div className="sticky top-0 flex h-svh flex-col">
            <div aria-hidden="true" className="h-[55svh] shrink-0" />
            <div className="pointer-events-auto relative min-h-0 flex-1 overflow-hidden border-t border-rule bg-bg">
              <div aria-hidden="true" className="flex gap-1 px-4 pt-3">
                {ids.map((id, k) => (
                  <span key={id} className={`h-0.5 flex-1 transition-colors duration-300 ${k <= Math.max(active, 0) ? "bg-ember-hot" : "bg-rule"}`} />
                ))}
              </div>
              <div className="grid">
                {beats?.map((b, k) => <div key={b.id} className="[grid-area:1/1]">{card(b, k, "flat")}</div>)}
              </div>
            </div>
          </div>
        </div>
        {day && facts && (
          <div className="pointer-events-auto bg-bg px-4 pb-10">
            <RankTable day={day} fires={facts.top10} />
          </div>
        )}
      </div>
    </div>
  );
}
