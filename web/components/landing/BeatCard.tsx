// One numbered story beat, bulletin style: Newsreader numeral and title over a hairline, the beat's sentence with its
// figures set in ink, then any extras (tier table, rank table, button). "float" is the desktop card over the map;
// "flat" is the phone panel under the map. Inactive cards fade back; the transition is opacity and transform only.

import { memo, type ReactNode } from "react";
import type { Beat } from "@/lib/story";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Wraps each occurrence of a token (a figure from the day file) in <strong>, longest token first.
function emphasise(text: string, tokens: string[]): ReactNode[] {
  const ts = [...new Set(tokens.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (ts.length === 0) return [text];
  const re = new RegExp(`(${ts.map(escape).join("|")})`, "g");
  return text.split(re).map((part, k) =>
    ts.includes(part) ? <strong key={k} className="font-medium text-ink">{part}</strong> : part);
}

type Props = {
  beat: Beat; active: boolean; emphasis: string[]; variant: "float" | "flat"; children?: ReactNode;
};

function BeatCard({ beat, active, emphasis, variant, children }: Props) {
  const titleId = `beat-${beat.id}-${variant}`;
  const shell = variant === "float"
    ? "panel w-full p-7 shadow-[0_6px_24px_rgb(80_55_30/0.12)]"
    : "w-full px-4 pb-6 pt-5";
  return (
    <article
      aria-labelledby={titleId}
      data-beat={beat.id}
      data-active={active}
      className={`${shell} transition-[opacity,translate] duration-700 ease-out motion-reduce:transition-none ${
        active ? "translate-y-0 opacity-100" : variant === "float" ? "translate-y-3 opacity-30" : "pointer-events-none translate-y-2 opacity-0"}`}
    >
      <header className="flex items-end gap-4 border-b border-rule pb-4">
        <span aria-hidden="true"
          className={`font-display font-normal leading-[0.8] text-ember-hot [font-variant-numeric:lining-nums] ${variant === "float" ? "text-[52px]" : "text-[40px]"}`}>
          {beat.n}
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className={`font-display leading-tight text-ink ${variant === "float" ? "text-[27px]" : "text-[22px]"}`}>
            {beat.title}
          </h2>
        </div>
      </header>
      <p className={`mt-4 leading-relaxed text-ink-2 ${variant === "float" ? "text-[17px]" : "text-[15px]"}`}>
        {emphasise(beat.body, emphasis)}
      </p>
      {children}
    </article>
  );
}

export default memo(BeatCard);
