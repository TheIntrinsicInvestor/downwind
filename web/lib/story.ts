// The landing page's five-beat story (spec section 6) as data derived from one day file. Pure, so it is unit tested.

import { type Day, type Mode, longDate, pct, rankedFires } from "./replay";

export const STORY_DATE = "2026-09-20";

export type BeatId = "region" | "official" | "biggest" | "top" | "shortlist";
export type Camera = { center: [number, number]; zoom: number };
export type StoryFacts = {
  nLocations: number;                       // day.fires.length
  p1: number; p2: number; p3: number;       // day.counts
  biggest: { i: number; frp: number; place: string; rank: number; sharePct: string };   // sharePct = pct(share, 2)
  top: { i: number; frp: number; place: string; sizeRank: number; sharePct: string;     // sharePct = pct(share, 1)
         people: number; arrivalPlace: string; arrivalH: number };
  top10: number[];                          // fire indices, rank 1..10
  top10SharePct: string;                    // pct(day.top10_share)
};
export type Beat = {
  id: BeatId; n: string;                    // "01".."05"
  title: string; body: string;              // final copy with numbers filled in
  mode: Mode; focus: number[] | null;
  camera: Camera; cameraPhone: Camera;
  frame: number | "scrub";                  // "scrub": frame follows scroll progress inside the beat
};

const REGION: Camera = { center: [107.5, -1.0], zoom: 4.6 };
const PROVINCE: Camera = { center: [111.0, -0.6], zoom: 6.3 };
export const FIRE_ZOOM = 8.2;
// On desktop the text cards cover about the left 40% of a 1440 px viewport. Moving the camera centre this many pixels
// west of the fire puts the fire at about 67.5% across the screen (720 + 252 = 972 px). Tune here.
export const FIRE_OFFSET_PX = 252;
const PHONE_ZOOM_DROP = 1;
const STORY_FRAME = 12;

// MapLibre uses 512 px world tiles: at zoom z one pixel spans 360 / (512 * 2^z) degrees of longitude.
function degPerPx(zoom: number): number {
  return 360 / (512 * 2 ** zoom);
}

function fireCamera(lon: number, lat: number): Camera {
  return { center: [lon - FIRE_OFFSET_PX * degPerPx(FIRE_ZOOM), lat], zoom: FIRE_ZOOM };
}

// Phone: centred on the subject with no text-column offset, one zoom level lower (rounded: 8.2 - 1 is 7.199...).
function phone(lon: number, lat: number, zoom: number): Camera {
  return { center: [lon, lat], zoom: Math.round((zoom - PHONE_ZOOM_DROP) * 10) / 10 };
}

export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  const s = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

const num = (n: number) => n.toLocaleString("en-US");

export function storyFacts(day: Day): StoryFacts | null {
  const ranked = rankedFires(day);
  if (ranked.length === 0) return null;
  const fires = day.fires;

  const ti = ranked[0];
  const t = fires[ti];
  if (t.share === null || t.people_40km === null || !t.top_places || t.top_places.length === 0) return null;

  // Highest frp among ranked fires; ranked is in rank order, so a strict > keeps the best rank on ties.
  let bi = ranked[0];
  for (const i of ranked) if (fires[i].frp > fires[bi].frp) bi = i;
  const b = fires[bi];
  // Guard the fields the copy prints, so a body never reads "null" or "n/a".
  if (b.share === null || b.place === null || t.place === null || t.first_arrival_h === null) return null;

  const sizeRank = 1 + ranked.filter((i) => fires[i].frp > t.frp).length;

  return {
    nLocations: fires.length,
    p1: day.counts.p1, p2: day.counts.p2, p3: day.counts.p3,
    biggest: { i: bi, frp: b.frp, place: b.place, rank: b.rank as number, sharePct: pct(b.share, 2) },
    top: {
      i: ti, frp: t.frp, place: t.place, sizeRank, sharePct: pct(t.share, 1), people: t.people_40km,
      arrivalPlace: t.top_places[0].name, arrivalH: t.first_arrival_h,
    },
    top10: ranked.slice(0, 10),
    top10SharePct: pct(day.top10_share),
  };
}

export function beats(day: Day): Beat[] | null {
  const f = storyFacts(day);
  if (!f) return null;
  const bf = day.fires[f.biggest.i];
  const tf = day.fires[f.top.i];
  const arrival = f.top.arrivalH === 0 ? "from the start" : `after ${f.top.arrivalH} h`;

  const make = (id: BeatId, n: number, title: string, body: string, mode: Mode, focus: number[] | null,
    camera: Camera, cameraPhone: Camera, frame: number | "scrub"): Beat =>
    ({ id, n: String(n).padStart(2, "0"), title, body, mode, focus, camera, cameraPhone, frame });

  return [
    make("region", 1, "The region",
      `On the morning of ${longDate(day.date)}, satellites had picked up ${num(f.nLocations)} fire locations across the region.`,
      "downwind", null, REGION, phone(...REGION.center, REGION.zoom), STORY_FRAME),
    make("official", 2, "The official view",
      `Indonesia's rule sorts hotspots into three tiers. In West Kalimantan that morning, ${num(f.p1)} fires shared Priority 1, with no order among them.`,
      "official", null, PROVINCE, phone(...PROVINCE.center, PROVINCE.zoom), STORY_FRAME),
    make("biggest", 3, "The biggest fire",
      `The biggest Priority 1 fire burned at ${f.biggest.frp.toFixed(1)} MW in ${f.biggest.place}. Ranked ${ordinal(f.biggest.rank)} of ${num(f.p1)}. ${f.biggest.sharePct} of the day's smoke over residents.`,
      "downwind", [f.biggest.i], fireCamera(bf.lon, bf.lat), phone(bf.lon, bf.lat, FIRE_ZOOM), STORY_FRAME),
    make("top", 4, "The fire that matters most",
      `A smaller fire in ${f.top.place}, ${f.top.frp.toFixed(1)} MW, ranks first. Its smoke is over ${f.top.arrivalPlace} ${arrival}, with ${num(f.top.people)} residents within 40 km of its modelled smoke path. It holds ${f.top.sharePct} of the day's smoke over residents.`,
      "downwind", [f.top.i], fireCamera(tf.lon, tf.lat), phone(tf.lon, tf.lat, FIRE_ZOOM), "scrub"),
    make("shortlist", 5, "The short list",
      `Ten fires hold ${f.top10SharePct} of the smoke over residents. That is the list Downwind hands the task force each morning.`,
      "downwind", f.top10, PROVINCE, phone(...PROVINCE.center, PROVINCE.zoom), STORY_FRAME),
  ];
}

export function beatAt(progress: number, n = 5): { index: number; local: number } {
  const p = Math.min(1, Math.max(0, progress));
  const x = p * n;
  const index = Math.min(Math.floor(x), n - 1);
  return { index, local: x - index };
}
