"use client";

import { useMemo } from "react";
import { useReplay } from "./ReplayProvider";
import { firstSmokeNearSite, nearestSites, SITE_COLORS } from "@/lib/sites";
import { localLabel, longDate } from "@/lib/replay";

export default function SitesPanel() {
  const { sitesEnabled, setSitesEnabled, sitesDataset, sitesError, retrySites,
    selected, day, bin, flyTo } = useReplay();
  const fire = day && selected !== null ? day.fires[selected] : null;
  const nearby = useMemo(() => {
    if (!sitesEnabled || !fire || !sitesDataset || !day || !bin || selected === null) return [];
    return nearestSites(fire, sitesDataset).map((entry) => ({ ...entry,
      smokeHour: firstSmokeNearSite(bin, day.frames, selected, entry.site) }));
  }, [sitesEnabled, fire, sitesDataset, day, bin, selected]);
  const counts = useMemo(() => sitesDataset?.features.reduce((sum, site) => {
    sum[site.properties.kind]++; return sum;
  }, { industrial: 0, plantation: 0 }), [sitesDataset]);

  return (
    <section className="space-y-4 text-[13px] leading-relaxed">
      <div>
        <h2 className="font-display text-xl text-ink">Sites near fires</h2>
        <p className="mt-1 text-ink-2">Compare mapped industrial areas and plantations with detected fires and the existing smoke outlook. This is a location and smoke heads-up, not a fire-spread forecast.</p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 border-y border-rule py-2">
        <input type="checkbox" checked={sitesEnabled} onChange={(event) => setSitesEnabled(event.target.checked)}
          className="h-4 w-4 accent-[#bdabff]" />
        Show industrial areas and plantations
      </label>
      {sitesEnabled && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-2" aria-label="Site map legend">
            {(["industrial", "plantation"] as const).map((kind) => <span key={kind} className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 border" style={{ background: SITE_COLORS[kind] + "33", borderColor: SITE_COLORS[kind] }} />
              {kind === "industrial" ? "Industrial areas" : "Mapped plantations"}
            </span>)}
          </div>
          {sitesError ? <div role="status" className="text-ink-2"><p>{sitesError}</p>
            <button onClick={retrySites} className="focus-ring mt-2 min-h-11 underline">Retry site layer</button></div>
            : !sitesDataset ? <p role="status" className="text-ink-3">Loading mapped sites…</p>
            : <>
              <p className="text-xs text-ink-3">{counts?.industrial.toLocaleString()} industrial areas · {counts?.plantation.toLocaleString()} plantation areas.
                Mapped data {longDate((sitesDataset.metadata.source_timestamp || sitesDataset.metadata.extracted_at).slice(0, 10))}. Current mapping is also shown over replay dates.</p>
              {!fire ? <p className="text-ink-2">Select a fire on the map, then open Sites to see the five nearest mapped areas.</p> : <>
                <div className="border-t border-rule pt-3">
                  <p className="label">Selected fire</p>
                  <p className="mt-1 text-ink">{fire.place ?? `${fire.lat.toFixed(3)}, ${fire.lon.toFixed(3)}`}</p>
                  <p className="text-xs text-ink-3">Detections from {day && longDate(day.fires_date)} UTC.
                    {fire.heading && ` Existing forecast smoke drift: ${fire.heading}.`}</p>
                </div>
                <ol className="divide-y divide-rule">
                  {nearby.map(({ site, km, smokeHour }) => {
                    const point = site.geometry.type === "Polygon" ? site.geometry.coordinates[0][0] : site.geometry.coordinates[0][0][0];
                    return <li key={site.id} className="py-3">
                      <button type="button" onClick={() => flyTo({ center: [point[0], point[1]], zoom: 9 })}
                        className="focus-ring min-h-11 text-left text-ink hover:text-ember-hot">
                        {site.properties.name || (site.properties.kind === "industrial" ? "Unnamed industrial area" : "Unnamed mapped plantation")}
                      </button>
                      <p className="text-xs text-ink-2">{site.properties.kind === "industrial" ? "Industrial" : "Plantation"} · {km === 0 ? "Fire location inside or at mapped boundary" : `Approx. ${km < 0.1 ? "<0.1" : km.toFixed(1)} km from fire to mapped boundary`}</p>
                      <p className="mt-1 text-xs text-ink-2">{smokeHour === null
                        ? "No sampled smoke within 2 km in this outlook; not an all-clear."
                        : `Modelled smoke within 2 km from ${localLabel(day!.window_start_utc, smokeHour)}.`}</p>
                      <a href={site.properties.osm_url} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-9 items-center text-xs text-ink-3 underline">View mapped area on OpenStreetMap</a>
                    </li>;
                  })}
                </ol>
              </>}
            </>}
        </>
      )}
      <p className="border-t border-rule pt-3 text-xs text-ink-3">Proximity is a heads-up for local checks, not a prediction of fire spread or a claim about ignition or ownership.
        Smoke proximity uses sampled animation particles and a 2 km display margin, not a health threshold or a concentration estimate.</p>
      <p className="text-xs text-ink-3">© OpenStreetMap contributors · Geofabrik · ODbL. Coverage is incomplete; unmapped sites may be missing. Boundaries and land-use tags are not verified on the ground.</p>
    </section>
  );
}
