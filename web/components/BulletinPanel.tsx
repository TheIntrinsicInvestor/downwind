"use client";

// The morning bulletin as a structured card: the day's tier counts, the three leading fires and what changed, all
// read straight from the day file (so they always match the fire cards), then the written summary in paragraphs.

import { memo } from "react";
import { type Day, bulletinParts, longDate, pct } from "@/lib/replay";
import { officialColor } from "@/lib/mapstyle";

const rgb = (t: 1 | 2 | 3) => `rgb(${officialColor(t).join(",")})`;

function BulletinPanel({ day }: { day: Day }) {
  const b = day.bulletin;
  const { leading, newPlaces, nNew, nLeft, paragraphs } = bulletinParts(day);
  const { p1, p2, p3 } = day.counts;
  return (
    <article className="text-[14px]">
      <h3 className="label">Morning bulletin, {longDate(day.date)}</h3>
      <p className="mt-1 text-xs text-ink-3">Fires detected on {longDate(day.fires_date)}, West Kalimantan.</p>

      <section aria-label="Tier counts" className="mt-4 border-t border-rule pt-3">
        <ul className="grid grid-cols-3 gap-2">
          {([[1, p1], [2, p2], [3, p3]] as const).map(([t, n]) => (
            <li key={t}>
              <span className="figure block text-[22px] leading-none text-ink">{n.toLocaleString("en-US")}</span>
              <span className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: rgb(t) }} aria-hidden="true" />
                Priority {t}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 leading-snug text-ink-2">
          The top ten fires carry <strong className="font-medium text-ink">{pct(day.top10_share)}</strong> of the modelled smoke over residents.
        </p>
      </section>

      {leading.length > 0 && (
        <section aria-labelledby="bulletin-leading" className="mt-4 border-t border-rule pt-3">
          <h4 id="bulletin-leading" className="label">Leading fires</h4>
          <ol className="mt-2 divide-y divide-rule">
            {leading.map(({ fire: f, detail }) => (
              <li key={f.id} className="flex gap-3 py-2.5">
                <span className="figure w-5 shrink-0 text-[18px] leading-tight text-ember-hot">{f.rank}</span>
                <div className="min-w-0">
                  <p className="text-ink">
                    Near {f.place ?? "an unnamed location"}: <strong className="font-medium">{pct(f.share, 1)}</strong> of the smoke over residents
                  </p>
                  {detail && <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="bulletin-changed" className="mt-4 border-t border-rule pt-3">
        <h4 id="bulletin-changed" className="label">Since the day before</h4>
        <p className="mt-2 leading-snug text-ink-2">
          {day.changes === null
            ? "First day of the replay, so there is no earlier list to compare."
            : nNew === 0
              ? "The top ten is unchanged."
              : <>{nNew} new in the top ten, near {newPlaces.join(", ")}. {nLeft} left it.</>}
        </p>
      </section>

      {paragraphs.length > 0 ? (
        <section aria-labelledby="bulletin-summary" className="mt-4 border-t border-rule pt-3">
          <h4 id="bulletin-summary" className="label">Summary</h4>
          {paragraphs.map((p, k) => <p key={k} className="mt-2 leading-[1.7] text-ink">{p}</p>)}
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            {b.source === "llm"
              ? `Written by ${b.model}. Every number was checked against the computed data; the check cannot catch a fact worded wrongly, so the fire cards are the reference.`
              : "Standard template, used when the AI service is unavailable or its draft fails the checks (every number must match the computed data, and the limits sentence must be intact)."}
          </p>
        </section>
      ) : (
        <p className="mt-4 border-t border-rule pt-3 text-ink-2">No written summary for this day yet.</p>
      )}
    </article>
  );
}

export default memo(BulletinPanel);
