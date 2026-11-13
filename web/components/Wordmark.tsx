import Link from "next/link";

const SIZES = {
  sm: { mark: 24, text: "text-lg", gap: "gap-2" },
  md: { mark: 34, text: "text-[23px]", gap: "gap-3" },
};

/** The Downwind mark: an ember point with a two-stroke plume drifting downwind. Same geometry as app/icon.svg. */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <circle cx="9.5" cy="22.5" r="8" fill="var(--ember)" opacity="0.3" />
      <circle cx="9.5" cy="22.5" r="5" fill="var(--ember)" />
      <circle cx="9.5" cy="22.5" r="2.3" fill="var(--ember-core)" />
      <path d="M14 16.5C17.5 13 20.5 15 23.5 11S27 6 28.5 5.5" fill="none" stroke="var(--smoke)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 22C19.5 19.5 22.5 21.5 27.5 17.5" fill="none" stroke="var(--smoke)" strokeWidth="2.2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export default function Wordmark({ size = "md" }: { size?: "sm" | "md" }) {
  const s = SIZES[size];
  return (
    <Link href="/" className={`inline-flex items-center ${s.gap} text-ink no-underline`}>
      <Mark size={s.mark} />
      <span className={`font-display ${s.text} font-normal tracking-[-0.01em] leading-none`}>Downwind</span>
    </Link>
  );
}
