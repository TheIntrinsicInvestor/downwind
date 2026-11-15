// Beat 6's table: the best-ranked fires it is given (five of the ten) as a bulletin table (rank numeral, place, heat,
// share of smoke over residents). Every figure comes from the day file; shares go through pct().

import { memo } from "react";
import { type Day, pct } from "@/lib/replay";

function RankTable({ day, fires }: { day: Day; fires: number[] }) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">The {fires.length} best-ranked Priority 1 fires on the morning of the replay day</caption>
      <thead>
        <tr className="label border-b border-rule">
          <th scope="col" className="w-10 pb-2 pr-3 text-right font-normal">Rank</th>
          <th scope="col" className="pb-2 font-normal">Location</th>
          <th scope="col" className="pb-2 pl-3 text-right font-normal">Heat</th>
          <th scope="col" className="pb-2 pl-3 text-right font-normal">Share of smoke over residents</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule">
        {fires.map((i) => {
          const f = day.fires[i];
          return (
            <tr key={f.id}>
              <td className="py-[5px] pr-3 text-right font-display text-lg leading-none text-ember-hot [font-variant-numeric:lining-nums_tabular-nums]">
                {f.rank}
              </td>
              <td className="py-[5px] text-sm text-ink">{f.place ?? `${f.lat.toFixed(2)}, ${f.lon.toFixed(2)}`}</td>
              <td className="figure whitespace-nowrap py-[5px] pl-3 text-right text-[13px] text-ink-2">{Math.round(f.frp)} MW</td>
              <td className="figure whitespace-nowrap py-[5px] pl-3 text-right text-[13px] text-ink">{pct(f.share, 1)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr><td colSpan={4} className="pt-2 text-xs text-ink-3">{fires.length < 10 && `Top ${fires.length} of the ten shown. `}Fires are named by regency, so several share a name.</td></tr>
      </tfoot>
    </table>
  );
}

export default memo(RankTable);
