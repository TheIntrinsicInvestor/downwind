"use client";

import { memo } from "react";
import { type Fire, ageLabel, pct } from "@/lib/replay";

const PEOPLE_LABEL = "residents within 40 km of this fire's modelled smoke path";
const TIER_NAME = { 1: "Priority 1", 2: "Priority 2", 3: "Priority 3" } as const;

type Props = { fire: Fire; nRanked: number; onClose: () => void };

const DT = "py-2 text-ink-3";
const DD = "figure py-2 pl-4 text-right text-[13px] text-ink";
const HINT = "cursor-help underline decoration-dotted decoration-ink-3/70 underline-offset-[3px]";

function FireCard({ fire, nRanked, onClose }: Props) {
  const top = fire.top_places?.[0];
  return (
    <div className="text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`label ${fire.rank !== null && fire.rank <= 10 ? "text-ember-hot" : ""}`}>
            {fire.rank !== null ? `Rank ${fire.rank} of ${nRanked} Priority 1 fires` : TIER_NAME[fire.tier]}
          </p>
          <h2 className="mt-1.5 font-display text-[26px] leading-tight text-ink">{fire.place ?? "Unnamed location"}</h2>
          <p className="figure mt-1 text-xs text-ink-3">{fire.lat.toFixed(3)}, {fire.lon.toFixed(3)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-ring -mr-2 -mt-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-ink-3 transition-colors hover:text-ink"
        >
          <span className="label text-inherit">Close</span>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {fire.people_40km !== null ? (
        <p className="mt-5 border-t border-rule pt-4">
          <span className="figure block text-[32px] leading-none tracking-[-0.02em] text-ink">{fire.people_40km.toLocaleString("en-US")}</span>
          <span className="mt-2 block leading-snug text-ink-2">{PEOPLE_LABEL}</span>
        </p>
      ) : fire.rank !== null && (
        <p className="mt-5 border-t border-rule pt-4 text-xs text-ink-3">Residents near the smoke path are computed for the top 20 fires only.</p>
      )}

      <dl className="mt-4 grid grid-cols-[1fr_auto] border-t border-rule [&>dd]:border-b [&>dd]:border-rule [&>dt]:border-b [&>dt]:border-rule">
        {fire.share !== null && (<><dt className={DT}>Share of smoke over residents</dt><dd className={DD}>{pct(fire.share, 1)}</dd></>)}
        {top && fire.first_arrival_h !== null && (
          <><dt className={DT}>First smoke over {top.name}</dt>
            <dd className={DD}>{fire.first_arrival_h === 0 ? "from the start" : `after ${fire.first_arrival_h} h`}</dd></>
        )}
        {fire.heading && (<><dt className={DT}>Smoke drift over first 24 h</dt><dd className={DD}>{fire.heading}</dd></>)}
        {fire.persist_p !== null && (
          <>
            <dt className={DT}>
              <span title="Learned from three past fire seasons. Cloud and smoke can hide a fire, so this is about detection, not certainty."
                className={HINT}>Likelihood of being seen again tomorrow</span>
            </dt>
            <dd className={DD}>{pct(fire.persist_p)}</dd>
          </>
        )}
        {ageLabel(fire.age_days) && (
          <>
            <dt className={DT}>
              <span title="Days in a row with a satellite detection in this square or next to it. Long-burning peat fires are often harder to put out."
                className={HINT}>Seen in this area</span>
            </dt>
            <dd className={DD}>{ageLabel(fire.age_days)}</dd>
          </>
        )}
        <dt className={DT}>Detections</dt><dd className={DD}>{fire.n_detect}</dd>
      </dl>

      {fire.top_places && fire.top_places.length > 0 && (
        <div className="mt-5">
          <p className="label">Places receiving its smoke</p>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {fire.top_places.map((p) => (
              <li key={p.name} className="flex justify-between gap-3 py-1.5">
                <span className="text-ink-2">{p.name}</span><span className="figure text-ink">{pct(p.share)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default memo(FireCard);
