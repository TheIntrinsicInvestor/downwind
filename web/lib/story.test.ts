import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { Day, Fire } from "./replay";
import { FIRE_OFFSET_PX, STORY_DATE, beatAt, beats, offsetCamera, ordinal, storyFacts } from "./story";

const dayPath = fileURLToPath(new URL(`../public/replay/${STORY_DATE}.json`, import.meta.url));
const loadGolden = (): Day => JSON.parse(readFileSync(dayPath, "utf-8")) as Day;

function fire(over: Partial<Fire>): Fire {
  return {
    id: "f", lat: -1, lon: 110, tier: 1, in_province: true, frp: 10, n_detect: 1, place: "Ketapang",
    rank: null, share: null, people_40km: null, top_places: null, first_arrival_h: null, heading: null,
    reach_km: null, persist_p: null, age_days: null, ...over,
  };
}

function minimalDay(fires: Fire[]): Day {
  return {
    date: "2026-09-20", fires_date: "2026-09-19", window_start_utc: "2026-09-20T00:00Z", hours: 48,
    counts: { p1: fires.length, p2: 0, p3: 0 }, top10_share: 0.5, fires, places: [],
    stability: { seed_overlap: 10, wind_level_overlap: 9, cell: 0.015, k: 10 }, changes: null,
    bulletin: { text: "", source: "template", model: null }, frames: [],
  };
}

test("golden: 20 September facts", () => {
  const f = storyFacts(loadGolden());
  expect(f).not.toBeNull();
  if (!f) return;
  expect(f.nLocations).toBe(3151);
  expect([f.p1, f.p2, f.p3]).toEqual([349, 297, 4]);
  expect(f.biggest).toMatchObject({ frp: 248, place: "Kayong Utara", rank: 20, sharePct: "1.06%" });
  expect(f.top).toMatchObject({
    frp: 194, place: "Kayong Utara", sizeRank: 3, sharePct: "6.1%", people: 2028881,
    arrivalPlace: "Kayong Utara", arrivalH: 0,
  });
  expect(f.top10.length).toBe(10);
  expect(f.top10SharePct).toBe("28%");
});

test("golden: beat copy", () => {
  const b = beats(loadGolden());
  expect(b).not.toBeNull();
  if (!b) return;
  expect(b.map((x) => x.id)).toEqual(["region", "official", "biggest", "top", "shortlist"]);
  expect(b[2].body).toContain("Ranked only 20th of 349");
  expect(b[2].body).toContain("1.06% of the day's smoke over residents");
  expect(b[3].body).toContain("2,028,881 residents");
  expect(b[3].body).toContain("from the start");
  expect(b[1].mode).toBe("official");
  for (const i of [0, 2, 3, 4]) expect(b[i].mode).toBe("downwind");
  expect(b[3].frame).toBe("scrub");
  for (const x of b) {
    for (const bad of ["—", "exposure", "undefined", "NaN", "n/a"]) expect(x.body).not.toContain(bad);
  }
});

test("golden: beat copy is the spec's sentences", () => {
  const b = beats(loadGolden());
  if (!b) throw new Error("no beats");
  expect(b.map((x) => x.title)).toEqual(
    ["The region", "The official view", "The biggest fire", "The fire that matters most", "The short list"]);
  expect(b.map((x) => x.n)).toEqual(["01", "02", "03", "04", "05"]);
  expect(b[0].body).toBe("On the morning of 20 September 2026, satellites had picked up 3,151 fire locations across the region.");
  expect(b[1].body).toBe("Indonesia's rule sorts hotspots into three tiers. In West Kalimantan that morning, 349 fires shared Priority 1, with no order among them.");
  expect(b[2].body).toBe("The biggest Priority 1 fire burned at 248.0 MW in Kayong Utara. Ranked only 20th of 349. 1.06% of the day's smoke over residents.");
  expect(b[3].body).toBe("A smaller fire in Kayong Utara, 194.0 MW, ranks first. Its smoke is over Kayong Utara from the start, with 2,028,881 residents within 40 km of its modelled smoke path. It holds 6.1% of the day's smoke over residents.");
  expect(b[4].body).toBe("Ten fires hold 28% of the smoke over residents. That is the list Downwind hands the task force each morning.");
});

test("golden: cameras, focus and frames", () => {
  const day = loadGolden();
  const f = storyFacts(day);
  const b = beats(day);
  if (!f || !b) throw new Error("no story");
  expect(b[0].camera).toEqual({ center: [107.5, -1.0], zoom: 4.6 });
  expect(b[1].camera).toEqual({ center: [111.0, -0.6], zoom: 6.3 });
  expect(b[4].camera).toEqual({ center: [111.0, -0.6], zoom: 6.3 });
  expect(b[0].cameraPhone).toEqual({ center: [107.5, -1.0], zoom: 3.6 });
  expect(b[1].cameraPhone).toEqual({ center: [111.0, -0.6], zoom: 5.3 });
  for (const [k, i] of [[2, f.biggest.i], [3, f.top.i]] as const) {
    const fr = day.fires[i];
    expect(b[k].camera.zoom).toBe(8.2);
    expect(b[k].camera.center[1]).toBe(fr.lat);
    // centre west of the fire by FIRE_OFFSET_PX screen pixels at zoom 8.2 (512 px tiles): fire sits right of the text
    expect((fr.lon - b[k].camera.center[0]) / (360 / (512 * 2 ** 8.2))).toBeCloseTo(FIRE_OFFSET_PX, 6);
    expect(b[k].cameraPhone).toEqual({ center: [fr.lon, fr.lat], zoom: 7.2 });
  }
  expect(b.map((x) => x.focus)).toEqual([null, null, [f.biggest.i], [f.top.i], f.top10]);
  expect(b.map((x) => x.frame)).toEqual([12, 12, 12, "scrub", 12]);
});

test("no ranked fires", () => {
  const day = minimalDay([fire({}), fire({ id: "g" })]);
  expect(storyFacts(day)).toBeNull();
  expect(beats(day)).toBeNull();
});

test("top fire missing people", () => {
  const day = minimalDay([
    fire({ rank: 1, share: 0.1, people_40km: null, top_places: [{ name: "Ketapang", share: 0.5 }], first_arrival_h: 3 }),
  ]);
  expect(storyFacts(day)).toBeNull();
  expect(beats(day)).toBeNull();
});

test("top fire missing arrival time gives null, not 'from the start'", () => {
  const day = minimalDay([
    fire({ rank: 1, share: 0.1, people_40km: 10, top_places: [{ name: "Sambas", share: 0.5 }], first_arrival_h: null }),
  ]);
  expect(storyFacts(day)).toBeNull();
});

test("arrival after some hours", () => {
  const day = minimalDay([
    fire({ rank: 1, frp: 50, share: 0.1, people_40km: 1234, top_places: [{ name: "Sambas", share: 0.5 }], first_arrival_h: 6 }),
    fire({ id: "g", rank: 2, frp: 80, share: 0.05 }),
  ]);
  const b = beats(day);
  if (!b) throw new Error("no beats");
  expect(b[3].body).toContain("Its smoke is over Sambas after 6 h, with 1,234 residents");
  expect(storyFacts(day)?.top.sizeRank).toBe(2);
});

test("beatAt", () => {
  expect(beatAt(-0.2)).toEqual({ index: 0, local: 0 });
  expect(beatAt(1.5)).toEqual({ index: 4, local: 1 });
  expect(beatAt(0.5)).toEqual({ index: 2, local: 0.5 });
});

test("ordinal", () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 150].map(ordinal))
    .toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "150th"]);
});

// Web Mercator, 512 px world tiles: screen x and y (y down) of a lon/lat at a zoom, for checking offsetCamera.
function screen(lon: number, lat: number, zoom: number): [number, number] {
  const world = 512 * 2 ** zoom;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [((lon + 180) / 360) * world, (1 - y / Math.PI) * (world / 2)];
}

test("offsetCamera puts the camera's centre point dx px right and dy px below the middle", () => {
  const c = { center: [110.12, -0.92] as [number, number], zoom: 8.2 };
  for (const [dx, dy] of [[280, 0], [0, -190], [-120, 75]]) {
    const o = offsetCamera(c, dx, dy);
    expect(o.zoom).toBe(c.zoom);
    const [sx, sy] = screen(...c.center, c.zoom);
    const [mx, my] = screen(...o.center, o.zoom);
    expect(sx - mx).toBeCloseTo(dx, 6);
    expect(sy - my).toBeCloseTo(dy, 6);
  }
  expect(offsetCamera(c, 0, 0)).toEqual(c);
});
