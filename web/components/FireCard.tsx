"use client";

import { type Fire, pct } from "@/lib/replay";

const PEOPLE_LABEL = "residents within 40 km of this fire's modelled smoke path";
const TIER_NAME = { 1: "Priority 1", 2: "Priority 2", 3: "Priority 3" } as const;

type Props = { fire: Fire; nRanked: number; onClose: () => void };

export default function FireCard({ fire, nRanked, onClose }: Props) {
  const top = fire.top_places?.[0];
  return (
    <div className="border-b border-stone-200 bg-stone-50 px-4 py-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            {fire.rank !== null ? `Rank ${fire.rank} of ${nRanked} Priority 1 fires` : TIER_NAME[fire.tier]}
          </p>
          <h2 className="mt-0.5 text-base font-semibold text-stone-900">{fire.place ?? "Unnamed location"}</h2>
          <p className="text-xs text-stone-500">{fire.lat.toFixed(3)}, {fire.lon.toFixed(3)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-stone-500 hover:bg-stone-200" aria-label="Close">
          Close
        </button>
      </div>

      {fire.people_40km !== null ? (
        <p className="mt-3">
          <span className="text-2xl font-semibold tabular-nums text-stone-900">{fire.people_40km.toLocaleString("en-US")}</span>
          <span className="block text-stone-600">{PEOPLE_LABEL}</span>
        </p>
      ) : fire.rank !== null && (
        <p className="mt-3 text-xs text-stone-500">Residents near the smoke path are computed for the top 20 fires only.</p>
      )}

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {fire.share !== null && (<><dt className="text-stone-500">Share of smoke over residents</dt><dd className="tabular-nums">{pct(fire.share, 1)}</dd></>)}
        {top && fire.first_arrival_h !== null && (
          <><dt className="text-stone-500">First smoke over {top.name}</dt>
            <dd className="tabular-nums">{fire.first_arrival_h === 0 ? "from the start" : `after ${fire.first_arrival_h} h`}</dd></>
        )}
        {fire.heading && (<><dt className="text-stone-500">Smoke drift over first 24 h</dt><dd>{fire.heading}</dd></>)}
        {fire.persist_p !== null && (
          <>
            <dt className="text-stone-500">
              <span title="Learned from three past fire seasons. Cloud and smoke can hide a fire, so this is about detection, not certainty."
                className="cursor-help underline decoration-dotted underline-offset-2">Likelihood of being seen again tomorrow</span>
            </dt>
            <dd className="tabular-nums">{pct(fire.persist_p)}</dd>
          </>
        )}
        <dt className="text-stone-500">Detections</dt><dd className="tabular-nums">{fire.n_detect}</dd>
      </dl>

      {fire.top_places && fire.top_places.length > 0 && (
        <div className="mt-3">
          <p className="text-stone-500">Places receiving its smoke</p>
          <ul className="mt-1 space-y-0.5">
            {fire.top_places.map((p) => (
              <li key={p.name} className="flex justify-between"><span>{p.name}</span><span className="tabular-nums">{pct(p.share)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
