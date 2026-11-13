// Replay file types and loaders. The types are the contract written by pipeline/dw/export.py (plan, Task 5).

export type Index = { days: string[]; default: string };
export type Day = {
  date: string;                 // T, the local morning being briefed, "2026-10-22"
  fires_date: string;           // T-1, UTC acquisition date of the fires
  window_start_utc: string;     // "2026-10-22T00:00Z"
  hours: 48;
  counts: { p1: number; p2: number; p3: number };          // province fires only
  top10_share: number;
  fires: Fire[];                                            // every simulated or detected square in the box
  places: Place[];                                          // Indonesian regencies receiving smoke
  stability: { seed_overlap: number; wind_level_overlap: number; cell: number; k: number; hindsight_overlap?: number };
  changes: { new_in_top10: number[]; left_top10: number } | null;   // indices into fires; null on the first day
  bulletin: { text: string; source: "llm" | "template"; model: string | null };
  frames: { offset: number; count: number }[];              // 48 entries, byte offsets into the .bin
};
export type Fire = {
  id: string; lat: number; lon: number; tier: 1 | 2 | 3; in_province: boolean;
  frp: number; n_detect: number; place: string | null;
  rank: number | null; share: number | null;                // province Priority 1 only
  people_40km: number | null;                               // 20 best-ranked only
  top_places: { name: string; share: number }[] | null;
  first_arrival_h: number | null; heading: string | null;
  reach_km: number | null;                                  // null until Task 13
  persist_p: number | null;                                 // null until Task 11
  age_days: number | null;                                  // days running in the area, capped at 14 (display only)
};
export type Place = { name: string; contributions: { fire: number; share: number; first_arrival_h: number }[] };  // top 15 per place
export type Limits = {
  replay2023: { pooled: 0.45; pontianak: 0.81; worst_quartile_hit: 0.48; chance: 0.25; airports: 7; days: 421 };
  learn: { shipped: boolean; test_auc_2026: number; heuristic_auc_2026: number; cv_auc: [number, number, number];
          base_rate_2026: number; visibility_correction: "tested, not used" } | null;   // set by Task 11
  ignores: string[]; not_claimed: string[];
};

export type Frame = { positions: Float32Array; fire: Uint16Array; alpha: Uint8Array };

export class ReplayError extends Error {
  constructor(public what: string, message: string) {
    super(message);
    this.name = "ReplayError";
  }
}

const BASE = "/replay";

async function get(url: string, what: string, message: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ReplayError(what, message);
  }
  if (!res.ok) throw new ReplayError(what, message);
  return res;
}

export async function loadIndex(): Promise<Index> {
  const msg = "The list of replay days could not be loaded.";
  const res = await get(`${BASE}/index.json`, "index", msg);
  try { return (await res.json()) as Index; } catch { throw new ReplayError("index", msg); }
}

export async function loadLimits(): Promise<Limits> {
  const msg = "The accuracy and limits data could not be loaded.";
  const res = await get(`${BASE}/limits.json`, "limits", msg);
  try { return (await res.json()) as Limits; } catch { throw new ReplayError("limits", msg); }
}

// The particle file is gzip on disk. If a server or browser has already unpacked it (no gzip magic bytes),
// use the bytes as they are.
async function gunzip(raw: ArrayBuffer): Promise<ArrayBuffer> {
  const u = new Uint8Array(raw);
  if (u.length < 2 || u[0] !== 0x1f || u[1] !== 0x8b) return raw;
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export async function loadDay(date: string): Promise<{ day: Day; bin: ArrayBuffer }> {
  const msg = `Replay data for ${date} could not be loaded.`;
  const [jr, br] = await Promise.all([
    get(`${BASE}/${date}.json`, date, msg),
    get(`${BASE}/${date}.particles.bin.gz`, date, msg),
  ]);
  try {
    const [day, raw] = await Promise.all([jr.json() as Promise<Day>, br.arrayBuffer()]);
    return { day, bin: await gunzip(raw) };
  } catch {
    throw new ReplayError(date, msg);
  }
}

const REC = 8;

export function decodeFrame(bin: ArrayBuffer, frame: { offset: number; count: number }): Frame {
  const n = frame.count;
  const positions = new Float32Array(n * 2);
  const fire = new Uint16Array(n);
  const alpha = new Uint8Array(n);
  if (n === 0) return { positions, fire, alpha };
  const v = new DataView(bin, frame.offset, n * REC);
  for (let i = 0; i < n; i++) {
    const o = i * REC;
    positions[2 * i] = 95 + ((v.getInt16(o, true) + 32768) / 65535) * 25;
    positions[2 * i + 1] = -8 + ((v.getInt16(o + 2, true) + 32768) / 65535) * 14;
    fire[i] = v.getUint16(o + 4, true);
    alpha[i] = v.getUint8(o + 6);
  }
  return { positions, fire, alpha };
}

// ---- display helpers

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// "Sun 20 Sep, 07:00 local (+0 h)": the hour `h` after the window start, in UTC+7.
export function localLabel(windowStartUtc: string, h: number): string {
  const t = new Date(Date.parse(windowStartUtc.replace("Z", ":00Z")) + (h + 7) * 3600_000);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][t.getUTCDay()];
  const hh = String(t.getUTCHours()).padStart(2, "0");
  return `${day} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()].slice(0, 3)}, ${hh}:00 local (+${h} h)`;
}

export function pct(x: number | null, digits = 0): string {
  return x === null ? "n/a" : `${(x * 100).toFixed(digits)}%`;
}

export function rankedFires(day: Day): number[] {
  return day.fires.map((_, i) => i).filter((i) => day.fires[i].rank !== null)
    .sort((a, b) => (day.fires[a].rank as number) - (day.fires[b].rank as number));
}

// ---- official-rule overlay

export type Mode = "official" | "downwind";

// Priority 1, 2, 3 (P.8/2018, our reading of Pasal 9)
export function tierColor(tier: 1 | 2 | 3): [number, number, number] {
  return tier === 1 ? [178, 34, 34] : tier === 2 ? [230, 150, 40] : [140, 140, 140];
}

// Indices of province fires in list order. Official: by tier, then id (the rule gives no order inside a tier).
// Downwind: Priority 1 by rank, then tiers 2 and 3 as in official.
export function orderForMode(fires: Fire[], mode: Mode): number[] {
  const idx = fires.map((_, i) => i).filter((i) => fires[i].in_province);
  const byTierId = (a: number, b: number) =>
    fires[a].tier - fires[b].tier || (fires[a].id < fires[b].id ? -1 : fires[a].id > fires[b].id ? 1 : 0);
  if (mode === "official") return idx.sort(byTierId);
  const ranked = idx.filter((i) => fires[i].rank !== null).sort((a, b) => (fires[a].rank as number) - (fires[b].rank as number));
  const rest = idx.filter((i) => fires[i].rank === null && fires[i].tier !== 1).sort(byTierId);
  return [...ranked, ...rest];
}

export function stabilityLine(s: Day["stability"]): string {
  const base = `${s.seed_overlap} of 10 of the top ten are the same on a rerun; ${s.wind_level_overlap} of 10 if surface winds are used instead.`;
  return s.hindsight_overlap === undefined ? base
    : `${base} The ranking uses the forecast available that morning; with the weather that actually followed, ${s.hindsight_overlap} of 10 stay.`;
}

export function ageLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days >= 14) return "14 days or more";
  return days === 1 ? "1 day" : `${days} days running`;
}

const VIS_LINE = "We also tested a learned correction of the smoke index against airport visibility; it did not beat the physics, so we do not use one.";

export function learnLine(learn: NonNullable<Limits["learn"]>): string {
  if (!learn.shipped) {
    return `A learned persistence model did not beat counting days burned on 2026, so the ranking assumes every fire keeps burning. ${VIS_LINE}`;
  }
  return `A learned model predicts which fires will be seen again tomorrow: AUC ${learn.test_auc_2026.toFixed(2)} on Sep to Oct 2026, a season it never saw (counting days burned: ${learn.heuristic_auc_2026.toFixed(2)}). Downwind weights each fire's smoke by it. ${VIS_LINE}`;
}

// ---- city view

export function placeOptions(day: Day): string[] {
  return day.places.map((p) => p.name).sort((a, b) => a.localeCompare(b));
}

export function contributionsFor(day: Day, name: string): Place["contributions"] {
  const p = day.places.find((x) => x.name === name);
  return p ? [...p.contributions].sort((a, b) => b.share - a.share) : [];
}
