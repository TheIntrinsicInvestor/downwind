"use client";

import { Fragment, memo, type ReactNode } from "react";
import { arrivalLabel, driftLine, shortWib } from "@/lib/firecard";
import { type Fire, type Place, ageLabel, forecastTime, pct } from "@/lib/replay";

const PEOPLE_LABEL = "residents within 40 km of this fire's modelled smoke path";
const TIER_NAME = { 1: "Priority 1", 2: "Priority 2", 3: "Priority 3" } as const;

type Props = { fire: Fire; nRanked: number; onClose: () => void; windowStart: string;
  district: string | null; contribution?: Place["contributions"][number] };

const HINT = "cursor-help underline decoration-dotted decoration-ink-3/70 underline-offset-[3px]";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="label mb-3 border-b border-rule pb-1.5">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, className = "" }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-b border-rule py-2 first:pt-0 ${className}`}>
      <span className="min-w-0 text-ink-3">{label}</span>
      <span className="figure shrink-0 text-right text-[13px] text-ink">{value}</span>
    </div>
  );
}

function FireCard({ fire, nRanked, onClose, windowStart, district, contribution }: Props) {
  const topTen = fire.rank !== null && fire.rank <= 10;
  const drift = driftLine(fire.heading);
  const places = fire.top_places ?? [];
  return (
    <div className="text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`label ${topTen ? "text-ember-hot" : ""}`}>
            {fire.rank !== null ? `Rank ${fire.rank} of ${nRanked} Priority 1 fires` : TIER_NAME[fire.tier]}
          </p>
          <h2 className="mt-1.5 font-display text-[26px] leading-tight text-ink">{fire.place ?? "Unnamed location"}</h2>
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

      {(fire.people_40km !== null || fire.share !== null) && (
        <Section title={topTen ? "Why it ranks high" : "Residents under its smoke"}>
          {fire.people_40km !== null ? (
            <p>
              <span className="figure block text-[32px] leading-none tracking-[-0.02em] text-ink">{fire.people_40km.toLocaleString("en-US")}</span>
              <span className="mt-2 block leading-snug text-ink-2">{PEOPLE_LABEL}</span>
            </p>
          ) : fire.rank !== null && (
            <p className="text-xs text-ink-3">Residents near the smoke path are computed for the top 20 fires only.</p>
          )}
          {fire.share !== null && (
            <Row label="Share of smoke over residents" value={pct(fire.share, 1)} className={fire.people_40km !== null ? "mt-3" : ""} />
          )}
        </Section>
      )}

      {(drift || places.length > 0 || contribution) && (
        <Section title="Where the smoke goes">
          {contribution && district && (
            <div className="mb-3">
              {contribution.first_arrival_h != null && (
                <Row label={`First smoke over ${district}`} value={forecastTime(windowStart, contribution.first_arrival_h)} />
              )}
              <Row label={`Peak smoke over ${district}`}
                value={contribution.peak_h == null ? "Unavailable" : forecastTime(windowStart, contribution.peak_h)} />
            </div>
          )}
          {drift && <p className="text-ink">{drift}</p>}
          {places.length > 0 && (
            <>
              <p className={`${drift ? "mt-3" : ""} text-xs text-ink-3`}>Of this fire&apos;s smoke over residents:</p>
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_auto] border-t border-rule text-[13px]">
                <span className="label py-1.5">Place</span>
                <span className="label py-1.5 pl-4 text-right">Share</span>
                <span className="label py-1.5 pl-4 text-right">Smoke arrives</span>
                {places.map((p) => {
                  const peak = shortWib(windowStart, p.peak_h);
                  return (
                    <Fragment key={p.name}>
                      <span className="border-t border-rule py-2 text-ink-2">{p.name}</span>
                      <span className="figure border-t border-rule py-2 pl-4 text-right text-ink">{pct(p.share)}</span>
                      <span className="figure border-t border-rule py-2 pl-4 text-right text-ink">
                        {arrivalLabel(windowStart, p.first_arrival_h)}
                        {peak && <span className="block text-[11px] text-ink-3">Peak {peak}</span>}
                      </span>
                    </Fragment>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-ink-3">Times are WIB.</p>
            </>
          )}
        </Section>
      )}

      {(ageLabel(fire.age_days) || fire.persist_p !== null || fire.n_detect != null) && (
        <Section title="The fire">
          {ageLabel(fire.age_days) && (
            <Row value={ageLabel(fire.age_days)}
              label={<span title="Days in a row with a satellite detection in this square or next to it. Long-burning peat fires are often harder to put out."
                className={HINT}>Seen in this area</span>} />
          )}
          {fire.persist_p !== null && (
            <Row value={pct(fire.persist_p)}
              label={<span title="Learned from three past fire seasons. Cloud and smoke can hide a fire, so this is about detection, not certainty."
                className={HINT}>Likelihood of being seen again tomorrow</span>} />
          )}
          {fire.n_detect != null && <Row label="Satellite detections" value={String(fire.n_detect)} />}
        </Section>
      )}

      <Section title={fire.reach_km !== null ? "Getting there" : "Location"}>
        {fire.reach_km !== null && (
          <Row value={`${fire.reach_km.toFixed(1)} km`}
            label={<>Nearest mapped road
              <span className="mt-0.5 block text-xs">OpenStreetMap; plantation and logging tracks are often unmapped.</span></>} />
        )}
        <p className="figure mt-2 text-xs text-ink-3">{fire.lat.toFixed(3)}, {fire.lon.toFixed(3)}</p>
      </Section>
    </div>
  );
}

export default memo(FireCard);
