// The stakes band: two published harm figures between the hero and the story, with their sources, and a note on what
// Downwind does and does not claim about them. Static copy; opaque so it covers the map like the content sections.

import { memo } from "react";

function Stakes() {
  return (
    <section aria-labelledby="stakes-title" className="pointer-events-auto relative border-t border-rule bg-bg px-5 py-14 sm:px-10 lg:px-16 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="dateline">Why the order matters</p>
        <h2 id="stakes-title" className="mt-4 max-w-2xl font-display text-3xl leading-tight text-ink sm:text-4xl">
          What the smoke cost this season
        </h2>
        <div className="mt-10 grid gap-10 border-t border-rule pt-10 md:grid-cols-2 md:gap-16">
          <div>
            <p className="figure text-4xl text-ink md:text-5xl">401,586</p>
            <p className="mt-3 max-w-[26rem] text-[15px] leading-relaxed text-ink-2">
              respiratory infections linked to the fires across seven provinces by 2 November 2026. Of these, 91,913 were in children aged five and under.
            </p>
            <p className="mt-3 text-xs text-ink-3">Source: Indonesian Ministry of Health</p>
          </div>
          <div>
            <p>
              <span className="label mr-2">About</span>
              <span className="figure text-4xl text-ink md:text-5xl">3,560</span>
            </p>
            <p className="mt-3 max-w-[26rem] text-[15px] leading-relaxed text-ink-2">
              deaths in Indonesia in September 2026 linked to short-term exposure to fire smoke. This is a modelled estimate, not a count of recorded deaths.
            </p>
            <p className="mt-3 text-xs text-ink-3">Source: Centre for Research on Energy and Clean Air (CREA), 29 October 2026</p>
          </div>
        </div>
        <p className="mt-10 max-w-[44rem] border-t border-rule pt-6 text-[15px] leading-relaxed text-ink-2">
          Both figures cover far more than West Kalimantan, the one province Downwind ranks, and Downwind has not been shown to lower either. What it does is put the fires in order of the smoke they send over people.
        </p>
      </div>
    </section>
  );
}

export default memo(Stakes);
