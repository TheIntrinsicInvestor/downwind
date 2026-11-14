"use client";

import { useEffect, useMemo, useState } from "react";
import { useReplay } from "./ReplayProvider";
import { type Day, forecastTime } from "@/lib/replay";
import { type FacilityDataset, NEAR_KM, facilitiesIn, facilityName, isFacilityDataset, smokeHoursNear, summarise } from "@/lib/facilities";

const LIST_CAP = 30;
let cache: Promise<FacilityDataset | null> | null = null;

function loadFacilities(): Promise<FacilityDataset | null> {
  cache ??= fetch("/context/facilities.geojson", { signal: AbortSignal.timeout(30_000) })
    .then(async (r) => {
      if (!r.ok) return null;
      const data = await r.json();
      return isFacilityDataset(data) ? data : null;
    })
    .catch(() => { cache = null; return null; });
  return cache;
}

export default function FacilitiesBlock({ day, place }: { day: Day; place: string }) {
  const { bin, flyTo } = useReplay();
  const [dataset, setDataset] = useState<FacilityDataset | null>(null);

  // A missing or invalid file hides the block: the rest of Protect works without it.
  useEffect(() => {
    let live = true;
    loadFacilities().then((d) => { if (live) setDataset(d); });
    return () => { live = false; };
  }, []);

  const summary = useMemo(() => {
    if (!dataset || !bin) return null;
    const list = facilitiesIn(dataset, place);
    if (!list.length) return null;
    return summarise(list, smokeHoursNear(bin, day.frames, list), day.window_start_utc);
  }, [dataset, bin, day, place]);

  if (!summary) return null;
  const { schools, health, schoolHoursAt, schoolSmokeAt, near } = summary;
  const time = (h: number) => forecastTime(day.window_start_utc, h);

  return (
    <section className="mt-5 border-t border-rule pt-4" aria-label="Schools and clinics near the smoke">
      <p className="label">Schools and clinics</p>
      <p className="mt-2 text-ink">
        <span className="figure">About {schools.near.toLocaleString("en-US")}</span> schools near the smoke
        <span className="text-ink-3"> of {schools.total.toLocaleString("en-US")} mapped</span>
      </p>
      {schoolHoursAt !== null ? (
        <p className="mt-1.5 text-xs text-ember-hot">Reaches schools during school hours, from {time(schoolHoursAt)}</p>
      ) : schoolSmokeAt !== null && (
        <p className="mt-1.5 text-xs text-ink-2">Reaches schools outside school hours, from {time(schoolSmokeAt)}</p>
      )}
      <p className="mt-3 text-ink">
        <span className="figure">About {health.near.toLocaleString("en-US")}</span> clinics and hospitals near the smoke
        <span className="text-ink-3"> of {health.total.toLocaleString("en-US")} mapped</span>
      </p>

      {near.length > 0 && (
        <details className="mt-3">
          <summary className="focus-ring cursor-pointer text-xs text-ink-2 underline">Show facilities near the smoke</summary>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {near.slice(0, LIST_CAP).map(({ facility, firstHour }) => (
              <li key={facility.id} className="flex items-baseline justify-between gap-3 py-2">
                <button type="button" onClick={() => flyTo({ center: facility.geometry.coordinates as [number, number], zoom: 13 })}
                  className="focus-ring min-h-9 text-left text-ink hover:text-ember-hot">
                  {facilityName(facility)}
                  <span className="ml-2 text-[11px] text-ink-3">{facility.properties.kind === "school" ? "School" : "Clinic or hospital"}</span>
                </button>
                <span className="figure shrink-0 text-xs text-ink-3">{time(firstHour)}</span>
              </li>
            ))}
          </ul>
          {near.length > LIST_CAP && <p className="mt-1.5 text-xs text-ink-3">and {near.length - LIST_CAP} more</p>}
        </details>
      )}

      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        Near means modelled smoke within {NEAR_KM} km in this 48-hour outlook, from sampled animation particles: a heads-up,
        not a health threshold, and not an all-clear for places not listed. From OpenStreetMap; rural schools and clinics are
        often missing, so treat counts as minimums. Covers western Borneo only.
      </p>
      <p className="mt-1 text-xs text-ink-3">© OpenStreetMap contributors · Geofabrik · ODbL</p>
    </section>
  );
}
