"use client";

import { memo } from "react";
import SmokeTimeline from "./SmokeTimeline";
import { type Day, contributionsFor, forecastTime, longDate, pct, placeOptions } from "@/lib/replay";

type Props = { day: Day; place: string | null; fire: number | null; onPlace: (p: string | null) => void; onFire: (i: number) => void };

function CityView({ day, place, fire, onPlace, onFire }: Props) {
  const options = placeOptions(day, fire, place);
  const rows = place ? contributionsFor(day, place) : [];
  const hourly = place ? day.places.find((p) => p.name === place)?.hourly : undefined;
  return (
    <div className="text-[13px]">
      <p className="mb-4 leading-relaxed text-ink-2">
        For district health and education offices: which fires send smoke to a place, and when it arrives, to plan
        school closures, masks and clinics.
      </p>
      <label htmlFor="place" className="label">Indonesian regency or city</label>
      <div className="relative mt-1.5">
        <select
          id="place"
          value={place ?? ""}
          onChange={(e) => onPlace(e.target.value || null)}
          className="focus-ring min-h-11 w-full appearance-none border border-ink/55 bg-bg [color-scheme:light] py-2 pl-3 pr-9 text-sm text-ink transition-colors hover:border-ink-3"
        >
          <option value="">Choose a place</option>
          {options.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="mt-1.5 text-xs text-ink-3">
        {fire !== null ? "Places this fire sends smoke to, most smoke first." : "Places with the most modelled smoke, most first. Select a fire to see where its smoke goes."}
      </p>

      {place && (
        <>
          {hourly && hourly.length >= 2 && <SmokeTimeline windowStartUtc={day.window_start_utc} values={hourly} />}
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            Shares are of the modelled smoke over residents in this place, from fires detected on {longDate(day.fires_date)}.
          </p>
          {rows.length === 0 ? (
            <p className="mt-3 text-ink-2">No modelled smoke over residents here on this day.</p>
          ) : (
            <table className="mt-3 w-full border-collapse">
              <thead>
                <tr className="label border-b border-rule text-left">
                  <th className="pb-2 font-normal">Fire location</th>
                  <th className="pb-2 text-right font-normal">Share</th>
                  <th className="pb-2 pl-3 text-right font-normal">First arrival</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((c) => {
                  const f = day.fires[c.fire];
                  return (
                    <tr
                      key={c.fire}
                      tabIndex={0}
                      onClick={() => onFire(c.fire)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFire(c.fire); } }}
                      className="focus-ring-inset group cursor-pointer transition-colors hover:bg-ink/[0.04]"
                    >
                      <td className="py-2.5 pr-2">
                        <span className="text-ink group-hover:text-ember-hot">{f.place ?? `${f.lat.toFixed(2)}, ${f.lon.toFixed(2)}`}</span>
                        {f.rank !== null && <span className="figure ml-2 text-[11px] text-ink-3">rank {f.rank}</span>}
                      </td>
                      <td className="figure py-2.5 text-right text-ink">{pct(c.share, 1)}</td>
                      <td className="figure py-2.5 pl-3 text-right text-ink-2">{c.first_arrival_h === null ? "Unavailable" : forecastTime(day.window_start_utc, c.first_arrival_h)}
                        {c.peak_h != null && <span className="mt-1 block text-xs text-ink-3">Peak {forecastTime(day.window_start_utc, c.peak_h)}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default memo(CityView);
