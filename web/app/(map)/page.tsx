"use client";

// The landing page at /: hero and five-beat story over the shared map, then the content sections.
// It owns the provider while it shows: 20 September, Downwind view, no selection, a passive map. Next keeps this page
// in <Activity> when the reader goes to /app, so the setup runs again on every return (effects re-run, state stays).

import { useCallback, useLayoutEffect, useMemo, useRef, type MouseEvent } from "react";
import { useReplay } from "@/components/ReplayProvider";
import TopBar from "@/components/landing/TopBar";
import Hero, { type LoadStatus } from "@/components/landing/Hero";
import HeroCallouts from "@/components/landing/HeroCallouts";
import Stakes from "@/components/landing/Stakes";
import Story from "@/components/landing/Story";
import Practice from "@/components/landing/Practice";
import Results from "@/components/landing/Results";
import HowItWorks from "@/components/landing/HowItWorks";
import Footer from "@/components/landing/Footer";
import { STORY_DATE, STORY_FRAME, beats as storyBeats, storyFacts } from "@/lib/story";

export default function Home() {
  const { day, limits, limitsError, error, retry, setDate, setFrame, setPlaying, setMode, select, setPanel, setStoryFocus, setMapInteractive } = useReplay();
  const beatRef = useRef(-1);    // the beat on screen (-1: hero), for the hand-off

  // A layout effect, so it runs before every passive effect of the same commit, including Story's (children's passive
  // effects run before the parent's). Story then applies the beat for the current scroll position on top of this
  // reset, on first load and on every return from /app.
  useLayoutEffect(() => {
    setMapInteractive(false);
    setStoryFocus(undefined);     // before the day changes: a focus from another day is not valid on this one
    setDate(STORY_DATE);
    setPlaying(false);
    setFrame(STORY_FRAME);
    setMode("downwind");
    select(null);
    return () => {
      setStoryFocus(undefined);
      setMapInteractive(true);
    };
  }, [setMapInteractive, setStoryFocus, setDate, setPlaying, setFrame, setMode, select]);

  const story = day && day.date === STORY_DATE ? day : null;
  const facts = useMemo(() => (story ? storyFacts(story) : null), [story]);
  const beats = useMemo(() => (story ? storyBeats(story) : null), [story]);
  const status: LoadStatus = error ? "failed" : !story ? "loading" : facts && beats ? "ready" : "failed";

  // Leaving from beat 4 or 5 opens the app on the top-ranked fire.
  const openApp = useCallback(() => {
    setMode("downwind");
    if (beatRef.current >= 3 && facts) {
      select(facts.top.i);
      setPanel("fire");
    }
  }, [facts, select, setPanel, setMode]);

  const seeHow = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById("story");
    if (!el) return;
    e.preventDefault();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, []);

  return (
    <div className="flex flex-col">
      <TopBar onOpenApp={openApp} />
      <HeroCallouts day={story} facts={facts} />
      <Hero facts={facts} status={status} onRetry={retry} onOpenApp={openApp} onSeeHow={seeHow} />
      <Practice />
      <Stakes />
      {status !== "failed" && <Story day={story} beats={beats} facts={facts} beatRef={beatRef} onOpenApp={openApp} />}
      {/* Content sections, opaque so the map is covered once the story ends. */}
      <main className="pointer-events-auto relative bg-bg">
        <HowItWorks />
        <Results limits={limits} limitsError={limitsError} day={story} />
      </main>
      <Footer />
    </div>
  );
}
