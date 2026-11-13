"use client";

// The one live map: fixed, full viewport, behind every page under app/(map). Reads everything from the provider.

import { useEffect, useMemo, useRef, useState } from "react";
import { Map, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { IconLayer, ScatterplotLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "deck.gl";
import { decodeFrame, rankedFires } from "@/lib/replay";
import { BASEMAP_HIDDEN, BASEMAP_PAINT, BASEMAP_STYLE, FOCUS_SMOKE_RANGE, INK, MAP_MAX_ZOOM, PLACE_LABELS,
  PLACE_LABEL_MIN_ZOOM, type RGBA, SMOKE_RANGE, SMOKE_TEXTURE_SIZE, fireFill, fireGlow, fireRadius, glowScale,
  smokeColorDomain, smokeRadiusPixels, topHaze } from "@/lib/mapstyle";
import { useReplay, useStageBinding } from "./ReplayProvider";

// MapLibre 6 does not inline its worker: the bundler serves it and we say where.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

const MAP_ERROR = "The map could not be loaded. The panels still work.";
// The smoke weight map is rebuilt when its radius changes, so zoom is taken in quarter steps, not every frame of a flight.
const zoomStep = (z: number) => Math.round(z * 4) / 4;

function restyle(map: Map) {
  for (const [id, prop, value] of BASEMAP_PAINT) {
    if (map.getLayer(id)) map.setPaintProperty(id, prop as never, value as never);   // lib/mapstyle.ts stays free of maplibre types
  }
  for (const id of BASEMAP_HIDDEN) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  }
  for (const id of PLACE_LABELS) {
    const layer = map.getLayer(id);
    if (layer) map.setLayerZoomRange(id, PLACE_LABEL_MIN_ZOOM, layer.maxzoom ?? 24);
  }
}

// A soft white radial-gradient sprite (the mockup's glowDot falloff), tinted per fire and blended additively.
function glowSprite(): string {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.15, "rgba(255,255,255,0.9)");
  g.addColorStop(0.55, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return c.toDataURL();
}
const GLOW_MAPPING = { glow: { x: 0, y: 0, width: 64, height: 64, mask: true } };
const ADDITIVE = {
  blend: true, blendColorOperation: "add", blendColorSrcFactor: "src-alpha", blendColorDstFactor: "one",
  blendAlphaOperation: "add", blendAlphaSrcFactor: "one", blendAlphaDstFactor: "one", depthCompare: "always",
} as const;

type Smoke = { n: number; positions: Float32Array; weights: Float32Array };
const EMPTY: Smoke = { n: 0, positions: new Float32Array(0), weights: new Float32Array(0) };

export default function MapStage() {
  const { day, bin, frame, mode, focus, select, mapError } = useReplay();
  const { attach, setMapReady, setMapError } = useStageBinding();
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapLibreOverlay | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(6.25);

  useEffect(() => {
    let map: Map;
    try {
      map = new Map({
        container: box.current!,
        style: BASEMAP_STYLE,
        center: [111.5, 0],
        zoom: 6.2,
        maxZoom: MAP_MAX_ZOOM,
        attributionControl: { compact: true },
      });
    } catch {
      setMapError(MAP_ERROR);       // no WebGL
      return;
    }
    const ov = new MapLibreOverlay({ interleaved: true, layers: [] });
    overlay.current = ov;
    map.addControl(ov as never);
    let loaded = false;
    // Before load, any error (style or WebGL) means there is no map; after load, a failed tile is not fatal.
    map.on("error", () => { if (!loaded) setMapError(MAP_ERROR); });
    map.once("load", () => {
      loaded = true;
      restyle(map);
      setMapError(null);
      setReady(true);
      setMapReady(true);
    });
    map.on("zoom", () => setZoom(zoomStep(map.getZoom())));
    setZoom(zoomStep(map.getZoom()));
    (window as unknown as { __map?: Map }).__map = map;
    attach(map);
    return () => {
      attach(null);
      setReady(false);
      setMapReady(false);
      overlay.current = null;
      map.remove();
    };
  }, [attach, setMapReady, setMapError]);

  const focusSet = useMemo(() => (focus && focus.length ? new Set(focus) : null), [focus]);

  // Draw order: unranked first, then ranked from the last rank up, so better-ranked fires sit on top. In the Downwind
  // view the top 10 are a layer of their own (drawn last, with a larger pixel cap) so they stand out at every zoom.
  const nRanked = useMemo(() => (day ? day.fires.filter((f) => f.rank !== null).length : 0), [day]);
  const fireSets = useMemo(() => {
    if (!day) return { rest: [], top: [], glow: [] };
    const unranked = day.fires.map((_, i) => i).filter((i) => day.fires[i].rank === null);
    const ranked = rankedFires(day).reverse();
    const sets = mode === "official" ? { rest: [...unranked, ...ranked], top: [] as number[] }
      : { rest: [...unranked, ...ranked.slice(0, -10)], top: ranked.slice(-10) };
    return { ...sets, glow: sets.rest.filter((i) => fireGlow(day.fires[i], mode, nRanked) !== null) };
  }, [day, mode, nRanked]);
  const glowUrl = useMemo(() => glowSprite(), []);

  // The frame's particles as heatmap weights (alpha / 255), split into the focused plume and the rest.
  const smoke = useMemo(() => {
    if (!day || !bin) return { rest: EMPTY, focused: EMPTY };
    const f = decodeFrame(bin, day.frames[frame] ?? { offset: 0, count: 0 });
    const n = f.fire.length;
    if (!focusSet) {
      const weights = new Float32Array(n);
      for (let i = 0; i < n; i++) weights[i] = f.alpha[i] / 255;
      return { rest: { n, positions: f.positions, weights }, focused: EMPTY };
    }
    const take = (keep: boolean): Smoke => {
      const idx: number[] = [];
      for (let i = 0; i < n; i++) if (focusSet.has(f.fire[i]) === keep) idx.push(i);
      const positions = new Float32Array(idx.length * 2);
      const weights = new Float32Array(idx.length);
      idx.forEach((j, k) => {
        positions[2 * k] = f.positions[2 * j];
        positions[2 * k + 1] = f.positions[2 * j + 1];
        weights[k] = f.alpha[j] / 255;
      });
      return { n: idx.length, positions, weights };
    };
    return { rest: take(false), focused: take(true) };
  }, [day, bin, frame, focusSet]);

  useEffect(() => {
    if (!ready || !overlay.current) return;
    if (!day) { overlay.current.setProps({ layers: [] }); return; }
    const fires = day.fires;
    const heat = (id: string, s: Smoke, colorRange: RGBA[], opacity: number) => new HeatmapLayer({
      id,
      data: { length: s.n, attributes: { getPosition: { value: s.positions, size: 2 }, getWeight: { value: s.weights, size: 1 } } },
      radiusPixels: smokeRadiusPixels(zoom),
      colorDomain: smokeColorDomain(zoom),
      intensity: 1,
      threshold: 0.03,
      weightsTextureSize: SMOKE_TEXTURE_SIZE,   // the default 2048 costs ~240 ms a frame on Iris Xe (Task 1)
      aggregation: "SUM",
      colorRange,
      opacity,
    });
    const dots = (id: string, data: number[], minPx: number, maxPx: number) => new ScatterplotLayer<number>({
      id,
      data,
      pickable: true,
      getPosition: (i) => [fires[i].lon, fires[i].lat],
      getRadius: (i) => fireRadius(fires[i], mode, nRanked),
      radiusMinPixels: minPx,
      radiusMaxPixels: maxPx,
      getFillColor: (i) => fireFill(fires[i], mode, nRanked),
      onClick: (info) => select(typeof info.object === "number" ? info.object : null),
      updateTriggers: { getRadius: [day.date, mode], getFillColor: [day.date, mode] },
    });
    // Fire layers keep their data and accessors between smoke frames; attributes change only with day or mode, and the
    // glow size with the quarter-step zoom (a uniform, sizeScale).
    const glow = (id: string, data: number[], look: (i: number) => { size: number; color: RGBA }) =>
      new IconLayer<number>({
        id,
        data,
        iconAtlas: glowUrl,
        iconMapping: GLOW_MAPPING,
        getIcon: () => "glow",
        getPosition: (i) => [fires[i].lon, fires[i].lat],
        sizeUnits: "pixels",
        getSize: (i) => look(i).size,
        sizeScale: glowScale(zoom),
        getColor: (i) => look(i).color,
        alphaCutoff: 0,
        parameters: ADDITIVE,
        updateTriggers: { getSize: [day.date, mode], getColor: [day.date, mode] },
      });
    overlay.current.setProps({
      layers: [
        heat("smoke", smoke.rest, SMOKE_RANGE, focusSet ? 0.45 : 1),
        heat("smoke-focus", smoke.focused, FOCUS_SMOKE_RANGE, 1),
        glow("glow", fireSets.glow, (i) => fireGlow(fires[i], mode, nRanked)!),
        glow("haze", fireSets.top, (i) => topHaze(fires[i].rank as number)),
        glow("glow-top", fireSets.top, (i) => fireGlow(fires[i], mode, nRanked)!),
        dots("fires", fireSets.rest, 1, 2.5),
        dots("top", fireSets.top, 2.5, 5),
        // The selected or focused fires get a ring, in screen pixels and clear of the dot so it shows on a white core.
        new ScatterplotLayer<number>({
          id: "ring",
          data: focus ?? [],
          getPosition: (i) => [fires[i].lon, fires[i].lat],
          radiusUnits: "pixels",
          getRadius: (i) => (fireSets.top.includes(i) ? 15 : 8),
          filled: false,
          stroked: true,
          getLineColor: [...INK, 230],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          updateTriggers: { getRadius: [fireSets] },
        }),
      ],
    });
  }, [ready, day, smoke, zoom, focus, focusSet, fireSets, nRanked, select, mode, glowUrl]);

  return (
    <div className="fixed inset-0 z-0 bg-bg">
      {/* maplibre-gl.css sets .maplibregl-map to position:relative, so the map gets its own sized child div. */}
      <div ref={box} style={{ width: "100%", height: "100%" }} />
      {mapError && (
        <p role="alert" className="pointer-events-none absolute inset-x-0 top-1/2 px-6 text-center text-sm text-ink-2">
          {mapError}
        </p>
      )}
    </div>
  );
}
