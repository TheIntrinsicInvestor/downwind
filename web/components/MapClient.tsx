"use client";

// The app's panels over the shared map (state lives in ReplayProvider). Task 5 restyles and renames this.

import { localLabel, longDate } from "@/lib/replay";
import TimeSlider from "./TimeSlider";
import FireList from "./FireList";
import FireCard from "./FireCard";
import ModeToggle from "./ModeToggle";
import LimitsPanel from "./LimitsPanel";
import BulletinPanel from "./BulletinPanel";
import CityView from "./CityView";
import ChatPanel from "./ChatPanel";
import { useReplay } from "./ReplayProvider";

export default function MapClient() {
  const { index, date, setDate, day, error, retry, frame, setFrame, playing, setPlaying, selected, select, mode, setMode,
    place, setPlace, panel, setPanel, limits, limitsError } = useReplay();

  const fire = day && selected !== null ? day.fires[selected] : null;
  const nRanked = day ? day.fires.filter((f) => f.rank !== null).length : 0;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
      <section className="relative h-[62dvh] shrink-0 overflow-hidden lg:h-auto lg:flex-1">
        {!day && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-2">
            {error ?? "Loading replay data"}
          </div>
        )}
        <header className="absolute left-3 right-3 top-3 z-10">
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
          <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-10 text-stone-900">
            <TimeSlider
              frame={frame}
              hours={day.hours}
              playing={playing}
              label={localLabel(day.window_start_utc, frame)}
              onFrame={setFrame}
              onToggle={() => setPlaying(!playing)}
            />
          </div>
        )}
      </section>

      {/* text-stone-900: legible on the old white aside under the new dark body colour until Task 5 replaces it. */}
      <aside className="pointer-events-auto flex w-full flex-col border-stone-200 bg-white text-stone-900 lg:w-[380px] lg:border-l">
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
              onClick={retry}
              className="mt-2 rounded-md bg-red-900 px-3 py-1 text-xs font-semibold text-white hover:bg-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {day && (
          <div role="tablist" aria-label="Panels" className="flex border-b border-stone-200 px-2">
            {(["fire", "city", "bulletin", "limits", "ask"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={panel === t}
                onClick={() => setPanel(t)}
                className={`px-3 py-2 text-sm font-medium ${panel === t ? "border-b-2 border-stone-900 text-stone-900" : "text-stone-500 hover:text-stone-800"}`}
              >
                {t === "fire" ? "Ranking" : t === "city" ? "Protect" : t === "bulletin" ? "Bulletin" : t === "limits" ? "Limits" : "Ask"}
              </button>
            ))}
          </div>
        )}

        {day && panel === "limits" && (
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"><LimitsPanel day={day} limits={limits} error={limitsError} /></div>
        )}

        {day && panel === "city" && (
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <CityView day={day} place={place} onPlace={setPlace} onFire={(i) => { select(i); setPanel("fire"); }} />
          </div>
        )}

        {day && panel === "ask" && (
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"><ChatPanel date={day.date} /></div>
        )}

        {day && panel === "bulletin" && (
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"><BulletinPanel day={day} /></div>
        )}

        {day && panel === "fire" && <ModeToggle mode={mode} onMode={setMode} day={day} />}

        {day && panel === "fire" && fire && <FireCard fire={fire} nRanked={nRanked} onClose={() => select(null)} />}

        {day && panel === "fire" && (
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
              <h2 className="text-sm font-semibold text-stone-900">
                {mode === "official" ? "West Kalimantan fires by official tier" : "Priority 1 fires by residents under smoke"}
              </h2>
            </div>
            <FireList day={day} selected={selected} onSelect={select} mode={mode} />
          </div>
        )}
      </aside>
    </div>
  );
}
