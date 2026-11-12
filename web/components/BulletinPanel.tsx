"use client";

import { type Day, longDate } from "@/lib/replay";

export default function BulletinPanel({ day }: { day: Day }) {
  const b = day.bulletin;
  if (!b.text) return <p className="px-4 py-6 text-sm text-stone-600">No bulletin for this day yet.</p>;
  return (
    <article className="px-4 py-4 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Morning bulletin, {longDate(day.date)}</h3>
      <p className="mt-2 whitespace-pre-line leading-relaxed text-stone-900">{b.text}</p>
      <p className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-500">
        {b.source === "llm"
          ? `Written by ${b.model}. Every number was checked against the computed data.`
          : "Standard template (the AI draft failed its checks: every number must match the computed data, and the limits sentence must be intact)."}
      </p>
    </article>
  );
}
