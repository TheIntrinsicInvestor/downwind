"use client";

// The app at /app: floating panels over the shared map (state lives in ReplayProvider). Desktop: top bar, ranked list
// on the left, detail tabs on the right, time slider at the bottom; each side panel collapses to a labelled tab.
// Under 768 px the list and the detail tabs share one bottom sheet. The layout wrapper lets clicks through to the
// map, so every interactive container here sets pointer-events-auto.
// The provider re-renders this shell 8 times a second while playing; the panels are memoised and get stable props.

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { type Day, type Mode, contributionsFor, localLabel, longDate } from "@/lib/replay";
import { wib, type Manifest } from "@/lib/live";
import { OPENING_CAMERA } from "@/lib/mapstyle";
import Wordmark from "../Wordmark";
import TimeSlider from "../TimeSlider";
import FireList from "../FireList";
import FireCard from "../FireCard";
import { ModeNote, ModeSwitch } from "../ModeToggle";
import LimitsPanel from "../LimitsPanel";
import BulletinPanel from "../BulletinPanel";
import CityView from "../CityView";
import ChatPanel from "../ChatPanel";
import SitesPanel from "../SitesPanel";
import { type Panel, useReplay } from "../ReplayProvider";
import Sheet, { type SheetState } from "./Sheet";

const TABS: { id: Panel; label: string }[] = [
  { id: "fire", label: "Fire" }, { id: "city", label: "Protect" }, { id: "bulletin", label: "Bulletin" },
  { id: "sites", label: "Sites" }, { id: "limits", label: "Limits" }, { id: "ask", label: "Ask" },
];
const URL_PANELS = ["limits", "city", "bulletin", "fire", "sites"] as const;
const PHONE_TOP = 128;     // px the full sheet leaves for the phone top bar
// Phone opening view: the province's fire coast sits in the map area between the top bar and the collapsed sheet.
const PHONE_CAMERA = { center: [110.55, -1.25] as [number, number], zoom: 6 };

// ---- viewport

const WIDE = "(min-width: 768px)";
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
}

// ---- small parts

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" aria-hidden="true">
      <path d={dir === "left" ? "M6 1L1 6l5 5" : "M1 1l5 5-5 5"} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const shortDay = (iso: string) => { const [d, m] = longDate(iso).split(" "); return `${d} ${m.slice(0, 3)}`; };

const DaySwitch = memo(function DaySwitch({ days, date, onDay, live, onLive }: {
  days: string[]; date: string | null; onDay: (d: string) => void; live: boolean; onLive: () => void;
}) {
  return (
    <div role="radiogroup" aria-label="Map data" className="panel pointer-events-auto flex gap-0.5 p-0.5">
      <button type="button" role="radio" aria-checked={live} onClick={onLive}
        className={`focus-ring-inset min-h-9 px-2.5 text-xs font-medium max-md:min-h-11 ${live ? "bg-white/10 text-ink" : "text-ink-3 hover:text-ink"}`}>
        Live
      </button>
      {days.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={!live && d === date}
          aria-label={longDate(d)}
          onClick={() => { if (live || d !== date) onDay(d); }}
          className={`focus-ring-inset figure min-h-9 whitespace-nowrap px-3 text-[12px] transition-colors max-md:min-h-11 max-md:px-2.5 ${
            !live && d === date ? "bg-white/10 text-ink shadow-[inset_0_-2px_0_var(--ember-hot)]" : "text-ink-3 hover:bg-white/5 hover:text-ink"}`}
        >
          {shortDay(d)}
        </button>
      ))}
    </div>
  );
});

function FeedStatus({ manifest, unavailable, stale }: { manifest: Manifest | null; unavailable: boolean; stale: boolean }) {
  const status = manifest ? (unavailable || stale ? "Last good update" : "Updated")
    : (unavailable ? "Live feed unavailable. Showing replay." : "Checking for live data…");
  return (
    <p role="status" className="panel px-3 py-1.5 text-xs text-ink-2">
      {status}{manifest && ` ${wib(manifest.generated_at)} · Observed before ${wib(manifest.observation_cutoff)}`}
    </p>
  );
}

type TabItem = { id: string; label: string };
function Tabs({ items, active, onPick, className = "" }: { items: TabItem[]; active: string; onPick: (id: string) => void; className?: string }) {
  return (
    <div role="tablist" aria-label="Panels" className={`flex border-b border-rule ${className}`}>
      {items.map((t) => (
        <button
          key={t.id}
          id={`dw-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          aria-controls="dw-tabpanel"
          onClick={() => onPick(t.id)}
          className={`focus-ring-inset relative min-h-11 shrink-0 px-3 text-[13px] font-medium transition-colors ${
            active === t.id ? "text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-ember" : "text-ink-3 hover:text-ink"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// The left panel's content (also the phone sheet's Ranking view).
const ListBody = memo(function ListBody({ day, mode, selected, onSelect }:
  { day: Day; mode: Mode; selected: number | null; onSelect: (i: number) => void }) {
  return (
    <>
      <h2 className="font-display text-[21px] leading-snug text-ink">
        {mode === "official" ? "West Kalimantan fires by official tier" : "Priority 1 fires by residents under smoke"}
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-3">
        Morning of {longDate(day.date)}. Fires detected {longDate(day.fires_date)} (UTC).
      </p>
      <div className="mt-4 border-t border-rule pt-3"><ModeNote mode={mode} day={day} /></div>
      <div className="mt-5"><FireList day={day} selected={selected} onSelect={onSelect} mode={mode} /></div>
    </>
  );
});

function Status({ error, retry }: { error: string | null; retry: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      {error ? (
        <div role="alert" className="panel pointer-events-auto w-full max-w-sm border-l-2 border-l-ember p-5">
          <p className="text-sm leading-relaxed text-ink">{error}</p>
          <button type="button" onClick={retry}
            className="focus-ring mt-4 min-h-11 bg-ember px-5 text-[13px] font-semibold text-[#160800] transition-colors hover:bg-ember-hot">
            Retry
          </button>
        </div>
      ) : (
        <p role="status" className="panel flex items-center gap-3 px-5 py-4 text-sm text-ink-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ember shadow-[0_0_10px_var(--ember)] motion-reduce:animate-none" aria-hidden="true" />
          Loading replay data
        </p>
      )}
    </div>
  );
}

// ---- the shell

export default function AppShell() {
  const { index, date, setDate, day, error, retry, frame, setFrame, playing, setPlaying, selected, select, selectedDistrict, selectSeq, mode, setMode,
    place, setPlace, panel, setPanel, limits, limitsError, chatEnabled, setStoryFocus, flyTo, mapReady,
    liveSelected, showLive, feedManifest, feedUnavailable, feedStale } = useReplay();
  const wide = useWide();
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [listView, setListView] = useState(true);              // phone: the sheet shows the ranked list, not a tab
  const [sheet, setSheet] = useState<SheetState>("collapsed");

  // On arrival the app's own focus rule applies and ?panel= opens a tab.
  useEffect(() => {
    setStoryFocus(undefined);
    const p = new URLSearchParams(window.location.search).get("panel");
    if ((URL_PANELS as readonly string[]).includes(p ?? "")) {
      setPanel(p as Panel);
      setRightOpen(true);
      setListView(false);
      setSheet("half");
    }
  }, [setStoryFocus, setPanel]);

  // Opening view, once the map is ready (a camera request made earlier is lost when dev Strict Mode remounts the map).
  // Opened directly: phones jump to a view that clears the sheet; desktop keeps the map's own opening view. Arriving
  // from the landing page (the map was already on screen, and Activity re-runs this effect on every return): ease
  // once from the story's camera to the app's view. On phones the attribution starts folded to its "i" button (as
  // MapLibre does after the first drag) so it does not cover the map above the sheet.
  const mapWasShowing = useRef(mapReady);
  useEffect(() => {
    if (!mapReady) return;
    const wide = window.matchMedia(WIDE).matches;
    if (mapWasShowing.current) flyTo(wide ? OPENING_CAMERA : PHONE_CAMERA);
    else if (!wide) flyTo(PHONE_CAMERA, { instant: true });
    mapWasShowing.current = true;
    if (!wide) document.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact")?.classList.remove("maplibregl-compact-show");
  }, [mapReady, flyTo]);

  // Selecting a fire (list, map, Protect or the story's hand-off) shows its card, also when it is the fire already
  // selected: every select(i) bumps selectSeq. A change of `selected` alone (window.__dw.select) counts too. Starts
  // from "nothing selected", so a fire chosen before the shell first mounts (the story's hand-off) also opens.
  const lastSelected = useRef<number | null>(null);
  const lastSeq = useRef(selectSeq);
  useEffect(() => {
    if (selected !== null && (selected !== lastSelected.current || selectSeq !== lastSeq.current)) {
      setPanel("fire");
      setRightOpen(true);
      setListView(false);
      setSheet((s) => (s === "collapsed" ? "half" : s));
    }
    lastSelected.current = selected;
    lastSeq.current = selectSeq;
  }, [selected, selectSeq, setPanel]);

  const onDay = useCallback((d: string) => { setDate(d); setFrame(0); }, [setDate, setFrame]);
  const onCityFire = useCallback((i: number) => { select(i, place ?? undefined); setPanel("fire"); }, [place, select, setPanel]);
  const closeCard = useCallback(() => select(null), [select]);
  const nRanked = useMemo(() => (day ? day.fires.filter((f) => f.rank !== null).length : 0), [day]);

  const tabs = chatEnabled === true ? TABS : TABS.filter((t) => t.id !== "ask");
  const active: Panel = panel === "ask" && chatEnabled !== true ? "fire" : panel;
  const fire = day && selected !== null ? day.fires[selected] : null;

  function panelContent(d: Day): ReactNode {
    switch (active) {
      case "sites": return <SitesPanel />;
      case "city": return <CityView day={d} place={place} onPlace={setPlace} onFire={onCityFire} />;
      case "bulletin": return <BulletinPanel day={d} live={liveSelected} />;
      case "limits": return <LimitsPanel day={d} limits={limits} error={limitsError} />;
      case "ask": return <ChatPanel date={d.date} />;
      default: return fire
        ? <FireCard fire={fire} nRanked={nRanked} onClose={closeCard} windowStart={d.window_start_utc}
          district={selectedDistrict} contribution={selectedDistrict && selected !== null
            ? contributionsFor(d, selectedDistrict).find((entry) => entry.fire === selected) : undefined} />
        : <p className="text-[13px] text-ink-2">Select a fire on the map or in the list.</p>;
    }
  }

  const slider = day && (
    <TimeSlider
      frame={frame}
      hours={day.hours}
      playing={playing}
      label={localLabel(day.window_start_utc, frame)}
      onFrame={setFrame}
      onToggle={() => setPlaying(!playing)}
    />
  );
  const days = index?.days ?? [];
  const feedStatus = liveSelected && <FeedStatus manifest={feedManifest} unavailable={feedUnavailable} stale={feedStale} />;
  const activeLabel = tabs.find((t) => t.id === active)?.label ?? "Fire";

  if (!wide) {
    const phoneTabs: TabItem[] = [{ id: "list", label: "Ranking" }, ...tabs];
    return (
      <div className="pointer-events-none fixed inset-0">
        <h1 className="sr-only">Downwind live map</h1>
        <header className="dw-enter absolute inset-x-3 top-3 space-y-2 [--dw-from:0_-8px]">
          <div className="flex items-center justify-between gap-3">
            <div className="pointer-events-auto"><Wordmark size="sm" /></div>
            <DaySwitch days={days} date={date} onDay={onDay} live={liveSelected} onLive={showLive} />
          </div>
          <ModeSwitch mode={mode} onMode={setMode} className="pointer-events-auto w-full" />
          {feedStatus}
        </header>
        {day ? (
          <Sheet
            className="dw-enter [--dw-from:0_24px] [animation-delay:80ms]"
            state={sheet}
            onState={setSheet}
            top={PHONE_TOP + (liveSelected ? 48 : 0)}
            header={
              <>
                <div className="px-4 pb-1">{slider}</div>
                <Tabs items={phoneTabs} active={listView ? "list" : active} className="scroll-thin overflow-x-auto overflow-y-hidden px-1"
                  onPick={(id) => {
                    if (id === "list") setListView(true);
                    else { setListView(false); setPanel(id as Panel); }
                    if (sheet === "collapsed") setSheet("half");
                  }} />
              </>
            }
          >
            <div id="dw-tabpanel" role="tabpanel" aria-labelledby={`dw-tab-${listView ? "list" : active}`} className="px-4 py-4 [--pad:1rem]">
              {listView ? <ListBody day={day} mode={mode} selected={selected} onSelect={select} /> : panelContent(day)}
            </div>
          </Sheet>
        ) : <Status error={error} retry={retry} />}
      </div>
    );
  }

  // Side panel widths drive the slider's offsets at xl and up (below xl the slider runs full width under the panels).
  const offsets = {
    "--sl": leftOpen ? "calc(2rem + 340px)" : "1rem",
    "--sr": rightOpen ? "calc(2rem + 380px)" : "1rem",
  } as CSSProperties;

  return (
    <div className="pointer-events-none fixed inset-0" style={offsets}>
      <h1 className="sr-only">Downwind live map</h1>
      <header className="dw-enter absolute inset-x-4 top-4 flex items-center gap-4 [--dw-from:0_-8px]">
        <div className="pointer-events-auto mr-2"><Wordmark /></div>
        <DaySwitch days={days} date={date} onDay={onDay} live={liveSelected} onLive={showLive} />
        <ModeSwitch mode={mode} onMode={setMode} className="pointer-events-auto" />
        {feedStatus}
        {day && !liveSelected && (
          <p className="dateline ml-auto hidden xl:block">
            Situation bulletin <span className="px-1.5 text-ink-3/60">/</span> {longDate(day.date)} <span className="px-1.5 text-ink-3/60">/</span> West Kalimantan
          </p>
        )}
      </header>

      {day ? (
        <>
          {/* Left: the ranked list. */}
          <aside
            aria-label="Ranked fires"
            inert={!leftOpen}
            className={`panel dw-enter pointer-events-auto absolute bottom-[6rem] left-4 top-[4.5rem] flex w-[340px] flex-col [--dw-from:-16px_0] [animation-delay:60ms] transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none xl:bottom-8 ${
              leftOpen ? "" : "-translate-x-[calc(100%+1rem)] opacity-0"}`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-rule py-1 pl-5 pr-1">
              <p className="label">Ranked list</p>
              <button type="button" aria-label="Hide ranked list" onClick={() => setLeftOpen(false)}
                className="focus-ring-inset grid h-10 w-10 place-items-center text-ink-3 transition-colors hover:text-ink">
                <Chevron dir="left" />
              </button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4 [--pad:1.25rem]">
              <ListBody day={day} mode={mode} selected={selected} onSelect={select} />
            </div>
          </aside>
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            inert={leftOpen}
            className={`panel focus-ring pointer-events-auto absolute left-4 top-[4.5rem] flex min-h-11 items-center gap-2.5 px-4 text-[13px] font-medium text-ink transition-opacity duration-300 hover:border-ink-3 motion-reduce:transition-none ${
              leftOpen ? "opacity-0" : "opacity-100"}`}
          >
            Ranked list <Chevron dir="right" />
          </button>

          {/* Right: detail tabs. */}
          <aside
            aria-label="Details"
            inert={!rightOpen}
            className={`panel dw-enter pointer-events-auto absolute right-4 top-[4.5rem] flex max-h-[calc(100%-4.5rem-6rem)] w-[380px] flex-col transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none xl:max-h-[calc(100%-4.5rem-2rem)] [--dw-from:16px_0] [animation-delay:100ms] ${
              rightOpen ? "" : "translate-x-[calc(100%+1rem)] opacity-0"}`}
          >
            <div className="flex shrink-0 items-stretch">
              <Tabs items={tabs} active={active} onPick={(id) => setPanel(id as Panel)} className="flex-1 px-2" />
              <button type="button" aria-label="Hide details" onClick={() => setRightOpen(false)}
                className="focus-ring-inset grid w-10 place-items-center border-b border-rule text-ink-3 transition-colors hover:text-ink">
                <Chevron dir="right" />
              </button>
            </div>
            <div id="dw-tabpanel" role="tabpanel" aria-labelledby={`dw-tab-${active}`}
              className="scroll-thin min-h-0 overflow-y-auto px-5 py-5">
              {panelContent(day)}
            </div>
          </aside>
          <button
            type="button"
            onClick={() => setRightOpen(true)}
            inert={rightOpen}
            className={`panel focus-ring pointer-events-auto absolute right-4 top-[4.5rem] flex min-h-11 items-center gap-2.5 px-4 text-[13px] font-medium text-ink transition-opacity duration-300 hover:border-ink-3 motion-reduce:transition-none ${
              rightOpen ? "opacity-0" : "opacity-100"}`}
          >
            <Chevron dir="left" /> {activeLabel}
          </button>

          {/* Bottom: the time slider. */}
          <div className="panel dw-enter pointer-events-auto absolute bottom-8 left-4 right-4 mx-auto max-w-[56rem] px-3 py-0.5 transition-[left,right] duration-300 ease-out motion-reduce:transition-none xl:left-(--sl) xl:right-(--sr) [--dw-from:0_10px] [animation-delay:140ms]">
            {slider}
          </div>
        </>
      ) : <Status error={error} retry={retry} />}
    </div>
  );
}
