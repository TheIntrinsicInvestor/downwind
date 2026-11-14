import type { Feature, FeatureCollection, Point } from "geojson";

export type FacilityKind = "school" | "health";
export type Facility = Feature<Point, { kind: FacilityKind; name: string; district: string; osm_url: string }>;
export type FacilityDataset = FeatureCollection<Point, Facility["properties"]> & {
  metadata: { source: string; extracted_at: string; licence: string; coverage: string };
};

// Display thresholds, not health thresholds: a facility counts when any sampled animation particle passes within
// NEAR_KM during the 48-hour outlook (the same 2 km margin the Sites panel uses).
export const NEAR_KM = 2;
// Local school hours (WIB), roughly 07:00 to 13:00. Many Indonesian schools also run on Saturdays; Sundays are skipped.
export const SCHOOL_START = 7;
export const SCHOOL_END = 13;

const CELL = 0.02;                       // degrees, about 2.2 km: neighbouring cells cover the 2 km margin
const KM_PER_DEG = 111.195;

export function isFacilityDataset(data: unknown): data is FacilityDataset {
  const d = data as FacilityDataset;
  return d?.type === "FeatureCollection" && Array.isArray(d.features) && !!d.metadata?.extracted_at &&
    d.features.every((f) => f?.geometry?.type === "Point" && (f.properties?.kind === "school" || f.properties?.kind === "health") &&
      typeof f.properties?.district === "string");
}

export function facilitiesIn(dataset: FacilityDataset, district: string): Facility[] {
  return dataset.features.filter((f) => f.properties.district === district);
}

// For each facility, the hours (0 to 47) with any sampled smoke particle within NEAR_KM.
export function smokeHoursNear(bin: ArrayBuffer, frames: { offset: number; count: number }[], facilities: Facility[]): number[][] {
  const out: number[][] = facilities.map(() => []);
  if (!facilities.length) return out;
  const data = new DataView(bin);
  for (let h = 0; h < frames.length; h++) {
    const cells = new Map<string, number[]>();
    const frame = frames[h];
    for (let n = 0; n < frame.count; n++) {
      const o = frame.offset + n * 8;
      if (data.getUint8(o + 6) === 0) continue;
      const lon = 95 + (data.getInt16(o, true) + 32768) / 65535 * 25;
      const lat = -8 + (data.getInt16(o + 2, true) + 32768) / 65535 * 14;
      const key = `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`;
      const list = cells.get(key);
      if (list) list.push(lon, lat); else cells.set(key, [lon, lat]);
    }
    if (!cells.size) continue;
    facilities.forEach((f, i) => {
      const [flon, flat] = f.geometry.coordinates;
      const cx = Math.floor(flon / CELL), cy = Math.floor(flat / CELL);
      const kx = KM_PER_DEG * Math.cos(flat * Math.PI / 180);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const pts = cells.get(`${cx + dx},${cy + dy}`);
        if (!pts) continue;
        for (let p = 0; p < pts.length; p += 2) {
          if (Math.hypot((pts[p] - flon) * kx, (pts[p + 1] - flat) * KM_PER_DEG) <= NEAR_KM) {
            out[i].push(h); dx = dy = 2; break;
          }
        }
      }
    });
  }
  return out;
}

function localTime(windowStartUtc: string, h: number) {
  const t = new Date(Date.parse(windowStartUtc) + (h + 7) * 3600_000);
  return { hour: t.getUTCHours(), weekday: t.getUTCDay() };
}

export function inSchoolHours(windowStartUtc: string, h: number): boolean {
  const { hour, weekday } = localTime(windowStartUtc, h);
  return weekday !== 0 && hour >= SCHOOL_START && hour < SCHOOL_END;
}

export type FacilitySummary = {
  schools: { total: number; near: number }; health: { total: number; near: number };
  schoolHoursAt: number | null;          // first hour with smoke near a school during school hours
  schoolSmokeAt: number | null;          // first hour with smoke near any school
  near: { facility: Facility; firstHour: number }[];   // facilities near smoke, earliest first, then by name
};

export function summarise(facilities: Facility[], hours: number[][], windowStartUtc: string): FacilitySummary {
  const s: FacilitySummary = { schools: { total: 0, near: 0 }, health: { total: 0, near: 0 },
    schoolHoursAt: null, schoolSmokeAt: null, near: [] };
  facilities.forEach((f, i) => {
    const bucket = f.properties.kind === "school" ? s.schools : s.health;
    bucket.total++;
    const hs = hours[i];
    if (!hs.length) return;
    bucket.near++;
    s.near.push({ facility: f, firstHour: hs[0] });
    if (f.properties.kind === "school") {
      if (s.schoolSmokeAt === null || hs[0] < s.schoolSmokeAt) s.schoolSmokeAt = hs[0];
      const during = hs.find((h) => inSchoolHours(windowStartUtc, h));
      if (during !== undefined && (s.schoolHoursAt === null || during < s.schoolHoursAt)) s.schoolHoursAt = during;
    }
  });
  s.near.sort((a, b) => a.firstHour - b.firstHour || a.facility.properties.name.localeCompare(b.facility.properties.name));
  return s;
}

export function facilityName(f: Facility): string {
  return f.properties.name || (f.properties.kind === "school" ? "Unnamed school" : "Unnamed clinic or hospital");
}
