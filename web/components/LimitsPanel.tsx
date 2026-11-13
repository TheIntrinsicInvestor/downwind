"use client";

import { type Day, type Limits, forecastLine, learnLine, stabilityLine } from "@/lib/replay";

type Props = { day: Day; limits: Limits | null; error: string | null };

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-stone-200 px-4 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h3>
      <div className="mt-2 space-y-2 text-sm text-stone-800">{children}</div>
    </section>
  );
}

export default function LimitsPanel({ day, limits, error }: Props) {
  if (!limits) {
    return <p className="px-4 py-6 text-sm text-stone-600">{error ?? "Loading accuracy and limits"}</p>;
  }
  const r = limits.replay2023;
  return (
    <div>
      <Block title="Tested on the 2023 haze season">
        <p>
          In a replay of the 2023 haze season at {r.airports === 7 ? "seven" : r.airports} airports, a smoke index built
          from the previous day&apos;s fires tracks observed visibility at {r.pooled.toFixed(2)} correlation,
          up to {r.pontianak.toFixed(2)} at Pontianak.
        </p>
        <p>
          It flags {Math.round(r.worst_quartile_hit * 100)}% of the worst-quartile haze days, against{" "}
          {Math.round(r.chance * 100)}% by chance.
        </p>
        <p>
          That test used archived weather close to what actually happened, not the forecast available each morning
          (no archive of past forecasts reaches back to 2023). The replay days below use the real forecast.
        </p>
        <p>
          Peat fires are weighted about 6 times heavier per unit of satellite-measured heat (GFAS emission factors,
          Kaiser et al. 2012). Adding this kept the 2023 correlation at 0.45 and moved the worst-day hit rate from 50% to 48%.
        </p>
        <p>The top-ten list is stable across reruns (9 to 10 of 10 kept).</p>
      </Block>
      {limits.forecast2026 && (
        <Block title="Tested on 2026 with the morning forecast">
          <p>{forecastLine(limits.forecast2026)}</p>
        </Block>
      )}
      {limits.learn && (
        <Block title="The learned model">
          <p>{learnLine(limits.learn)}</p>
        </Block>
      )}
      <Block title="This day's ranking">
        <p>{stabilityLine(day.stability)}</p>
      </Block>
      <Block title="What it ignores">
        <ul className="list-disc space-y-1 pl-5">{limits.ignores.map((x) => <li key={x}>{x}</li>)}</ul>
      </Block>
      <Block title="What we do not claim">
        <ul className="list-disc space-y-1 pl-5">{limits.not_claimed.map((x) => <li key={x}>{x}</li>)}</ul>
      </Block>
    </div>
  );
}
