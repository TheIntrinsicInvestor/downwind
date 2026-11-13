import { expect, test } from "vitest";
import type { Fire } from "./replay";
import { EMBER_CORE, fireFill, fireRadius, officialColor, smokeColorDomain, smokeRadiusPixels } from "./mapstyle";

function fire(rank: number | null, tier: 1 | 2 | 3 = 1, in_province = true): Fire {
  return { id: "f", lat: 0, lon: 110, tier, in_province, frp: 1, n_detect: 1, place: null, rank, share: rank ? 0.1 : null,
    people_40km: null, top_places: null, first_arrival_h: null, heading: null, reach_km: null, persist_p: null, age_days: null };
}
const N = 564;
const UNRANKED = [125, 135, 150, 70];

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
  expect(smokeRadiusPixels(8.25) / smokeRadiusPixels(7.25)).toBeCloseTo(2);
  expect(smokeColorDomain(6.25)[1] / smokeColorDomain(7.25)[1]).toBeCloseTo(0.5);
  expect(smokeRadiusPixels(4.6)).toBe(30);
  expect(smokeColorDomain(4.6)[1] / smokeColorDomain(7.25)[1]).toBeCloseTo(0.5);   // 30 px against 60 px
});
