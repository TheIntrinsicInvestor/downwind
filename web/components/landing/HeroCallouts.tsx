"use client";

// Two callouts on the hero (desktop only): a ring on the top-ranked fire and one on the biggest fire, each with a hairline
// leader and a small paper card. The map is the one fixed, full-viewport MapLibre map, so map.project() gives fixed
// viewport coordinates. Positions are written straight to the DOM on the map's move and resize events (no React renders
// per frame). A callout hides when it would sit off screen, under the text column, behind the figure strip or the top
// bar, or on the other callout; all callouts hide once the page has scrolled a fifth of the hero. Text comes from
// StoryFacts only.

import { useEffect, useRef } from "react";
import type { Day } from "@/lib/replay";
import { type StoryFacts, ordinal } from "@/lib/story";
import { useReplay } from "../ReplayProvider";

const CARD_W = 248;                 // the card's max width; its real size is measured for the clear-space test
const LEAD = 44;                    // horizontal leader length, from the ring to the card's corner
const RISE = 44, DROP = 92;        // vertical leader length: up-right card, down-left card (clears the hero buttons)
// Clear space: a card keeps GAP px from the hero's copy block and figure strip (both measured), and stays below the
// top bar and inside the viewport edge.
const GAP = 12, RING = 11, BAR = 80, EDGE = 12;
const hits = (a: Rect, b: Rect) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const grow = (a: Rect, d: number): Rect => ({ l: a.l - d, t: a.t - d, r: a.r + d, b: a.b + d });
const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null;
  const q = el.getBoundingClientRect();
  return { l: q.left, t: q.top, r: q.right, b: q.bottom };
};

type Spec = { key: "top" | "biggest"; lon: number; lat: number; up: boolean };   // up: card up-right, else down-left
type Rect = { l: number; t: number; r: number; b: number };

export default function HeroCallouts({ day, facts }: { day: Day | null; facts: StoryFacts | null }) {
  const { getMap, mapReady } = useReplay();
  const topRef = useRef<HTMLDivElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = getMap();
    if (!map || !day || !facts) return;
    const tf = day.fires[facts.top.i], bf = day.fires[facts.biggest.i];
    if (!tf || !bf) return;
    const specs: [Spec, React.RefObject<HTMLDivElement | null>][] = [
      [{ key: "top", lon: tf.lon, lat: tf.lat, up: true }, topRef],
      [{ key: "biggest", lon: bf.lon, lat: bf.lat, up: false }, bigRef],
    ];
    let raf = 0;

    const update = () => {
      raf = 0;
      const W = window.innerWidth, H = window.innerHeight;
      const hero = document.getElementById("hero-title")?.closest("section");
      const heroH = hero?.getBoundingClientRect().height ?? H;
      const active = W >= 768 && window.scrollY < heroH * 0.2;   // gone before the next section rises under the cards
      const box = map.getContainer().getBoundingClientRect();
      // Text the cards must never cover: the copy block and the figure strip (missing rects count as nothing to avoid).
      const keepOut = [rectOf(document.querySelector("[data-hero-copy]")), rectOf(document.querySelector("[data-hero-strip]"))]
        .filter((q): q is Rect => q !== null);
      const taken: Rect[] = [];
      for (const [s, ref] of specs) {
        const el = ref.current;
        if (!el) continue;
        let show = false;
        if (active) {
          const p = map.project([s.lon, s.lat]);
          const x = p.x + box.left, y = p.y + box.top;
          // The card's real size (visibility:hidden still lays it out).
          const body = el.lastElementChild as HTMLElement;
          const cw = body.offsetWidth, ch = body.offsetHeight;
          const card: Rect = s.up
            ? { l: x + LEAD, t: y - RISE - ch, r: x + LEAD + cw, b: y - RISE }
            : { l: x - LEAD - cw, t: y + DROP, r: x - LEAD, b: y + DROP + ch };
          const ring: Rect = { l: x - RING, t: y - RING, r: x + RING, b: y + RING };
          const padded = grow(card, GAP);
          // The fire and its card sit inside the viewport, clear of the text, and the cards do not touch each other.
          show = ring.l >= EDGE && ring.r <= W - EDGE && ring.t >= BAR && ring.b <= H - EDGE &&
            card.l >= EDGE && card.r <= W - EDGE && card.t >= BAR && card.b <= H - EDGE &&
            !keepOut.some((q) => hits(padded, q) || hits(ring, q)) &&
            !taken.some((q) => hits(card, q));
          if (show) {
            taken.push(card);
            el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          }
        }
        el.style.visibility = show ? "visible" : "hidden";
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

    update();
    map.on("move", schedule);
    map.on("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      map.off("move", schedule);
      map.off("resize", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [getMap, mapReady, day, facts]);

  if (!facts) return null;
  const { top, biggest, p1 } = facts;
  return (
    // z-[1]: above the hero's bone veil (which would wash the cards out); the clear-space test keeps them off the text.
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] max-md:hidden">
      <Callout wrapRef={topRef} up hot tag={`${top.place} · ranked 1st`} headline={`${top.frp.toFixed(1)} MW`}
        sub={`${top.sharePct} of the day's smoke over residents`} />
      <Callout wrapRef={bigRef} up={false} hot={false} tag={`${biggest.place} · biggest in Priority 1`}
        headline={`${biggest.frp.toFixed(1)} MW, ranked only ${ordinal(biggest.rank)} of ${p1.toLocaleString("en-US")}`}
        sub={`${biggest.sharePct} of the day's smoke over residents`} />
    </div>
  );
}

function Callout({ wrapRef, up, hot, tag, headline, sub }: {
  wrapRef: React.RefObject<HTMLDivElement | null>; up: boolean; hot: boolean; tag: string; headline: string; sub: string;
}) {
  const edge = hot ? "border-ember-hot" : "border-ink";
  const rise = up ? RISE : DROP;
  return (
    <div ref={wrapRef} className="absolute left-0 top-0 invisible will-change-transform">
      <span className={`absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full border ${edge}`} />
      {/* Leader from the ring's edge to the card's near corner: up-right, or down-left. */}
      <svg width={LEAD} height={rise} className="absolute overflow-visible"
        style={{ left: up ? 0 : -LEAD, top: up ? -rise : 0 }}>
        {up
          ? <line x1="8" y1={rise - 8} x2={LEAD} y2="0" stroke="#2A1D12" strokeWidth="1" />
          : <line x1={LEAD - 6} y1="10" x2="0" y2={rise} stroke="#2A1D12" strokeWidth="1" />}
      </svg>
      <div className={`absolute w-max border-l-[3px] ${edge} bg-panel px-3 py-2 shadow-[0_6px_24px_rgb(80_55_30/0.12)]`}
        style={{ maxWidth: CARD_W, ...(up ? { left: LEAD, bottom: rise } : { right: LEAD, top: rise }) }}>
        <p className="font-mono text-[10px] uppercase leading-tight tracking-[0.12em] text-ink-3">{tag}</p>
        <p className={`mt-1 font-display text-[19px] font-light leading-tight ${hot ? "text-ember-hot" : "text-ink"}`}>{headline}</p>
        <p className="mt-1 font-mono text-[11px] leading-tight text-ink-2">{sub}</p>
      </div>
    </div>
  );
}
