// Quiet bulletin footer: sources and AI tools as the README lists them, the team, and the map attribution. Source
// names and model roles are copied from downwind/README.md ("Data sources and licences", "AI tools and models").

const DATA = [
  "NASA FIRMS: fire detections (VIIRS S-NPP)",
  "Open-Meteo historical forecast API: winds, rain, humidity",
  "Global Forest Watch: peatlands map",
  "WorldPop: 1 km Indonesia population, 2020",
  "geoBoundaries: province and regency boundaries",
  "Iowa State University Mesonet: airport visibility (METAR archive, used in validation)",
];

const AI = [
  "Claude Code (Anthropic): wrote the code under the direction of the team",
  "Nebius Token Factory, DeepSeek-V4-Pro-0813 and MiniMax-M3: write the bulletins and answer the local chat",
  "scikit-learn HistGradientBoostingClassifier: the persistence model",
];

export default function Footer() {
  return (
    <footer className="pointer-events-auto relative border-t border-rule bg-bg px-5 py-14 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-3 lg:gap-16">
          <div>
            <p className="label">Data</p>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-2">
              {DATA.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </div>
          <div>
            <p className="label">AI tools and models</p>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-2">
              {AI.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </div>
          <div>
            <p className="label">Team</p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">Brian Liew, Rhea Samel, Andrew Lui</p>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-2">Built for the Youth Climate Hackathon at COP31</p>
            {/* Repository link goes here once the repo is public (after sign-off). */}
          </div>
        </div>
        <p className="mt-12 border-t border-rule pt-6 text-xs leading-relaxed text-ink-3">
          Map: OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.
        </p>
      </div>
    </footer>
  );
}
