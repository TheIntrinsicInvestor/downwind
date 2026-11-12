"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { ScatterplotLayer } from "@deck.gl/layers";
import { type Day, type Mode, decodeFrame, tierColor } from "@/lib/replay";

// MapLibre 6 does not inline its worker: the bundler serves it and we say where.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

type Props = {
  day: Day;
  bin: ArrayBuffer;
  frame: number;
  onSelect: (i: number | null) => void;
  mode: Mode;
  focus: number[] | null;          // fires whose smoke stays visible (selected fire or a place's sources)
};

type RGBA = [number, number, number, number];

export default function MapView({ day, bin, frame, onSelect, mode, focus }: Props) {
  const focusSet = useMemo(() => (focus && focus.length ? new Set(focus) : null), [focus]);
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapLibreOverlay | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const map = new Map({
      container: box.current!,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [111.5, 0],
      zoom: 6.2,
      attributionControl: { compact: true },
    });
    const ov = new MapLibreOverlay({ interleaved: true, layers: [] });
    overlay.current = ov;
    map.addControl(ov as never);
    map.once("load", () => setReady(true));
    (window as unknown as { __map?: Map }).__map = map;
    return () => {
      setReady(false);
      overlay.current = null;
      map.remove();
    };
  }, []);

  // Fire draw order: unranked first (small, grey), then ranked fires largest first so small ones stay on top.
  const fireOrder = useMemo(() => {
    const idx = day.fires.map((_, i) => i);
    const unranked = idx.filter((i) => day.fires[i].rank === null);
    const ranked = idx.filter((i) => day.fires[i].rank !== null)
      .sort((a, b) => (day.fires[a].rank as number) - (day.fires[b].rank as number));
    return [...unranked, ...ranked];
  }, [day]);
  const nRanked = useMemo(() => day.fires.filter((f) => f.rank !== null).length, [day]);

  const smoke = useMemo(() => decodeFrame(bin, day.frames[frame] ?? { offset: 0, count: 0 }), [bin, day, frame]);

  useEffect(() => {
    if (!ready || !overlay.current) return;
    const fires = day.fires;
    overlay.current.setProps({
      layers: [
        new ScatterplotLayer({
          id: "smoke",
          data: { length: smoke.fire.length, attributes: { getPosition: { value: smoke.positions, size: 2 } } },
          getRadius: 3000,
          radiusMinPixels: 2,
          radiusMaxPixels: 6,
          getFillColor: (_: unknown, { index }: { index: number }): RGBA => {
            if (focusSet === null) return [92, 78, 66, Math.round(smoke.alpha[index] * 0.45)];
            if (!focusSet.has(smoke.fire[index])) return [92, 78, 66, 3];
            return [70, 45, 30, Math.min(230, 90 + smoke.alpha[index])];          // the selected fire's plume
          },
          updateTriggers: { getFillColor: [focusSet, frame, day.date] },
        }),
        new ScatterplotLayer<number>({
          id: "fires",
          data: fireOrder,
          pickable: true,
          getPosition: (i) => [fires[i].lon, fires[i].lat],
          getRadius: (i) => {
            const r = fires[i].rank;
            if (mode === "official") return fires[i].in_province ? 2500 : 900;   // the rule gives no order: same size
            if (r === null) return 900;
            return r <= 10 ? 6000 : 1500 + 2500 * (1 - (r - 1) / Math.max(nRanked, 1));
          },
          radiusMinPixels: 2,
          radiusMaxPixels: 12,
          stroked: true,
          getLineColor: (i): RGBA => (focusSet?.has(i) ? [20, 20, 20, 255] : [255, 255, 255, 160]),
          getLineWidth: (i) => (focusSet?.has(i) ? 3 : 1),
          lineWidthUnits: "pixels",
          getFillColor: (i): RGBA => {
            if (mode === "official") {
              return fires[i].in_province ? [...tierColor(fires[i].tier), 230] : [125, 125, 125, 120];
            }
            const r = fires[i].rank;
            if (r === null) return [125, 125, 125, 120];
            return r <= 10 ? [178, 34, 34, 235] : [226, 120, 40, 210];
          },
          onClick: (info) => onSelect(typeof info.object === "number" ? info.object : null),
          updateTriggers: { getLineColor: [focusSet], getLineWidth: [focusSet], getRadius: [day.date, mode],
            getFillColor: [day.date, mode] },
        }),
      ],
    });
  }, [ready, day, smoke, frame, focusSet, fireOrder, nRanked, onSelect, mode]);

  return (
    <div className="absolute inset-0">
      {/* maplibre-gl.css sets .maplibregl-map to position:relative, so the map gets its own sized child div. */}
      <div ref={box} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
