"use client";

// One source of truth for the replay, shared by the landing page and the app through app/(map)/layout.tsx.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { usePathname } from "next/navigation";
import { type Day, type Index, type Limits, type Mode, ReplayError, contributionsFor, loadDay, loadIndex, loadLimits,
  rankedFires } from "@/lib/replay";
import type { Camera } from "@/lib/story";
import { isStale, refreshSnapshot, type LiveSnapshot, type Manifest } from "@/lib/live";

export type Panel = "fire" | "city" | "bulletin" | "ask";
export type Replay = {
  index: Index | null; date: string | null; setDate(d: string): void;
  day: Day | null; bin: ArrayBuffer | null; error: string | null; retry(): void;
  frame: number; setFrame(f: number): void; playing: boolean; setPlaying(p: boolean): void;
  selected: number | null; select(i: number | null, district?: string): void;
  selectedDistrict: string | null;
  selectSeq: number;               // counts select(i) calls with a fire, so choosing the selected fire again is visible
  mode: Mode; setMode(m: Mode): void;
  place: string | null; setPlace(p: string | null): void;
  panel: Panel; setPanel(p: Panel): void;
  hovered: number | null; setHovered(i: number | null): void;   // a fire pointed at in a list, drawn red on the map
  limits: Limits | null; limitsError: string | null;
  storyFocus: number[] | null | undefined; setStoryFocus(f: number[] | null | undefined): void;  // undefined: the app's own focus rule applies
  focus: number[] | null;          // storyFocus if defined, else today's rule (city panel and place, else selected)
  chatEnabled: boolean | null;     // GET /api/chat once; false on any failure
  flyTo(c: Camera, opts?: { instant?: boolean }): void;
  mapReady: boolean; mapError: string | null;
  getMap(): MapLibreMap | null;    // the shared map once mapReady, read-only use (project, on/off): never move the camera
  // false while the landing page shows: the map ignores pointer and keyboard input so the page scrolls over it.
  mapInteractive: boolean; setMapInteractive(i: boolean): void;
  liveSelected: boolean; showLive(): void;
  feedManifest: Manifest | null; feedUnavailable: boolean; feedStale: boolean;
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
const FEED_POLL_MS = 60_000;

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
  const isApp = usePathname() === "/app";
  const [index, setIndex] = useState<Index | null>(null);
  const [date, setReplayDate] = useState<string | null>(null);
  const [replayData, setData] = useState<{ day: Day; bin: ArrayBuffer } | null>(null);
  const [wantsLive, setWantsLive] = useState(true);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [feedUnavailable, setFeedUnavailable] = useState(false);
  const [feedStale, setFeedStale] = useState(false);
  const lastSnapshot = useRef<LiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectSeq, setSelectSeq] = useState(0);
  const [mode, setMode] = useState<Mode>("downwind");
  const [panel, setPanel] = useState<Panel>("fire");
  const [place, setPlace] = useState<string | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [storyFocus, setStoryFocus] = useState<number[] | null | undefined>(undefined);
  const [chatEnabled, setChatEnabled] = useState<boolean | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapInteractive, setMapInteractive] = useState(true);

  const mapRef = useRef<MapLibreMap | null>(null);
  const pendingCamera = useRef<Camera | null>(null);
  const liveSelected = isApp && wantsLive;
  const liveData = liveSelected ? snapshot : null;
  const data = liveData ?? replayData;
  const liveSelectedRef = useRef(liveSelected);

  useEffect(() => {
    liveSelectedRef.current = liveSelected;
  }, [liveSelected]);

  const setDate = useCallback((day: string) => {
    setWantsLive(false);
    setReplayDate(day);
  }, []);
  const showLive = useCallback(() => {
    setWantsLive(true);
    setSelected(null);
    setFrame(0);
  }, []);

  useEffect(() => {
    // Start on Live when entering the app. The landing story keeps its replay date.
    if (isApp) showLive();
  }, [isApp, showLive]);

  useEffect(() => {
    if (!isApp) return;
    const stop = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(25_000)]);
        const next = await refreshSnapshot(lastSnapshot.current, signal);
        if (stop.signal.aborted) return;
        if (next !== lastSnapshot.current && liveSelectedRef.current) setSelected(null);
        lastSnapshot.current = next;
        setSnapshot(next);
        setFeedUnavailable(false);
      } catch {
        if (stop.signal.aborted) return;
        setFeedUnavailable(true);
      }
      setFeedStale(Boolean(lastSnapshot.current && isStale(lastSnapshot.current.manifest, Date.now())));
      timer = setTimeout(poll, FEED_POLL_MS);
    }
    void poll();
    return () => { stop.abort(); clearTimeout(timer); };
  }, [isApp, attempt]);

  useEffect(() => {
    if (index) return;
    loadIndex()
      .then((ix) => { setIndex(ix); setReplayDate((d) => d ?? ix.default); })
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

  // A hover from another day, tab or place no longer points at the row the reader sees.
  useEffect(() => { setHovered(null); }, [day, panel, place]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const select = useCallback((i: number | null, district?: string) => {
    setSelected(i);
    setSelectedDistrict(district ?? null);
    if (i !== null) setSelectSeq((n) => n + 1);
  }, []);

  // Before the map exists, the latest request is kept and the camera jumps there when the stage attaches.
  const flyTo = useCallback((c: Camera, opts?: { instant?: boolean }) => {
    if (mapRef.current) moveCamera(mapRef.current, c, Boolean(opts?.instant));
    else pendingCamera.current = c;
  }, []);

  const getMap = useCallback(() => mapRef.current, []);

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
    index, date: liveData?.day.date ?? date, setDate, day, bin: data?.bin ?? null, error, retry,
    frame, setFrame, playing, setPlaying, selected, select, selectedDistrict: selected === null ? null : selectedDistrict, selectSeq, mode, setMode, place, setPlace, panel, setPanel, hovered, setHovered,
    limits: liveData?.limits ?? limits, limitsError, storyFocus, setStoryFocus, focus,
    chatEnabled: liveData ? false : chatEnabled, flyTo, mapReady, mapError, getMap,
    mapInteractive, setMapInteractive, liveSelected, showLive,
    feedManifest: liveData?.manifest ?? null, feedUnavailable, feedStale,
  };

  return (
    <ReplayContext.Provider value={value}>
      <StageContext.Provider value={binding}>{children}</StageContext.Provider>
    </ReplayContext.Provider>
  );
}
