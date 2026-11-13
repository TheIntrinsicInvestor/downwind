"use client";

// Where it fits (spec section 6): the same province fires twice on light canvas renders, once by the official tiers
// and once in Downwind's order. The 564 comes from storyFacts, not from the page.

import { memo, useMemo } from "react";
import { type Day, longDate } from "@/lib/replay";
import { STORY_DATE, storyFacts } from "@/lib/story";
import MiniMap from "./MiniMap";

function WhereItFits({ day }: { day: Day | null }) {
  const story = day && day.date === STORY_DATE ? day : null;
  const p1 = useMemo(() => (story ? storyFacts(story)?.p1 ?? null : null), [story]);
  const n = p1 === null ? "" : p1.toLocaleString("en-US");
  const left = p1 === null ? "Official tiers" : `Official tiers: ${n} fires share Priority 1`;
  const right = p1 === null ? "Downwind" : `Downwind: the same ${n}, in order`;
  return (
    <section id="where-it-fits" aria-labelledby="fits-title" className="scroll-mt-16 border-t border-rule px-5 py-20 sm:px-10 lg:px-16 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="dateline">Where it fits</p>
        <h2 id="fits-title" className="mt-4 max-w-2xl font-display text-3xl leading-tight text-ink sm:text-4xl">
          The same fires, two ways to order them
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          An added layer on the existing rule. The tiers stay; the order is new.
        </p>
        <div className="mt-12 grid gap-12 border-t border-rule pt-12 lg:grid-cols-2 lg:gap-16">
          <figure className="m-0">
            <MiniMap day={story} mode="official" numbered={false} label={`Map of West Kalimantan fires on ${longDate(STORY_DATE)} coloured by official tier. ${left}.`} />
            <figcaption className="mt-4 text-[15px] text-ink-2">{left}</figcaption>
          </figure>
          <figure className="m-0">
            <MiniMap day={story} mode="downwind" numbered label={`Map of the same fires coloured by Downwind rank, with the top ten numbered. ${right}.`} />
            <figcaption className="mt-4 text-[15px] text-ink-2">{right}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

export default memo(WhereItFits);
