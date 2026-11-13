"use client";

import type { CSSProperties } from "react";

type Props = {
  frame: number;
  hours: number;
  playing: boolean;
  label: string;
  onFrame: (f: number) => void;
  onToggle: () => void;
};

export default function TimeSlider({ frame, hours, playing, label, onFrame, onToggle }: Props) {
  const fill = { "--fill": `${(frame / Math.max(hours - 1, 1)) * 100}%` } as CSSProperties;
  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 sm:flex-nowrap">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Pause" : "Play"}
        className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 border border-rule px-3 text-ink transition-colors hover:border-ember hover:text-ember-hot sm:w-[5.5rem]"
      >
        <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
          {playing
            ? <path d="M1.5 1v10M8.5 1v10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            : <path d="M1 1.2v9.6a.4.4 0 0 0 .6.35l8-4.8a.4.4 0 0 0 0-.7l-8-4.8A.4.4 0 0 0 1 1.2z" fill="currentColor" />}
        </svg>
        <span className="label text-inherit max-sm:sr-only">{playing ? "Pause" : "Play"}</span>
      </button>
      <input
        type="range"
        min={0}
        max={hours - 1}
        value={frame}
        aria-label="Hour of the 48 hour smoke window"
        onChange={(e) => onFrame(Number(e.target.value))}
        style={fill}
        className="range min-w-0 flex-1"
      />
      <span className="figure shrink-0 text-right text-xs text-ink-2 max-sm:order-first max-sm:w-full max-sm:text-left max-sm:text-[11px] sm:w-[14.5rem]">
        {label}
      </span>
    </div>
  );
}
