"use client";

// A static map of the province's fires on a 2D canvas (spec section 6, "Where it fits"): no WebGL, no tiles. Province
// fires only, fitted to their bounding box with an equirectangular projection (longitude scaled by cos of the mean
// latitude). Colours come from fireFill; sizes are small fixed pixel radii. With `numbered`, the top ten are larger
// and carry their rank numerals. Without a day the empty frame keeps its size, so nothing jumps when data arrives.

import { useEffect, useMemo, useRef } from "react";
import { type Day, type Fire, type Mode, rankedFires } from "@/lib/replay";
import { fireFill } from "@/lib/mapstyle";

const PAD = 36;

type Pt = { fire: Fire; x: number; y: number };

export default function MiniMap({ day, mode, numbered, label }: { day: Day | null; mode: Mode; numbered: boolean; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // Province fires in draw order: unranked and low ranks first, best ranks last.
  const fires = useMemo(() => {
    if (!day) return [];
    const list = day.fires.filter((f) => f.in_province);
    const key = (f: Fire) => (f.rank === null ? Infinity : f.rank);
    return list.sort((a, b) => key(b) - key(a));
  }, [day]);
  const nRanked = useMemo(() => (day ? rankedFires(day).length : 0), [day]);

  useEffect(() => {
    const box = wrap.current, cv = canvas.current;
    if (!box || !cv) return;
    const draw = () => {
      const w = box.clientWidth, h = box.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (fires.length === 0) return;

      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const f of fires) {
        minLon = Math.min(minLon, f.lon); maxLon = Math.max(maxLon, f.lon);
        minLat = Math.min(minLat, f.lat); maxLat = Math.max(maxLat, f.lat);
      }
      const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
      const spanX = Math.max((maxLon - minLon) * kx, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6);
      const s = Math.min((w - 2 * PAD) / spanX, (h - 2 * PAD) / spanY);
      const ox = (w - spanX * s) / 2, oy = (h - spanY * s) / 2;
      const pts: Pt[] = fires.map((fire) => ({
        fire, x: ox + (fire.lon - minLon) * kx * s, y: oy + (maxLat - fire.lat) * s,
      }));

      const top: Pt[] = [];
      for (const p of pts) {
        const [r, g, b, a] = fireFill(p.fire, mode, nRanked);
        const isTop = numbered && p.fire.rank !== null && p.fire.rank <= 10;
        const rad = isTop ? 5 : mode === "official" ? 2.5 : 1.5;
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();
        if (isTop) top.push(p);
      }

      if (top.length) {
        // Best rank first: it gets the first free spot; the numeral tries right, left, above, below, then diagonals.
        top.sort((a, b) => a.fire.rank! - b.fire.rank!);
        ctx.font = `600 12px ${getComputedStyle(cv).fontFamily}`;
        ctx.textBaseline = "middle";
        const placed: { x: number; y: number; w: number; h: number }[] = [];
        const hit = (r: { x: number; y: number; w: number; h: number }) =>
          r.x < 2 || r.y < 2 || r.x + r.w > w - 2 || r.y + r.h > h - 2 ||
          placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y) ||
          top.some((p) => (p.x - Math.max(r.x, Math.min(p.x, r.x + r.w))) ** 2 + (p.y - Math.max(r.y, Math.min(p.y, r.y + r.h))) ** 2 < 36);
        for (const p of top) {
          const text = String(p.fire.rank);
          const tw = ctx.measureText(text).width, th = 13, d = 9;
          const spots: [number, number][] = [
            [d, -th / 2], [-d - tw, -th / 2], [-tw / 2, -d - th], [-tw / 2, d],
            [d, -d - th], [-d - tw, -d - th], [d, d], [-d - tw, d],
            [2 * d, -th / 2], [-2 * d - tw, -th / 2], [-tw / 2, -2 * d - th], [-tw / 2, 2 * d],
          ];
          let spot = spots[0];
          for (const sp of spots) {
            if (!hit({ x: p.x + sp[0], y: p.y + sp[1], w: tw, h: th })) { spot = sp; break; }
          }
          placed.push({ x: p.x + spot[0], y: p.y + spot[1], w: tw, h: th });
          ctx.fillStyle = "#eef0ea";
          ctx.fillText(text, p.x + spot[0], p.y + spot[1] + th / 2);
        }
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    return () => ro.disconnect();
  }, [fires, mode, numbered, nRanked]);

  return (
    <div ref={wrap} className="relative aspect-square w-full lg:aspect-[6/5] border border-rule bg-panel">
      <canvas ref={canvas} role="img" aria-label={label} className="absolute inset-0 h-full w-full font-mono" />
    </div>
  );
}
