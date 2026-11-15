// The landing page's seven-beat story as data derived from one day file. Pure, so it is unit tested. Beat 3 (in
// practice) is sourced copy; beat 7 (district offices) reads one place's smoke from the day file and is left out when
// that place is missing.

import { type Day, type Mode, forecastTime, longDate, pct, rankedFires } from "./replay";

export const STORY_DATE = "2026-09-20";
export const STORY_PLACE = "Ketapang";      // the district beat 7 follows

export type BeatId = "region" | "official" | "practice" | "biggest" | "top" | "shortlist" | "district";
export type Camera = { center: [number, number]; zoom: number };
export type StoryFacts = {
  nLocations: number;                       // day.fires.length
  p1: number; p2: number; p3: number;       // day.counts
  biggest: { i: number; frp: number; place: string; rank: number; sharePct: string };   // sharePct = pct(share, 2)
  top: { i: number; frp: number; place: string; sizeRank: number; sharePct: string;     // sharePct = pct(share, 1)
         people: number; arrivalPlace: string; arrivalH: number };
  top10: number[];                          // fire indices, rank 1..10
  top10SharePct: string;                    // pct(day.top10_share)
  district: DistrictFacts | null;           // STORY_PLACE's smoke; null if the day file lacks it
};
export type DistrictFacts = {
  name: string; firstH: number; peakH: number | null;   // hours after the window start; peak from the place's hourly levels
  sources: number[];                        // fire indices of its listed contributions, largest share first
  outside: number;                          // how many of those burn outside West Kalimantan
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
// Ketapang and the Central Kalimantan fires to its east that send it smoke on 20 September. Tune here.
const DISTRICT_VIEW: Camera = { center: [111.4, -2.1], zoom: 6.6 };
export const FIRE_ZOOM = 8.2;
// On desktop the text cards cover about the left 40% of a 1440 px viewport. Moving the camera centre this many pixels
// west of the fire puts the fire at about 67.5% across the screen (720 + 252 = 972 px). Tune here.
export const FIRE_OFFSET_PX = 252;
const PHONE_ZOOM_DROP = 1;
export const STORY_FRAME = 12;          // the smoke hour shown wherever the story does not scrub

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
    district: districtFacts(day, STORY_PLACE),
  };
}

// One place's smoke for beat 7: earliest arrival among its listed sources, the hour its level peaks, and how many of
// those sources are outside the province.
export function districtFacts(day: Day, name: string): DistrictFacts | null {
  const place = day.places.find((p) => p.name === name);
  if (!place || place.contributions.length === 0) return null;
  const arrivals = place.contributions.map((c) => c.first_arrival_h).filter((h): h is number => h !== null);
  if (arrivals.length === 0) return null;
  const h = place.hourly;
  const peakH = h && h.length ? h.indexOf(Math.max(...h)) : null;
  const sorted = [...place.contributions].sort((a, b) => b.share - a.share);
  const sources = sorted.map((c) => c.fire).filter((i) => day.fires[i] !== undefined);
  return { name, firstH: Math.min(...arrivals), peakH, sources,
    outside: sources.filter((i) => !day.fires[i].in_province).length };
}

// "Sun 09:00": the short form used on beat 7's figures.
export function shortTime(windowStartUtc: string, h: number): string {
  const full = forecastTime(windowStartUtc, h);                  // "Sun 20 Sep, 09:00 WIB"
  return `${full.slice(0, 3)} ${full.slice(full.indexOf(", ") + 2, full.indexOf(" WIB"))}`;
}

// Beat 3's sources, printed under its copy.
export const PRACTICE_SOURCES = "Kemenhut and ANTARA, 21 and 24 August 2026; BPBD Kalbar, 1 August 2026; Satgas Kalbar, 1 September 2026";
export const PRACTICE_MORE = "With hundreds of fires at once, crews cannot reach them all. Today, placement follows hotspot counts and patrol reports: in August, the provincial disaster agency focused air effort on the three regencies with the most hotspots and burned area. Nothing in that process counts who breathes the smoke.";

export function beats(day: Day): Beat[] | null {
  const f = storyFacts(day);
  if (!f) return null;
  const bf = day.fires[f.biggest.i];
  const tf = day.fires[f.top.i];
  const make = (id: BeatId, n: number, title: string, body: string, mode: Mode, focus: number[] | null,
    camera: Camera, cameraPhone: Camera, frame: number | "scrub"): Beat =>
    ({ id, n: String(n).padStart(2, "0"), title, body, mode, focus, camera, cameraPhone, frame });

  const list: Beat[] = [
    make("region", 1, "The region",
      `On the morning of ${longDate(day.date)}, satellites had picked up ${num(f.nLocations)} fire locations across the region.`,
      "downwind", null, REGION, phone(...REGION.center, REGION.zoom), STORY_FRAME),
    make("official", 2, "The official view",
      `Indonesia's rule (P.8/2018) sorts hotspots into three tiers to decide which get a field check first. In West Kalimantan that morning, ${num(f.p1)} fires shared Priority 1, with no order among them.`,
      "official", null, PROVINCE, phone(...PROVINCE.center, PROVINCE.zoom), STORY_FRAME),
    make("practice", 3, "In practice",
      "Crews are stretched. West Kalimantan had 265 specialist forest firefighters in August, and 48 days into the operation the ministry was rotating tired crews and sending reinforcements.",
      "official", null, PROVINCE, phone(...PROVINCE.center, PROVINCE.zoom), STORY_FRAME),
    make("biggest", 4, "The biggest fire",
      `The biggest Priority 1 fire burned at ${f.biggest.frp.toFixed(1)} MW in ${f.biggest.place}. Its smoke mostly missed people: ${f.biggest.sharePct} of the day's smoke over residents. Downwind ranks it ${ordinal(f.biggest.rank)} of ${num(f.p1)}.`,
      "downwind", [f.biggest.i], fireCamera(bf.lon, bf.lat), phone(bf.lon, bf.lat, FIRE_ZOOM), STORY_FRAME),
    make("top", 5, "The fire that matters most",
      `A smaller fire nearby, at ${f.top.frp.toFixed(1)} MW, sent its smoke towards ${num(f.top.people)} residents: ${f.top.sharePct} of the day's smoke over people. Downwind ranks it 1st.`,
      "downwind", [f.top.i], fireCamera(tf.lon, tf.lat), phone(tf.lon, tf.lat, FIRE_ZOOM), "scrub"),
    make("shortlist", 6, "The short list",
      `Ten fires hold ${f.top10SharePct} of the smoke over residents. That is the list Downwind hands the task force each morning.`,
      "downwind", f.top10, PROVINCE, phone(...PROVINCE.center, PROVINCE.zoom), STORY_FRAME),
  ];
  const d = f.district;
  if (d) {
    const peak = d.peakH === null ? "" : ` and peaks ${forecastTime(day.window_start_utc, d.peakH)}`;
    const where = d.outside === d.sources.length
      ? `All ${d.sources.length} of its largest sources burn outside West Kalimantan.`
      : `${d.outside} of its ${d.sources.length} largest sources ${d.outside === 1 ? "burns" : "burn"} outside West Kalimantan.`;
    list.push(make("district", 7, "For district offices",
      `The same smoke forecast tells each district what's coming. In ${d.name}, smoke arrives ${forecastTime(day.window_start_utc, d.firstH)}${peak}. ${where}`,
      "downwind", d.sources, DISTRICT_VIEW, phone(...DISTRICT_VIEW.center, DISTRICT_VIEW.zoom),
      d.peakH ?? STORY_FRAME));
  }
  return list;
}

// The camera that shows c's centre point dx px right of and dy px below the middle of the viewport, same zoom (exact
// Web Mercator, 512 px world). The landing page uses it to keep a beat's subject clear of its text column.
export function offsetCamera(c: Camera, dx: number, dy: number): Camera {
  if (dx === 0 && dy === 0) return c;
  const world = 512 * 2 ** c.zoom;
  const [lon, lat] = c.center;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) + (dy * 2 * Math.PI) / world;
  return { center: [lon - (dx * 360) / world, (Math.atan(Math.exp(y)) * 360) / Math.PI - 90], zoom: c.zoom };
}

export function beatAt(progress: number, n: number): { index: number; local: number } {
  const p = Math.min(1, Math.max(0, progress));
  const x = p * n;
  const index = Math.min(Math.floor(x), n - 1);
  return { index, local: x - index };
}
