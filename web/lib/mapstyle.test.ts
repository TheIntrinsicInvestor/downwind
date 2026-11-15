import { expect, test } from "vitest";
import type { Fire } from "./replay";
import { EMBER_CORE, PLACE_LABEL_MIN_ZOOM, SMOKE_MAX_RADIUS, fireFill, fireRadius, officialColor, pickFire, smokeColorDomain,
  smokeRadiusPixels } from "./mapstyle";

function fire(rank: number | null, tier: 1 | 2 | 3 = 1, in_province = true): Fire {
  return { id: "f", lat: 0, lon: 110, tier, in_province, frp: 1, n_detect: 1, place: null, rank, share: rank ? 0.1 : null,
    people_40km: null, top_places: null, first_arrival_h: null, heading: null, reach_km: null, persist_p: null, age_days: null };
}
const N = 564;
const UNRANKED = [150, 90, 60, 90];

test("ranks 1 and 10 get the core colour and radius 6000", () => {
  for (const r of [1, 10]) {
    expect(fireFill(fire(r), "downwind", N).slice(0, 3)).toEqual(EMBER_CORE);
    expect(fireRadius(fire(r), "downwind", N)).toBe(6000);
  }
});

test("rank 11 is more opaque than the last rank", () => {
  expect(fireFill(fire(11), "downwind", N)[3]).toBeGreaterThan(fireFill(fire(N), "downwind", N)[3]);
  expect(fireFill(fire(11), "downwind", N)[3]).toBe(220);
  expect(fireFill(fire(N), "downwind", N)[3]).toBe(110);
});

test("other ranked fires shrink with rank", () => {
  expect(fireRadius(fire(11), "downwind", N)).toBeCloseTo(1500 + 2500 * (1 - 10 / N));
  expect(fireRadius(fire(11), "downwind", N)).toBeGreaterThan(fireRadius(fire(N), "downwind", N));
});

test("an unranked fire gets radius 900 and the unranked colour in both modes", () => {
  expect(fireRadius(fire(null, 2), "downwind", N)).toBe(900);
  expect(fireRadius(fire(null, 1, false), "official", N)).toBe(900);
  expect(fireFill(fire(null, 2), "downwind", N)).toEqual(UNRANKED);
});

test("official mode: province Priority 1 gets officialColor(1); out-of-province gets the unranked colour", () => {
  expect(fireFill(fire(5, 1), "official", N)).toEqual([...officialColor(1), 230]);
  expect(fireRadius(fire(5, 1), "official", N)).toBe(2500);
  expect(fireFill(fire(null, 1, false), "official", N)).toEqual(UNRANKED);
});

test("official colours are three different cool colours", () => {
  const cs = ([1, 2, 3] as const).map((t) => officialColor(t));
  expect(new Set(cs.map((c) => c.join(","))).size).toBe(3);
  for (const [r, g, b] of cs) expect(r).toBeLessThan(Math.max(g, b));
});

test("smoke radius keeps the plume's width in km constant across zoom, floored against grain", () => {
  expect(smokeRadiusPixels(7.25)).toBeCloseTo(60);
  expect(smokeRadiusPixels(7.75) / smokeRadiusPixels(7.25)).toBeCloseTo(2 ** 0.5);
  expect(smokeRadiusPixels(4.6)).toBe(40);
});

test("smoke radius is capped at the ceiling at high zoom", () => {
  expect(smokeRadiusPixels(12)).toBe(SMOKE_MAX_RADIUS);
  expect(smokeRadiusPixels(10)).toBe(SMOKE_MAX_RADIUS);
  for (let z = 3; z <= 16; z += 0.25) expect(smokeRadiusPixels(z)).toBeLessThanOrEqual(SMOKE_MAX_RADIUS);
  expect(SMOKE_MAX_RADIUS).toBeLessThanOrEqual(100);     // HeatmapLayer's declared radiusPixels max
});

// The domain follows the radius in pixels (deck scales it by metres per texel), so it is fixed past the ceiling.
const perRadius = (z: number) => smokeColorDomain(z)[1] / smokeRadiusPixels(z);

test("from zoom 7.25 up the smoke domain follows the radius, and is fixed past the ceiling", () => {
  for (const z of [7.5, 8.2, 9, 10, 12]) expect(perRadius(z)).toBeCloseTo(perRadius(7.25), 10);
  expect(smokeColorDomain(12)).toEqual(smokeColorDomain(10));
});

test("below zoom 7.25 the veil is strengthened, at most 1.6-fold", () => {
  const boost = (z: number) => perRadius(7.25) / perRadius(z);
  expect(boost(6.3)).toBeGreaterThan(1.5);
  for (const z of [3, 4.6, 5.5, 6.3, 7]) expect(boost(z)).toBeLessThanOrEqual(1.6 + 1e-9);
});

test("a click near several fires picks the best-ranked one in the Downwind view, the nearest otherwise", () => {
  const fires = [fire(null, 2), fire(40), fire(3), fire(null, 1, false)];
  // hits arrive nearest first
  expect(pickFire([1, 2, 0], fires, "downwind")).toBe(2);
  expect(pickFire([0, 3], fires, "downwind")).toBe(0);
  expect(pickFire([1, 2], fires, "official")).toBe(1);
  expect(pickFire([], fires, "downwind")).toBeNull();
});

test("place labels start above the province view and below the close fire view", () => {
  expect(PLACE_LABEL_MIN_ZOOM).toBe(7);
  expect(PLACE_LABEL_MIN_ZOOM).toBeGreaterThan(6.3);   // story province zoom, app opening zoom 6.2
  expect(PLACE_LABEL_MIN_ZOOM).toBeLessThan(8.2);      // story fire zoom
});
