"use client";

// Two callouts on the hero (desktop only): a ring on the top-ranked fire and one on the biggest fire, each with a hairline
// leader and a small paper card. The map is the one fixed, full-viewport MapLibre map, so map.project() gives fixed
// viewport coordinates. Positions are written straight to the DOM on the map's move and resize events (no React renders
// per frame). Each card tries the PLACES in order and takes the first that stays on screen, off the text column and the
// figure strip's text, below the top bar, and clear of both rings and the other card; with none free it hides. The
// callouts fade out with scroll, gone by a fifth of the hero. Text comes from StoryFacts only.

import { useEffect, useRef } from "react";
import type { Day } from "@/lib/replay";
import { type StoryFacts, ordinal } from "@/lib/story";
import { useReplay } from "../ReplayProvider";

const CARD_W = 248;                 // the card's max width; its real size is measured for the clear-space test
// Where a card may sit, tried in order: sx/sy pick the side (sy -1 = above the ring), dx/dy the leader's run and rise to
// the card's near corner. Cards go above the fires first, never down-right: the fire chain runs south-east of both
// rings and a card there hides it. The tall up-right one stacks the second card above the first when the two fires are
// close; down-left (92 px, clears the hero buttons) is the last resort.
type Place = { sx: 1 | -1; sy: 1 | -1; dx: number; dy: number };
const PLACES: Place[] = [
  { sx: 1, sy: -1, dx: 44, dy: 24 },
  { sx: 1, sy: -1, dx: 44, dy: 180 },
  { sx: -1, sy: -1, dx: 44, dy: 24 },
  { sx: -1, sy: 1, dx: 44, dy: 92 },
];
// Clear space: a card keeps GAP px from the hero's copy block, the figure strip's text (both measured), the rings and
// the other card, and stays below the top bar and inside the viewport edge.
const GAP = 12, RING = 11, BAR = 80, EDGE = 12;
const hits = (a: Rect, b: Rect) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const grow = (a: Rect, d: number): Rect => ({ l: a.l - d, t: a.t - d, r: a.r + d, b: a.b + d });
const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null;
  const q = el.getBoundingClientRect();
  return { l: q.left, t: q.top, r: q.right, b: q.bottom };
};

type Spec = { lon: number; lat: number };
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
      [{ lon: tf.lon, lat: tf.lat }, topRef],
      [{ lon: bf.lon, lat: bf.lat }, bigRef],
    ];
    let raf = 0;

    const update = () => {
      raf = 0;
      const W = window.innerWidth, H = window.innerHeight;
      const hero = document.getElementById("hero-title")?.closest("section");
      const heroH = hero?.getBoundingClientRect().height ?? H;
      // Cards fade with scroll and are gone by a fifth of the hero, before the next section rises under them.
      const fade = Math.min(1, Math.max(0, 1 - window.scrollY / (heroH * 0.2)));
      const active = W >= 768 && fade > 0;
      const box = map.getContainer().getBoundingClientRect();
      // Text the cards must never cover: the copy block and each block inside the figure strip (the strip itself spans
      // the full width, but its text stops well short of the map; missing rects count as nothing to avoid). Measured
      // where it sits at the top of the page, so the text scrolling past cannot pop a card off mid-fade.
      const sy = window.scrollY;
      const strip = document.querySelector("[data-hero-strip]");
      const keepOut = [rectOf(document.querySelector("[data-hero-copy]")), ...[...(strip?.children ?? [])].map(rectOf)]
        .filter((q): q is Rect => q !== null).map((q) => ({ ...q, t: q.t + sy, b: q.b + sy }));
      const pts = specs.map(([s]) => {
        const p = map.project([s.lon, s.lat]);
        return { x: p.x + box.left, y: p.y + box.top };
      });
      const rings = pts.map(({ x, y }): Rect => ({ l: x - RING, t: y - RING, r: x + RING, b: y + RING }));
      const taken: Rect[] = [...rings];   // cards stay off both rings and off a card already placed
      specs.forEach(([, ref], k) => {
        const el = ref.current;
        if (!el) return;
        const { x, y } = pts[k], ring = rings[k];
        // The card's real size (visibility:hidden still lays it out).
        const body = el.lastElementChild as HTMLElement;
        const cw = body.offsetWidth, ch = body.offsetHeight;
        const ringOk = active && ring.l >= EDGE && ring.r <= W - EDGE && ring.t >= BAR && ring.b <= H - EDGE &&
          !keepOut.some((q) => hits(ring, q));
        const fit = !ringOk ? undefined : PLACES.find((pl) => {
          const card = cardRect(pl, x, y, cw, ch), padded = grow(card, GAP);
          return card.l >= EDGE && card.r <= W - EDGE && card.t >= BAR && card.b <= H - EDGE &&
            !keepOut.some((q) => hits(padded, q)) && !taken.some((q, j) => j !== k && hits(padded, q));
        });
        if (fit) {
          taken.push(cardRect(fit, x, y, cw, ch));
          // Card and leader are placed relative to the ring; the leader runs from the ring's edge to the card's corner.
          body.style.left = `${fit.sx > 0 ? fit.dx : -fit.dx - cw}px`;
          body.style.top = `${fit.sy < 0 ? -fit.dy - ch : fit.dy}px`;
          const ex = fit.sx * fit.dx, ey = fit.sy * fit.dy, len = Math.hypot(ex, ey);
          const line = el.querySelector("line");
          line?.setAttribute("x1", ((ex / len) * (RING + 2)).toFixed(1));
          line?.setAttribute("y1", ((ey / len) * (RING + 2)).toFixed(1));
          line?.setAttribute("x2", String(ex));
          line?.setAttribute("y2", String(ey));
          el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          el.style.opacity = fade.toFixed(3);
        }
        el.style.visibility = fit ? "visible" : "hidden";
      });
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
  const { top, biggest } = facts;
  return (
    // z-[1]: above the hero's bone veil (which would wash the cards out); the clear-space test keeps them off the text.
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] max-md:hidden">
      {/* Same three lines on both cards, so the two fires compare directly: place; size rank and smoke rank among
          Priority 1; then fire power and share of the day's smoke over residents. The biggest fire is size 1st by definition. */}
      <Callout wrapRef={topRef} hot tag={top.place}
        headline={`Size ${ordinal(top.sizeRank)}, Smoke ${ordinal(1)}`}
        sub={`${Math.round(top.frp)} MW fire power · ${top.sharePct} of the day's smoke over residents`} />
      <Callout wrapRef={bigRef} hot={false} tag={biggest.place}
        headline={`Size ${ordinal(1)}, Smoke ${ordinal(biggest.rank)}`}
        sub={`${Math.round(biggest.frp)} MW fire power · ${biggest.sharePct} of the day's smoke over residents`} />
    </div>
  );
}

const cardRect = (pl: Place, x: number, y: number, cw: number, ch: number): Rect => {
  const l = pl.sx > 0 ? x + pl.dx : x - pl.dx - cw, t = pl.sy < 0 ? y - pl.dy - ch : y + pl.dy;
  return { l, t, r: l + cw, b: t + ch };
};

function Callout({ wrapRef, hot, tag, headline, sub }: {
  wrapRef: React.RefObject<HTMLDivElement | null>; hot: boolean; tag: string; headline: string; sub: string;
}) {
  const edge = hot ? "border-ember-hot" : "border-ink";
  return (
    <div ref={wrapRef} className="absolute left-0 top-0 invisible will-change-transform">
      <span className={`absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full border ${edge}`} />
      {/* Leader from the ring's edge to the card's near corner; its ends are set with the card's placement. */}
      <svg width="1" height="1" className="absolute left-0 top-0 overflow-visible">
        <line stroke="#2A1D12" strokeWidth="1" />
      </svg>
      {/* The card's last-child position matters: the placement code measures and moves lastElementChild. */}
      <div className={`absolute w-max border-l-[3px] ${edge} bg-panel px-3 py-2 shadow-[0_6px_24px_rgb(80_55_30/0.12)]`}
        style={{ maxWidth: CARD_W }}>
        <p className="font-mono text-[10px] uppercase leading-tight tracking-[0.12em] text-ink-3">{tag}</p>
        <p className={`mt-1 font-display text-[19px] font-light leading-tight ${hot ? "text-ember-hot" : "text-ink"}`}>{headline}</p>
        <p className="mt-1 font-mono text-[11px] leading-tight text-ink-2">{sub}</p>
      </div>
    </div>
  );
}
