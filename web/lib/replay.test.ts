import { gzipSync } from "node:zlib";
import { afterEach, expect, test, vi } from "vitest";
import { ReplayError, decodeFrame, loadDay } from "./replay";

afterEach(() => vi.unstubAllGlobals());

test("decodeFrame converts quantised records to lon/lat", () => {
  const buf = new ArrayBuffer(16); const v = new DataView(buf);
  v.setInt16(0, -32768, true); v.setInt16(2, -32768, true); v.setUint16(4, 7, true); v.setUint8(6, 255);
  v.setInt16(8, 32767, true);  v.setInt16(10, 32767, true); v.setUint16(12, 9, true); v.setUint8(14, 128);
  const f = decodeFrame(buf, { offset: 0, count: 2 });
  expect(Array.from(f.positions)).toEqual([95, -8, 120, 6]);
  expect(Array.from(f.fire)).toEqual([7, 9]); expect(Array.from(f.alpha)).toEqual([255, 128]);
});

test("decodeFrame reads a frame at its byte offset", () => {
  const buf = new ArrayBuffer(24); const v = new DataView(buf);
  v.setInt16(16, 0, true); v.setInt16(18, 0, true); v.setUint16(20, 3, true); v.setUint8(22, 10);
  const f = decodeFrame(buf, { offset: 16, count: 1 });
  expect(f.positions[0]).toBeCloseTo(95 + (32768 / 65535) * 25, 4);
  expect(Array.from(f.fire)).toEqual([3]);
});

test("decodeFrame with count 0 returns empty arrays", () => {   // Review Focus 3
  const f = decodeFrame(new ArrayBuffer(0), { offset: 0, count: 0 });
  expect(f.positions.length).toBe(0); expect(f.fire.length).toBe(0); expect(f.alpha.length).toBe(0);
});

test("loadDay throws ReplayError on 404", async () => {           // Review Focus 5
  vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
  const err = await loadDay("2026-09-20").catch((e) => e);
  expect(err).toBeInstanceOf(ReplayError);
  expect(err.message).toContain("2026-09-20");
});

test("loadDay throws ReplayError when the network fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  await expect(loadDay("2026-09-19")).rejects.toBeInstanceOf(ReplayError);
});

test("loadDay unpacks the gzip particle file", async () => {
  const raw = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const gz = gzipSync(raw);
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    url.endsWith(".json")
      ? new Response(JSON.stringify({ date: "2026-09-20" }), { status: 200 })
      : new Response(gz, { status: 200 })));
  const { day, bin } = await loadDay("2026-09-20");
  expect(day.date).toBe("2026-09-20");
  expect(Array.from(new Uint8Array(bin))).toEqual(Array.from(raw));
});

import { orderForMode, tierColor } from "./replay";
import type { Fire } from "./replay";

function fire(id: string, tier: 1 | 2 | 3, rank: number | null, in_province = true): Fire {
  return { id, lat: 0, lon: 110, tier, in_province, frp: 1, n_detect: 1, place: null, rank, share: rank ? 0.1 : null,
    people_40km: null, top_places: null, first_arrival_h: null, heading: null, reach_km: null, persist_p: null, age_days: null };
}
const FIRES = [fire("b", 1, 2), fire("z", 3, null), fire("a", 1, 1), fire("c", 2, null), fire("x", 1, null, false), fire("d", 1, 3)];

test("tierColor gives three distinct colours", () => {
  const c = [1, 2, 3].map((t) => tierColor(t as 1 | 2 | 3).join(","));
  expect(new Set(c).size).toBe(3);
});

test("official order: province fires by tier, then id, no order inside a tier", () => {
  expect(orderForMode(FIRES, "official").map((i) => FIRES[i].id)).toEqual(["a", "b", "d", "c", "z"]);
});

test("downwind order: Priority 1 by rank, then tiers 2 and 3", () => {
  expect(orderForMode(FIRES, "downwind").map((i) => FIRES[i].id)).toEqual(["a", "b", "d", "c", "z"]);
  const reranked = [fire("a", 1, 3), fire("b", 1, 1), fire("c", 2, null), fire("d", 1, 2)];
  expect(orderForMode(reranked, "downwind").map((i) => reranked[i].id)).toEqual(["b", "d", "a", "c"]);
});

import { loadLimits, stabilityLine } from "./replay";

const LIMITS = {
  replay2023: { pooled: 0.45, pontianak: 0.81, worst_quartile_hit: 0.48, chance: 0.25, airports: 7, days: 421 },
  learn: null, ignores: ["People outside Indonesia (not counted)"], not_claimed: ["Any smoke concentration"],
};

test("loadLimits parses limits with learn null and with a learn object", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(LIMITS), { status: 200 })));
  const a = await loadLimits();
  expect(a.learn).toBeNull(); expect(a.replay2023.pooled).toBe(0.45); expect(a.ignores).toHaveLength(1);
  const learn = { shipped: true, test_auc_2026: 0.78, heuristic_auc_2026: 0.6, cv_auc: [0.835, 0.832, 0.72],
    base_rate_2026: 0.2, visibility_correction: "tested, not used" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...LIMITS, learn }), { status: 200 })));
  const b = await loadLimits();
  expect(b.learn?.shipped).toBe(true); expect(b.learn?.cv_auc).toEqual([0.835, 0.832, 0.72]);
});

test("loadLimits throws ReplayError on failure", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
  await expect(loadLimits()).rejects.toBeInstanceOf(ReplayError);
});

test("stabilityLine states the day's overlaps", () => {
  expect(stabilityLine({ seed_overlap: 9, wind_level_overlap: 3, cell: 0.015, k: 4 })).toBe(
    "9 of 10 of the top ten are the same on a rerun; 3 of 10 if surface winds are used instead.");
  expect(stabilityLine({ seed_overlap: 9, wind_level_overlap: 3, cell: 0.015, k: 4, hindsight_overlap: 7 })).toBe(
    "9 of 10 of the top ten are the same on a rerun; 3 of 10 if surface winds are used instead. " +
    "The ranking uses the forecast available that morning; with the weather that actually followed, 7 of 10 stay.");
});

import { ageLabel } from "./replay";

test("ageLabel reads days running, capped at 14", () => {
  expect(ageLabel(1)).toBe("1 day");
  expect(ageLabel(3)).toBe("3 days running");
  expect(ageLabel(14)).toBe("14 days or more");
  expect(ageLabel(null)).toBeNull();
});

import { learnLine } from "./replay";

test("learnLine states the 2026 result, shipped or not", () => {
  const learn = { shipped: true, test_auc_2026: 0.79, heuristic_auc_2026: 0.621, cv_auc: [0.835, 0.832, 0.72] as [number, number, number],
    base_rate_2026: 0.324, visibility_correction: "tested, not used" as const };
  expect(learnLine(learn)).toBe("A learned model predicts which fires will be seen again tomorrow: AUC 0.79 on Sep to Oct 2026, a season it never saw (counting days burned: 0.62). Downwind weights each fire's smoke by it. We also tested a learned correction of the smoke index against airport visibility; it did not beat the physics, so we do not use one.");
  expect(learnLine({ ...learn, shipped: false })).toBe("A learned persistence model did not beat counting days burned on 2026, so the ranking assumes every fire keeps burning. We also tested a learned correction of the smoke index against airport visibility; it did not beat the physics, so we do not use one.");
});

import { contributionsFor, placeOptions } from "./replay";
import type { Day } from "./replay";

const CITY_DAY = { places: [
  { name: "Kubu Raya", contributions: [{ fire: 2, share: 0.1, first_arrival_h: 5 }] },
  { name: "Kota Pontianak", contributions: [{ fire: 1, share: 0.2, first_arrival_h: 9 }, { fire: 0, share: 0.5, first_arrival_h: 3 }] },
  { name: "Bengkayang", contributions: [] },
] } as unknown as Day;

test("placeOptions lists place names alphabetically", () => {
  expect(placeOptions(CITY_DAY)).toEqual(["Bengkayang", "Kota Pontianak", "Kubu Raya"]);
});

test("contributionsFor sorts by share, shares sum to at most 1", () => {
  const c = contributionsFor(CITY_DAY, "Kota Pontianak");
  expect(c.map((x) => x.fire)).toEqual([0, 1]);
  expect(c.reduce((s, x) => s + x.share, 0)).toBeLessThanOrEqual(1);
  expect(contributionsFor(CITY_DAY, "Nowhere")).toEqual([]);
});
