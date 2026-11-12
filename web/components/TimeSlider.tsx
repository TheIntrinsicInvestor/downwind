"use client";

type Props = {
  frame: number;
  hours: number;
  playing: boolean;
  label: string;
  onFrame: (f: number) => void;
  onToggle: () => void;
};

export default function TimeSlider({ frame, hours, playing, label, onFrame, onToggle }: Props) {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg bg-white/95 px-3 py-2 text-sm shadow-md ring-1 ring-black/5">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Pause" : "Play"}
        className="w-16 shrink-0 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700"
      >
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        min={0}
        max={hours - 1}
        value={frame}
        aria-label="Hour of the 48 hour smoke window"
        onChange={(e) => onFrame(Number(e.target.value))}
        className="min-w-0 flex-1 accent-stone-900"
      />
      <span className="w-44 shrink-0 text-right tabular-nums text-stone-700 max-sm:w-28 max-sm:text-xs">{label}</span>
    </div>
  );
}
