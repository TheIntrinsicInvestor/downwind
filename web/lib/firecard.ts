// Pure formatting for the fire card: short WIB times and drift wording.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COMPASS_WORDS: Record<string, string> = {
  N: "north", NE: "north-east", E: "east", SE: "south-east",
  S: "south", SW: "south-west", W: "west", NW: "north-west",
};

// "Sun 13:00": the hour `h` after the window start, in WIB (UTC+7), same arithmetic as forecastTime.
export function shortWib(windowStartUtc: string, h: number | null | undefined): string | null {
  if (h === null || h === undefined || !Number.isFinite(h)) return null;
  const t = new Date(Date.parse(windowStartUtc) + (h + 7) * 3600_000);
  if (Number.isNaN(t.getTime())) return null;
  return `${DAYS[t.getUTCDay()]} ${String(t.getUTCHours()).padStart(2, "0")}:00`;
}

// Arrival cell: "Already there" at hour 0, a short time otherwise, "n/a" when missing.
export function arrivalLabel(windowStartUtc: string, h: number | null | undefined): string {
  if (h === null || h === undefined || !Number.isFinite(h)) return "n/a";
  return h === 0 ? "Already there" : shortWib(windowStartUtc, h) ?? "n/a";
}

// "north-west" for "NW"; null for anything else. Never names a place: the heading is a compass bearing only.
export function headingWords(heading: string | null | undefined): string | null {
  return heading ? COMPASS_WORDS[heading.toUpperCase()] ?? null : null;
}

export function driftLine(heading: string | null | undefined): string | null {
  const w = headingWords(heading);
  return w ? `Drifts ${w} over the first 24 hours` : null;
}
