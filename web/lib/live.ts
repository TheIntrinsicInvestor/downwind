import { gunzip, type Day, type Limits } from "./replay";

export type Manifest = {
  id: string;
  date: string;
  generated_at: string;
  observation_cutoff: string;
  forecast_run: string;
  source: "VIIRS_NOAA21_NRT";
};

export type LiveSnapshot = { manifest: Manifest; day: Day; bin: ArrayBuffer; limits: Limits };

const feed = (process.env.NEXT_PUBLIC_DOWNWIND_FEED_URL ||
  "https://raw.githubusercontent.com/TheIntrinsicInvestor/downwind/live-data").replace(/\/$/, "");

async function read(url: string, signal: AbortSignal, cache?: RequestCache) {
  const response = await fetch(url, { signal, cache });
  if (!response.ok) throw new Error(`Live feed returned HTTP ${response.status}`);
  return response;
}

const DAY_MS = 86_400_000;
const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;
const previousDate = (date: string) => new Date(Date.parse(date) - DAY_MS).toISOString().slice(0, 10);
const nullableString = (value: unknown) => value === null || typeof value === "string";
const nonnegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const count = (value: unknown) => nonnegative(value) && Number.isSafeInteger(value);
const fraction = (value: unknown) => nonnegative(value) && (value as number) <= 1;
const hour = (value: unknown) => value === null || (count(value) && (value as number) < 48);

function parseManifest(value: unknown): Manifest {
  const m = value as Partial<Manifest> | null;
  if (!m || typeof m.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) ||
    typeof m.id !== "string" || !/^\d{4}-\d{2}-\d{2}-[a-f0-9]{32}$/.test(m.id) ||
    !m.id.startsWith(m.date + "-") || m.source !== "VIIRS_NOAA21_NRT" ||
    !Number.isFinite(Date.parse(m.date)) || new Date(m.date).toISOString().slice(0, 10) !== m.date ||
    typeof m.generated_at !== "string" || !utcTimestamp.test(m.generated_at) ||
    !Number.isFinite(Date.parse(m.generated_at)) || Date.parse(m.generated_at) < Date.parse(m.date) ||
    m.observation_cutoff !== `${m.date}T00:00:00Z` ||
    m.forecast_run !== `${previousDate(m.date)}T12:00:00Z`) {
    throw new Error("Invalid live feed manifest");
  }
  return m as Manifest;
}

export async function refreshSnapshot(previous: LiveSnapshot | null, signal: AbortSignal): Promise<LiveSnapshot> {
  const manifest = parseManifest(await (await read(`${feed}/manifest.json`, signal, "no-store")).json());
  if (previous && (manifest.id === previous.manifest.id || manifest.date < previous.manifest.date ||
    Date.parse(manifest.generated_at) < Date.parse(previous.manifest.generated_at))) return previous;
  const root = `${feed}/snapshots/${manifest.id}`;
  const [day, bin, limits] = await Promise.all([
    read(`${root}/${manifest.date}.json`, signal).then((r) => r.json() as Promise<Day>),
    read(`${root}/${manifest.date}.particles.bin.gz`, signal).then((r) => r.arrayBuffer()).then(gunzip),
    read(`${root}/limits.json`, signal).then((r) => r.json() as Promise<Limits>),
  ]);
  if (!day || !limits || day.date !== manifest.date || day.fires_date !== previousDate(manifest.date) || day.hours !== 48 || !Array.isArray(day.fires) ||
    !Array.isArray(day.places) || !Array.isArray(day.frames) || day.frames.length !== day.hours ||
    !day.counts || ![day.counts.p1, day.counts.p2, day.counts.p3].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    typeof day.bulletin?.text !== "string" ||
    !["llm", "template"].includes(day.bulletin.source) || !nullableString(day.bulletin.model) ||
    day.window_start_utc !== `${manifest.date}T00:00Z` || !fraction(day.top10_share) ||
    (day.persistence_weighted !== undefined && typeof day.persistence_weighted !== "boolean") ||
    !limits.replay2023 || !Array.isArray(limits.ignores) || !limits.ignores.every((x) => typeof x === "string") ||
    !Array.isArray(limits.not_claimed) || !limits.not_claimed.every((x) => typeof x === "string")) {
    throw new Error("Invalid live snapshot");
  }
  if (![limits.replay2023.pooled, limits.replay2023.pontianak,
    limits.replay2023.worst_quartile_hit, limits.replay2023.chance, limits.replay2023.airports,
    limits.replay2023.days].every(Number.isFinite)) throw new Error("Invalid live snapshot accuracy");
  if (limits.forecast2026 && ![limits.forecast2026.forecast, limits.forecast2026.hindsight,
    limits.forecast2026.baseline, limits.forecast2026.pontianak, limits.forecast2026.airports,
    limits.forecast2026.days, limits.forecast2026.gain_low, limits.forecast2026.gain_high].every(Number.isFinite)) {
    throw new Error("Invalid live snapshot forecast accuracy");
  }
  if (limits.learn && ![limits.learn.test_auc_2026, limits.learn.heuristic_auc_2026].every(Number.isFinite)) {
    throw new Error("Invalid live snapshot learning accuracy");
  }
  const fireIndex = (i: number) => Number.isSafeInteger(i) && i >= 0 && i < day.fires.length;
  const ids = new Set<string>();
  for (const fire of day.fires) {
    if (!fire || typeof fire.id !== "string" || !fire.id || ids.has(fire.id) || !Number.isFinite(fire.lat) || !Number.isFinite(fire.lon) ||
      Math.abs(fire.lat) > 90 || Math.abs(fire.lon) > 180 || ![1, 2, 3].includes(fire.tier) ||
      typeof fire.in_province !== "boolean" || !nonnegative(fire.frp) || !count(fire.n_detect) ||
      !nullableString(fire.place) || !nullableString(fire.heading) || !hour(fire.first_arrival_h) ||
      (fire.rank !== null && (!count(fire.rank) || fire.rank < 1)) ||
      (fire.share !== null && !fraction(fire.share)) ||
      (fire.people_40km !== null && !count(fire.people_40km)) ||
      (fire.reach_km != null && !nonnegative(fire.reach_km)) ||
      (fire.persist_p != null && !fraction(fire.persist_p)) ||
      (fire.age_days != null && !count(fire.age_days)) ||
      (fire.top_places !== null && (!Array.isArray(fire.top_places) || fire.top_places.some((p) =>
        !p || typeof p.name !== "string" || !fraction(p.share))))) {
      throw new Error("Invalid live snapshot fire");
    }
    ids.add(fire.id);
  }
  for (const place of day.places) {
    if (!place || typeof place.name !== "string" || !Array.isArray(place.contributions) ||
      place.contributions.some((c) => !c || !fireIndex(c.fire) || !fraction(c.share) ||
        !hour(c.first_arrival_h) || (c.peak_h !== undefined && !hour(c.peak_h)))) {
      throw new Error("Invalid live snapshot place");
    }
  }
  if (day.changes && (!Array.isArray(day.changes.new_in_top10) || !day.changes.new_in_top10.every(fireIndex) || !count(day.changes.left_top10))) {
    throw new Error("Invalid live snapshot changes");
  }
  let offset = 0;
  for (const frame of day.frames) {
    if (!frame || frame.offset !== offset || !Number.isSafeInteger(frame.count) || frame.count < 0 || frame.count > 12_000) {
      throw new Error("Invalid live snapshot frame");
    }
    offset += frame.count * 8;
  }
  if (offset !== bin.byteLength) throw new Error("Live snapshot files do not match");
  const particles = new DataView(bin);
  for (let i = 4; i < bin.byteLength; i += 8) {
    if (!fireIndex(particles.getUint16(i, true))) throw new Error("Invalid live snapshot particle fire");
  }
  return { manifest, day, bin, limits };
}

export function isStale(manifest: Manifest, now: number): boolean {
  // Give the 07:12 WIB job time to fetch forecasts and publish.
  return now >= Date.parse(`${manifest.date}T00:00:00Z`) + (24 * 60 + 45) * 60_000;
}

export function wib(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Pontianak", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value)) + " WIB";
}
