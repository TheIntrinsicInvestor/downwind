"use client";

// The Protect tab: pick a regency or city, see its 48-hour smoke level, then the fires its smoke comes from with each
// fire's share, first arrival and peak (time over date, WIB). Pointing at a row draws that fire red on the map.

import { memo } from "react";
import SmokeTimeline from "./SmokeTimeline";
import { useReplay } from "./ReplayProvider";
import { type Day, contributionsFor, longDate, pct, placeOptions, timeParts } from "@/lib/replay";

type Props = { day: Day; place: string | null; fire: number | null; onPlace: (p: string | null) => void; onFire: (i: number) => void };

function When({ day, h }: { day: Day; h: number | null | undefined }) {
  if (h === null || h === undefined) return <span className="text-ink-3">Unavailable</span>;
  const { time, date } = timeParts(day.window_start_utc, h);
  return (
    <>
      <span className="block text-ink">{time}</span>
      <span className="block text-xs text-ink-3">{date}</span>
    </>
  );
}

function CityView({ day, place, fire, onPlace, onFire }: Props) {
  const { hovered, setHovered } = useReplay();
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
        {fire !== null ? "Places this fire sends smoke to, most smoke first." : "Places receiving smoke today, most affected first."}
      </p>

      {place && (
        <>
          {hourly && hourly.length >= 2 && <SmokeTimeline windowStartUtc={day.window_start_utc} values={hourly} />}

          <p className="label mt-6">Origin of smoke</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-3">
            Shares are of the modelled smoke over residents in {place}, from fires detected on {longDate(day.fires_date)}. Times are WIB.
          </p>
          {rows.length === 0 ? (
            <p className="mt-3 text-ink-2">No modelled smoke over residents here on this day.</p>
          ) : (
            <>
              <table className="mt-3 w-full border-collapse">
                <thead>
                  <tr className="label border-b border-rule text-left">
                    <th className="pb-2 font-normal">Fire location</th>
                    <th className="pb-2 pl-2 text-right font-normal">Share</th>
                    <th className="pb-2 pl-3 text-right font-normal">First arrival</th>
                    <th className="pb-2 pl-3 text-right font-normal">Peak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule" onMouseLeave={() => setHovered(null)}>
                  {rows.map((c) => {
                    const f = day.fires[c.fire];
                    const on = hovered === c.fire;
                    return (
                      <tr
                        key={c.fire}
                        tabIndex={0}
                        aria-label={`${f.place ?? "Fire"}${f.rank !== null ? `, rank ${f.rank}` : ""}: ${pct(c.share, 1)} of the smoke here`}
                        onClick={() => onFire(c.fire)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFire(c.fire); } }}
                        onMouseEnter={() => setHovered(c.fire)}
                        onFocus={() => setHovered(c.fire)}
                        onBlur={() => setHovered(null)}
                        className={`focus-ring-inset cursor-pointer align-top transition-colors ${on ? "bg-ink/[0.05]" : "hover:bg-ink/[0.04]"}`}
                      >
                        <td className="py-2.5 pr-2">
                          <span className={`block ${on ? "text-ember-hot" : "text-ink"}`}>{f.place ?? `${f.lat.toFixed(2)}, ${f.lon.toFixed(2)}`}</span>
                          {f.rank !== null && <span className="figure block text-[11px] text-ink-3">rank {f.rank}</span>}
                          {on && (
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ember-hot">
                              <svg width="9" height="11" viewBox="0 0 9 11" aria-hidden="true"><path d="M4.5 10.5S8.5 6.6 8.5 4.2A4 4 0 0 0 .5 4.2c0 2.4 4 6.3 4 6.3z" fill="none" stroke="currentColor" strokeWidth="1.2" /><circle cx="4.5" cy="4.2" r="1.3" fill="currentColor" /></svg>
                              Highlighted on map
                            </span>
                          )}
                        </td>
                        <td className="figure py-2.5 pl-2 text-right text-ink">{pct(c.share, 1)}</td>
                        <td className="figure py-2.5 pl-3 text-right"><When day={day} h={c.first_arrival_h} /></td>
                        <td className="figure py-2.5 pl-3 text-right"><When day={day} h={c.peak_h} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-ink-3">Point at a fire to see it on the map; tap to open it.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default memo(CityView);
