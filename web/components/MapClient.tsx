"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { type Day, type Index, type Limits, type Mode, ReplayError, loadDay, loadIndex, loadLimits, localLabel, longDate, rankedFires } from "@/lib/replay";
import TimeSlider from "./TimeSlider";
import FireList from "./FireList";
import FireCard from "./FireCard";
import ModeToggle from "./ModeToggle";
import LimitsPanel from "./LimitsPanel";
import BulletinPanel from "./BulletinPanel";

// MapLibre touches window at import time, so the map loads in the browser only.
// In Next 16, ssr:false is only allowed inside a Client Component, hence this wrapper.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-stone-500">Loading map</div>,
});

declare global {
  interface Window {
    __dw?: { setFrame: (f: number) => void; select: (i: number | null) => void; ranked: () => number[] };
  }
}

const FPS = 8;

export default function MapClient() {
  const [index, setIndex] = useState<Index | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [data, setData] = useState<{ day: Day; bin: ArrayBuffer } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("downwind");
  const [tab, setTab] = useState<"ranking" | "bulletin" | "limits">("ranking");
  const [limits, setLimits] = useState<Limits | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);

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

  const onSelect = useCallback((i: number | null) => setSelected(i), []);

  useEffect(() => {
    window.__dw = { setFrame, select: setSelected, ranked: () => (data ? rankedFires(data.day) : []) };
  });

  const day = data?.day ?? null;
  const fire = day && selected !== null ? day.fires[selected] : null;
  const nRanked = day ? day.fires.filter((f) => f.rank !== null).length : 0;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
      <section className="relative h-[62dvh] shrink-0 overflow-hidden bg-stone-200 lg:h-auto lg:flex-1">
        {data && <MapView day={data.day} bin={data.bin} frame={frame} selected={selected} onSelect={onSelect} mode={mode} />}
        {!data && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-stone-600">
            {error ?? "Loading replay data"}
          </div>
        )}
        <header className="pointer-events-none absolute left-3 right-3 top-3 z-10">
          <div className="pointer-events-auto inline-block max-w-full rounded-lg bg-white/95 px-3 py-2 shadow-md ring-1 ring-black/5">
            <h1 className="text-sm font-semibold text-stone-900">Downwind</h1>
            {day && (
              <p className="text-xs text-stone-600">
                Morning of {longDate(day.date)}. Fires detected {longDate(day.fires_date)} (UTC).
              </p>
            )}
          </div>
        </header>
        {day && (
          <div className="absolute bottom-3 left-3 right-3 z-10">
            <TimeSlider
              frame={frame}
              hours={day.hours}
              playing={playing}
              label={localLabel(day.window_start_utc, frame)}
              onFrame={setFrame}
              onToggle={() => setPlaying((p) => !p)}
            />
          </div>
        )}
      </section>

      <aside className="flex w-full flex-col border-stone-200 bg-white lg:w-[380px] lg:border-l">
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
          <label htmlFor="day" className="text-sm text-stone-600">Day</label>
          <select
            id="day"
            value={date ?? ""}
            onChange={(e) => { setDate(e.target.value); setFrame(0); }}
            className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
          >
            {index?.days.map((d) => <option key={d} value={d}>{longDate(d)}</option>)}
          </select>
        </div>

        {error && (
          <div role="alert" className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="mt-2 rounded-md bg-red-900 px-3 py-1 text-xs font-semibold text-white hover:bg-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {day && (
          <div role="tablist" aria-label="Panels" className="flex border-b border-stone-200 px-2">
            {(["ranking", "bulletin", "limits"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-stone-900 text-stone-900" : "text-stone-500 hover:text-stone-800"}`}
              >
                {t === "ranking" ? "Ranking" : t === "bulletin" ? "Bulletin" : "Limits"}
              </button>
            ))}
          </div>
        )}

        {day && tab === "limits" && (
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"><LimitsPanel day={day} limits={limits} error={limitsError} /></div>
        )}

        {day && tab === "bulletin" && (
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"><BulletinPanel day={day} /></div>
        )}

        {day && tab === "ranking" && <ModeToggle mode={mode} onMode={setMode} day={day} />}

        {day && tab === "ranking" && fire && <FireCard fire={fire} nRanked={nRanked} onClose={() => setSelected(null)} />}

        {day && tab === "ranking" && (
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
              <h2 className="text-sm font-semibold text-stone-900">
                {mode === "official" ? "West Kalimantan fires by official tier" : "Priority 1 fires by residents under smoke"}
              </h2>
            </div>
            <FireList day={day} selected={selected} onSelect={onSelect} mode={mode} />
          </div>
        )}
      </aside>
    </div>
  );
}
