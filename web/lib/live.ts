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

function parseManifest(value: unknown): Manifest {
  const m = value as Partial<Manifest> | null;
  if (!m || typeof m.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) ||
    typeof m.id !== "string" || !/^\d{4}-\d{2}-\d{2}-[a-f0-9]{32}$/.test(m.id) ||
    !m.id.startsWith(m.date) || m.source !== "VIIRS_NOAA21_NRT" ||
    ![m.generated_at, m.observation_cutoff, m.forecast_run].every((x) =>
      typeof x === "string" && Number.isFinite(Date.parse(x)))) {
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
  if (day.date !== manifest.date || day.hours !== 48 || !Array.isArray(day.fires) ||
    !Array.isArray(day.places) || day.frames?.length !== day.hours || !Array.isArray(limits.ignores)) {
    throw new Error("Invalid live snapshot");
  }
  let offset = 0;
  for (const frame of day.frames) {
    if (frame.offset !== offset || !Number.isSafeInteger(frame.count) || frame.count < 0) {
      throw new Error("Invalid live snapshot frame");
    }
    offset += frame.count * 8;
  }
  if (offset !== bin.byteLength) throw new Error("Live snapshot files do not match");
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
