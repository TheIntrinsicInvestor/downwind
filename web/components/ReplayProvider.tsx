"use client";

// One source of truth for the replay, shared by the landing page and the app through app/(map)/layout.tsx.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { type Day, type Index, type Limits, type Mode, ReplayError, contributionsFor, loadDay, loadIndex, loadLimits,
  rankedFires } from "@/lib/replay";
import type { Camera } from "@/lib/story";

export type Panel = "fire" | "city" | "bulletin" | "limits" | "ask";
export type Replay = {
  index: Index | null; date: string | null; setDate(d: string): void;
  day: Day | null; bin: ArrayBuffer | null; error: string | null; retry(): void;
  frame: number; setFrame(f: number): void; playing: boolean; setPlaying(p: boolean): void;
  selected: number | null; select(i: number | null): void;
  mode: Mode; setMode(m: Mode): void;
  place: string | null; setPlace(p: string | null): void;
  panel: Panel; setPanel(p: Panel): void;
  limits: Limits | null; limitsError: string | null;
  storyFocus: number[] | null | undefined; setStoryFocus(f: number[] | null | undefined): void;  // undefined: the app's own focus rule applies
  focus: number[] | null;          // storyFocus if defined, else today's rule (city panel and place, else selected)
  chatEnabled: boolean | null;     // GET /api/chat once; false on any failure
  flyTo(c: Camera, opts?: { instant?: boolean }): void;
  mapReady: boolean; mapError: string | null;
  // false while the landing page shows: the map ignores pointer and keyboard input so the page scrolls over it.
  mapInteractive: boolean; setMapInteractive(i: boolean): void;
};

// How MapStage hands its map to the provider (internal to the provider and the stage).
type StageBinding = {
  attach(map: MapLibreMap | null): void;
  setMapReady(r: boolean): void;
  setMapError(e: string | null): void;
};

declare global {
  interface Window {
    __dw?: {
      setFrame: (f: number) => void; select: (i: number | null) => void; ranked: () => number[];
      state: () => { mode: Mode; focus: number[] | null; frame: number; date: string | null; selected: number | null; panel: Panel };
    };
  }
}

const FPS = 8;
const FLY_MS = 1800;

const ReplayContext = createContext<Replay | null>(null);
const StageContext = createContext<StageBinding | null>(null);

export function useReplay(): Replay {
  const r = useContext(ReplayContext);
  if (!r) throw new Error("useReplay must be used inside ReplayProvider");
  return r;
}

export function useStageBinding(): StageBinding {
  const b = useContext(StageContext);
  if (!b) throw new Error("useStageBinding must be used inside ReplayProvider");
  return b;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function moveCamera(map: MapLibreMap, c: Camera, instant: boolean) {
  if (instant || reducedMotion()) map.jumpTo({ center: c.center, zoom: c.zoom });
  else map.flyTo({ center: c.center, zoom: c.zoom, duration: FLY_MS, essential: true });
}

export default function ReplayProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<Index | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [data, setData] = useState<{ day: Day; bin: ArrayBuffer } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("downwind");
  const [panel, setPanel] = useState<Panel>("fire");
  const [place, setPlace] = useState<string | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [storyFocus, setStoryFocus] = useState<number[] | null | undefined>(undefined);
  const [chatEnabled, setChatEnabled] = useState<boolean | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapInteractive, setMapInteractive] = useState(true);

  const mapRef = useRef<MapLibreMap | null>(null);
  const pendingCamera = useRef<Camera | null>(null);

  useEffect(() => {
    if (index) return;
    loadIndex()
      .then((ix) => { setIndex(ix); setDate((d) => d ?? ix.default); })
      .catch((e) => setError(e instanceof ReplayError ? e.message : "The list of replay days could not be loaded."));
  }, [index, attempt]);

  useEffect(() => {
    if (!date) return;
    let live = true;
    setError(null);
    setData(null);
    setSelected(null);
    loadDay(date)
      .then((d) => { if (live) setData(d); })
      .catch((e) => {
        if (live) setError(e instanceof ReplayError ? e.message : `Replay data for ${date} could not be loaded.`);
      });
    return () => { live = false; };
  }, [date, attempt]);

  useEffect(() => {
    if (!playing || !data) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % data.day.hours), 1000 / FPS);
    return () => clearInterval(t);
  }, [playing, data]);

  useEffect(() => {
    if (limits) return;
    loadLimits().then(setLimits).catch((e) => setLimitsError(e instanceof ReplayError ? e.message : "The accuracy and limits data could not be loaded."));
  }, [limits, attempt]);

  useEffect(() => {
    fetch("/api/chat").then((r) => r.json()).then((j) => setChatEnabled(Boolean(j.enabled))).catch(() => setChatEnabled(false));
  }, []);

  const day = data?.day ?? null;

  const focus = useMemo(() => {
    if (storyFocus !== undefined) return storyFocus;
    if (day && panel === "city" && place) return contributionsFor(day, place).map((c) => c.fire);
    return selected !== null ? [selected] : null;
  }, [storyFocus, day, panel, place, selected]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const select = useCallback((i: number | null) => setSelected(i), []);

  // Before the map exists, the latest request is kept and the camera jumps there when the stage attaches.
  const flyTo = useCallback((c: Camera, opts?: { instant?: boolean }) => {
    if (mapRef.current) moveCamera(mapRef.current, c, Boolean(opts?.instant));
    else pendingCamera.current = c;
  }, []);

  const binding = useMemo<StageBinding>(() => ({
    attach(map) {
      mapRef.current = map;
      if (map && pendingCamera.current) {
        moveCamera(map, pendingCamera.current, true);
        pendingCamera.current = null;
      }
    },
    setMapReady,
    setMapError,
  }), []);

  useEffect(() => {
    window.__dw = {
      setFrame, select: setSelected, ranked: () => (data ? rankedFires(data.day) : []),
      state: () => ({ mode, focus, frame, date, selected, panel }),
    };
  });

  const value: Replay = {
    index, date, setDate, day, bin: data?.bin ?? null, error, retry,
    frame, setFrame, playing, setPlaying, selected, select, mode, setMode, place, setPlace, panel, setPanel,
    limits, limitsError, storyFocus, setStoryFocus, focus, chatEnabled, flyTo, mapReady, mapError,
    mapInteractive, setMapInteractive,
  };

  return (
    <ReplayContext.Provider value={value}>
      <StageContext.Provider value={binding}>{children}</StageContext.Provider>
    </ReplayContext.Provider>
  );
}
