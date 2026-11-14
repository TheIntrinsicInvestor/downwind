// Pure geometry for the 48 h smoke-level chart (components/SmokeTimeline.tsx).
// Hour h is h hours after day.window_start_utc; clock labels are WIB (UTC+7).

export const REF_LEVEL = 100;                 // 100 = worst single hour any place had, 18 to 20 Sep 2026
export const WIB_OFFSET_H = 7;

export type Box = { w: number; h: number; left: number; right: number; top: number; bottom: number };

const MIN_MAX = 10;
const NICE = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** Top of the y axis: the data max (at least 10) rounded up to a 1/1.25/1.5/2/... x 10^n value. */
export function niceMax(dataMax: number): number {
  const m = Math.max(dataMax, MIN_MAX);
  const mag = 10 ** Math.floor(Math.log10(m));
  for (const n of NICE) if (n * mag >= m) return n * mag;
  return 10 * mag;
}

/** A level as a person reads it: whole numbers, "below 1" for traces, "0" for none. */
export function fmtLevel(v: number): string {
  return v <= 0 ? "0" : v < 1 ? "below 1" : String(Math.round(v));
}

export function peakIndex(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

export const hasSmoke = (values: number[]) => values.some((v) => v > 0);

export function xAt(i: number, n: number, b: Box): number {
  return b.left + (n <= 1 ? 0 : (i / (n - 1)) * (b.w - b.left - b.right));
}

export function yAt(v: number, max: number, b: Box): number {
  const ph = b.h - b.top - b.bottom;
  return b.top + ph - (Math.min(Math.max(v, 0), max) / max) * ph;
}

/** Index of the hour nearest to a pointer x (in chart coordinates). */
export function indexAtX(x: number, n: number, b: Box): number {
  const pw = b.w - b.left - b.right;
  return Math.min(n - 1, Math.max(0, Math.round(((x - b.left) / pw) * (n - 1))));
}

export function linePath(values: number[], max: number, b: Box): string {
  return values.map((v, i) => `${i ? "L" : "M"}${xAt(i, values.length, b).toFixed(1)} ${yAt(v, max, b).toFixed(1)}`).join("");
}

export function areaPath(values: number[], max: number, b: Box): string {
  const base = yAt(0, max, b).toFixed(1);
  const x0 = xAt(0, values.length, b).toFixed(1);
  const x1 = xAt(values.length - 1, values.length, b).toFixed(1);
  return `${linePath(values, max, b)}L${x1} ${base}L${x0} ${base}Z`;
}

/** WIB wall-clock hour (fractional) at the window start. */
export function wibStartHour(windowStartUtc: string): number {
  const t = new Date(Date.parse(windowStartUtc));
  return (t.getUTCHours() + t.getUTCMinutes() / 60 + WIB_OFFSET_H) % 24;
}

/** Night (18:00 to 06:00 WIB) as [from, to] ranges in hour-index space, clipped to [0, n-1]. */
export function nightSpans(windowStartUtc: string, n: number): [number, number][] {
  const s = wibStartHour(windowStartUtc);
  const last = n - 1;
  const out: [number, number][] = [];
  for (let k = -1; k <= Math.ceil((s + last) / 24) + 1; k++) {
    const from = Math.max(0, 24 * k - 6 - s), to = Math.min(last, 24 * k + 6 - s);
    if (to > from) out.push([from, to]);
  }
  return out;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Vertical lines at each WIB midnight inside the window, labelled "Sun 15". */
export function midnights(windowStartUtc: string, n: number): { h: number; label: string }[] {
  const s = wibStartHour(windowStartUtc);
  const startMs = Date.parse(windowStartUtc);
  const out: { h: number; label: string }[] = [];
  for (let k = 0; k <= Math.ceil((s + n) / 24); k++) {
    const h = 24 * k - s;
    if (h <= 0 || h > n - 1) continue;
    const t = new Date(startMs + (h + WIB_OFFSET_H) * 3600_000);
    out.push({ h, label: `${DAYS[t.getUTCDay()]} ${t.getUTCDate()}` });
  }
  return out;
}

/** Clock ticks every `step` WIB hours (not at midnight, which has its own line): "13:00". */
export function clockTicks(windowStartUtc: string, n: number, step = 6): { h: number; label: string }[] {
  const s = wibStartHour(windowStartUtc);
  const out: { h: number; label: string }[] = [];
  for (let a = Math.ceil(s / step) * step; a <= s + n - 1; a += step) {
    const wall = a % 24;
    if (wall === 0) continue;
    out.push({ h: a - s, label: `${String(wall).padStart(2, "0")}:00` });
  }
  return out;
}
