import Link from "next/link";

const SIZES = {
  sm: { mark: 18, text: "text-base", gap: "gap-2" },
  md: { mark: 34, text: "text-[23px]", gap: "gap-2.5" },
};

// Aspect of the traced mark's viewBox (866 x 418): the mark is wide, so it is sized by height.
const MARK_W = 866;
const MARK_H = 418;

/** The Downwind mark: a flame with two wind streaks, traced from the chosen logo (logo/downwind-mark.svg). One ember path. */
function Mark({ height }: { height: number }) {
  return (
    <svg width={Math.round((height * MARK_W) / MARK_H)} height={height} viewBox={`0 0 ${MARK_W} ${MARK_H}`} aria-hidden="true" className="shrink-0">
      <path fill="var(--ember)" fillRule="evenodd" d="M 149.5 24.7 C 140.9 26.9, 138.7 31.7, 137.9 50.5 C 136.3 84.3, 130.4 94.7, 88.8 136.5 C 50.8 174.7, 38.2 192.4, 30 218.8 C 0.5 314.7, 83.2 404.6, 190.5 393.1 C 228.6 389, 256.7 378.6, 309 349.5 C 369.3 315.9, 399.6 303, 437 295 C 482 285.5, 532.6 289.4, 576.8 306 C 591.5 311.5, 597 310.8, 602.1 302.7 C 607.7 293.8, 602.8 285, 589.6 280 C 536.1 259.5, 476.1 255.4, 422.3 268.6 C 385.3 277.6, 352.8 291.8, 293 325.2 C 231.8 359.4, 189.1 370.4, 147.4 362.7 C 62.3 347.1, 25.3 258.5, 76.1 191.9 C 80.1 186.7, 94.2 171.6, 107.9 158 C 146.8 119.4, 157.5 103.8, 164.4 75.8 L 166.6 66.7 171.4 72.1 C 187.3 90.2, 192.5 117.1, 186.1 148.6 C 182.6 166, 183 172.5, 187.7 181.3 C 202.1 207.6, 242.4 202.6, 256.4 172.8 C 259.7 165.6, 259.4 165.5, 263.5 174.3 C 288.5 226.9, 264.3 284.4, 211.9 297 C 152.7 311.2, 110 259.4, 149.1 220.8 C 160.1 210, 162.1 201.8, 155.4 194.9 C 138.9 177.6, 105.6 216.4, 105.6 253 C 105.6 307.8, 163.1 341.4, 225.7 323.4 C 303.4 300.9, 327.2 202.5, 271.6 133.3 C 260.5 119.6, 255.1 116.8, 247.3 120.7 C 242 123.3, 240.2 126.4, 238.6 135.5 C 234.8 157, 226.3 170, 216.1 170 C 211.2 170, 210.8 167.7, 213.5 156.4 C 226.6 101.8, 209 56.7, 163.5 28.3 C 158.4 25.1, 153.1 23.8, 149.5 24.7 M 440.8 197.5 C 400 203, 348.7 222, 342.5 234 C 339.1 240.5, 341.7 249, 348.2 253 C 353.7 256.4, 357.8 255.6, 370.3 249.1 C 428.7 218.4, 485.8 216.7, 591 242.5 C 682.7 265, 722.1 268, 768.7 256.1 C 796.4 249, 833.5 229.3, 839.7 218.4 C 848.2 203.6, 831.5 189.8, 817.8 200.3 C 766 239.8, 713.8 243.3, 600 215 C 561.2 205.4, 540.7 200.9, 523 198.4 C 506.8 196.1, 455.5 195.6, 440.8 197.5" />
    </svg>
  );
}

export default function Wordmark({ size = "md" }: { size?: "sm" | "md" }) {
  const s = SIZES[size];
  return (
    <Link href="/" className={`inline-flex items-center ${s.gap} text-ink no-underline`}>
      <Mark height={s.mark} />
      <span className={`font-display ${s.text} font-normal tracking-[-0.01em] leading-none`}>Downwind</span>
    </Link>
  );
}
