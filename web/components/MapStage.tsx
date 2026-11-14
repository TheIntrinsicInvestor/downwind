"use client";

// The one live map: fixed, full viewport, behind every page under app/(map). Reads everything from the provider.

import { useEffect, useMemo, useRef, useState } from "react";
import { Map, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { IconLayer, ScatterplotLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "deck.gl";
import { decodeFrame, rankedFires } from "@/lib/replay";
import { OPENING_CAMERA, BASEMAP_HIDDEN, BASEMAP_PAINT, BASEMAP_STYLE, FOCUS_SMOKE_RANGE, INK, MAP_BOUNDS, MAP_MAX_ZOOM, PLACE_LABELS,
  PICK_RADIUS, PLACE_LABEL_MIN_ZOOM, type RGBA, SMOKE_RANGE, SMOKE_TEXTURE_SIZE, fireFill, fireGlow, fireRadius, glowScale,
  pickFire, smokeColorDomain, smokeRadiusPixels, topHaze } from "@/lib/mapstyle";
import { SITE_COLORS } from "@/lib/sites";
import { REGENCY_URL, type RegencyCollection, highlightPadding, regencyBounds, regencyByName } from "@/lib/regency";
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

// `data` is the heatmap layer's attribute object, built once per frame so its identity only changes with the frame.
type Smoke = { n: number; data: { length: number; attributes: { getPosition: { value: Float32Array; size: 2 }; getWeight: { value: Float32Array; size: 1 } } } };
const makeSmoke = (n: number, positions: Float32Array, weights: Float32Array): Smoke => ({
  n, data: { length: n, attributes: { getPosition: { value: positions, size: 2 }, getWeight: { value: weights, size: 1 } } },
});
const EMPTY: Smoke = makeSmoke(0, new Float32Array(0), new Float32Array(0));

export default function MapStage() {
  const { day, bin, frame, mode, focus, select, mapError, mapInteractive, sitesEnabled, sitesDataset, place, panel } = useReplay();
  const { attach, setMapReady, setMapError } = useStageBinding();
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapLibreOverlay | null>(null);
  const mapObj = useRef<Map | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(6.25);
  const pick = useRef<(x: number, y: number) => void>(() => {});

  useEffect(() => {
    let map: Map;
    try {
      map = new Map({
        container: box.current!,
        style: BASEMAP_STYLE,
        center: OPENING_CAMERA.center,
        zoom: OPENING_CAMERA.zoom,
        maxBounds: MAP_BOUNDS,
        maxZoom: MAP_MAX_ZOOM,
        renderWorldCopies: false,
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
    map.on("click", (e) => pick.current(e.point.x, e.point.y));
    setZoom(zoomStep(map.getZoom()));
    (window as unknown as { __map?: Map }).__map = map;
    mapObj.current = map;
    attach(map);
    return () => {
      attach(null);
      setReady(false);
      setMapReady(false);
      overlay.current = null;
      mapObj.current = null;
      map.remove();
    };
  }, [attach, setMapReady, setMapError]);

  // A passive map (landing page) also leaves the tab order, so its keyboard handler cannot move the camera.
  useEffect(() => {
    mapObj.current?.getCanvas().setAttribute("tabindex", mapInteractive ? "0" : "-1");
  }, [mapInteractive, ready]);

  useEffect(() => {
    const map = mapObj.current;
    if (!ready || !map) return;
    const visible = sitesEnabled && mapInteractive && sitesDataset;
    if (!visible) {
      for (const id of ["context-sites-fill", "context-sites-outline"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      }
      return;
    }
    if (!map.getSource("context-sites")) {
      map.addSource("context-sites", { type: "geojson", data: sitesDataset,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · Geofabrik · ODbL' });
      const before = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
      const color = ["match", ["get", "kind"], "industrial", SITE_COLORS.industrial, SITE_COLORS.plantation];
      map.addLayer({ id: "context-sites-fill", type: "fill", source: "context-sites",
        paint: { "fill-color": color as never, "fill-opacity": 0.18 } }, before);
      map.addLayer({ id: "context-sites-outline", type: "line", source: "context-sites",
        paint: { "line-color": color as never, "line-width": 1.3, "line-opacity": 0.85 } }, before);
    }
    for (const id of ["context-sites-fill", "context-sites-outline"]) map.setLayoutProperty(id, "visibility", "visible");
  }, [ready, sitesEnabled, sitesDataset, mapInteractive]);

  // Protect tab: outline the chosen regency or city and fit the map to it. The outlines load on first use.
  const regencyData = useRef<Promise<RegencyCollection | null> | null>(null);
  useEffect(() => {
    const map = mapObj.current;
    if (!ready || !map) return;
    const show = (name: string) => {
      for (const id of ["regency-fill", "regency-outline"]) if (map.getLayer(id)) map.setFilter(id, ["==", ["get", "name"], name]);
    };
    const name = panel === "city" ? place : null;
    if (!name) { show(""); return; }
    let live = true;
    regencyData.current ??= fetch(REGENCY_URL).then((r) => (r.ok ? (r.json() as Promise<RegencyCollection>) : null)).catch(() => null)
      .then((d) => { if (!d) regencyData.current = null; return d; });
    regencyData.current.then((data) => {
      if (!live || !data) return;
      if (!map.getSource("regency")) {
        map.addSource("regency", { type: "geojson", data });
        const before = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
        const filter = ["==", ["get", "name"], ""] as never;
        map.addLayer({ id: "regency-fill", type: "fill", source: "regency", filter,
          paint: { "fill-color": "#eef0ea", "fill-opacity": 0.1 } }, before);
        map.addLayer({ id: "regency-outline", type: "line", source: "regency", filter,
          paint: { "line-color": "#eef0ea", "line-width": 2, "line-opacity": 0.95 } }, before);
      }
      show(name);
      const r = regencyByName(data, name);
      if (!r) return;
      const [west, south, east, north] = regencyBounds(r);
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      map.fitBounds([[west, south], [east, north]], { padding: highlightPadding(window.innerWidth), maxZoom: 9,
        duration: still ? 0 : 900, essential: true });
    });
    return () => { live = false; };
  }, [ready, place, panel]);

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

  // A click picks the fire cores within PICK_RADIUS px (deep picking, so a dot hidden under a neighbour still counts);
  // pickFire chooses among them. A click on empty map leaves the selection as it is.
  useEffect(() => {
    pick.current = (x, y) => {
      if (!day || !overlay.current) return;
      const hits = overlay.current.pickMultipleObjects({ x, y, radius: PICK_RADIUS, depth: 12, layerIds: ["fires", "top"] })
        .map((h) => h.object).filter((o): o is number => typeof o === "number");
      const i = pickFire(hits, day.fires, mode);
      if (i !== null) select(i);
    };
  }, [day, mode, select]);

  // The frame's particles as heatmap weights (alpha / 255), split into the focused plume and the rest.
  const smoke = useMemo(() => {
    if (!day || !bin) return { rest: EMPTY, focused: EMPTY };
    const f = decodeFrame(bin, day.frames[frame] ?? { offset: 0, count: 0 });
    const n = f.fire.length;
    if (!focusSet) {
      const weights = new Float32Array(n);
      for (let i = 0; i < n; i++) weights[i] = f.alpha[i] / 255;
      return { rest: makeSmoke(n, f.positions, weights), focused: EMPTY };
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
      return makeSmoke(idx.length, positions, weights);
    };
    return { rest: take(false), focused: take(true) };
  }, [day, bin, frame, focusSet]);

  useEffect(() => {
    if (!ready || !overlay.current) return;
    if (!day) { overlay.current.setProps({ layers: [] }); return; }
    const fires = day.fires;
    const heat = (id: string, s: Smoke, colorRange: RGBA[], opacity: number) => new HeatmapLayer({
      id,
      data: s.data,
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
  }, [ready, day, smoke, zoom, focus, focusSet, fireSets, nRanked, mode, glowUrl]);

  return (
    // Passive: pointer input passes to the page (wheel and touch scroll it); the attribution stays clickable.
    <div className={`fixed inset-0 z-0 bg-bg ${mapInteractive ? "" : "pointer-events-none [&_.maplibregl-ctrl]:pointer-events-auto"}`}>
      {/* maplibre-gl.css sets .maplibregl-map to position:relative, so the map gets its own sized child div. */}
      <div ref={box} style={{ width: "100%", height: "100%" }} />
      {mapError && mapInteractive && (
        <p role="alert" className="pointer-events-none absolute inset-x-0 top-1/2 px-6 text-center text-sm text-ink-2">
          {mapError}
        </p>
      )}
    </div>
  );
}
