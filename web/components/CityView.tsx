"use client";

import { type Day, contributionsFor, longDate, pct, placeOptions } from "@/lib/replay";

type Props = { day: Day; place: string | null; onPlace: (p: string | null) => void; onFire: (i: number) => void };

export default function CityView({ day, place, onPlace, onFire }: Props) {
  const options = placeOptions(day);
  const rows = place ? contributionsFor(day, place) : [];
  return (
    <div className="px-4 py-4 text-sm">
      <p className="mb-3 text-stone-800">
        For district health and education offices: which fires send smoke to a place, and when it arrives, to plan
        school closures, masks and clinics.
      </p>
      <label htmlFor="place" className="text-stone-600">Indonesian regency or city</label>
      <select
        id="place"
        value={place ?? ""}
        onChange={(e) => onPlace(e.target.value || null)}
        className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1"
      >
        <option value="">Choose a place</option>
        {options.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      {place && (
        <>
          <p className="mt-3 text-xs text-stone-500">
            Shares are of the modelled smoke over residents in this place, from fires detected on {longDate(day.fires_date)}.
          </p>
          {rows.length === 0 ? (
            <p className="mt-3 text-stone-600">No modelled smoke over residents here on this day.</p>
          ) : (
            <table className="mt-2 w-full">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="py-1 font-medium">Fire location</th>
                  <th className="py-1 text-right font-medium">Share</th>
                  <th className="py-1 text-right font-medium">First arrival</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {rows.map((c) => {
                  const f = day.fires[c.fire];
                  return (
                    <tr key={c.fire} onClick={() => onFire(c.fire)} className="cursor-pointer hover:bg-stone-100">
                      <td className="py-1.5">
                        {f.place ?? `${f.lat.toFixed(2)}, ${f.lon.toFixed(2)}`}
                        {f.rank !== null && <span className="ml-1 text-xs text-stone-500">rank {f.rank}</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{pct(c.share, 1)}</td>
                      <td className="py-1.5 text-right tabular-nums">{c.first_arrival_h} h</td>
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
