"use client";

import { memo } from "react";
import { type Day, longDate } from "@/lib/replay";

function BulletinPanel({ day }: { day: Day }) {
  const b = day.bulletin;
  if (!b.text) return <p className="py-2 text-sm text-ink-2">No bulletin for this day yet.</p>;
  return (
    <article>
      <h3 className="label">Morning bulletin, {longDate(day.date)}</h3>
      <p className="mt-3 whitespace-pre-line text-[14px] leading-[1.7] text-ink">{b.text}</p>
      <p className="mt-5 border-t border-rule pt-3 text-xs leading-relaxed text-ink-3">
        {b.source === "llm"
          ? `Written by ${b.model}. Every number was checked against the computed data; the check cannot catch a fact worded wrongly, so the fire cards are the reference.`
          : "Standard template, used when the AI service is unavailable or its draft fails the checks (every number must match the computed data, and the limits sentence must be intact)."}
      </p>
    </article>
  );
}

export default memo(BulletinPanel);
