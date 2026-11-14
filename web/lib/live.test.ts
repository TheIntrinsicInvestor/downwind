import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { isStale, refreshSnapshot, type Manifest } from "./live";

const manifest: Manifest = {
  id: "2026-11-14-" + "a".repeat(32),
  date: "2026-11-14",
  generated_at: "2026-11-14T00:13:00Z",
  observation_cutoff: "2026-11-14T00:00:00Z",
  forecast_run: "2026-11-13T12:00:00Z",
  source: "VIIRS_NOAA21_NRT",
};

const signal = new AbortController().signal;
const payload = {
  date: manifest.date, hours: 48, fires: [], places: [], top10_share: 0,
  fires_date: "2026-11-13", window_start_utc: "2026-11-14T00:00Z",
  counts: { p1: 0, p2: 0, p3: 0 }, bulletin: { text: "", source: "template", model: null },
  frames: Array.from({ length: 48 }, () => ({ offset: 0, count: 0 })),
};
const limits = { ignores: [], not_claimed: [], replay2023: {
  pooled: 0.45, pontianak: 0.81, worst_quartile_hit: 0.48, chance: 0.25, airports: 7, days: 421,
} };

function server(latest = manifest, missing = false) {
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/manifest.json")) return Response.json(latest);
    expect(url).toContain(`/snapshots/${latest.id}/`);
    if (url.endsWith("/limits.json")) return Response.json(limits);
    if (url.endsWith(".particles.bin.gz")) {
      if (missing) return new Response(null, { status: 503 });
      return new Response(new Uint8Array(gzipSync(new Uint8Array(0))));
    }
    return Response.json(payload);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

test("a complete snapshot with zero detections is valid and repeated polls only read the manifest", async () => {
  const fetch = server();
  const snapshot = await refreshSnapshot(null, signal);
  expect(snapshot.day.fires).toEqual([]);
  expect(snapshot.bin.byteLength).toBe(0);
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(await refreshSnapshot(snapshot, signal)).toBe(snapshot);
  expect(fetch).toHaveBeenCalledTimes(5);
});

test("a failed payload does not replace the last successful snapshot", async () => {
  server();
  const snapshot = await refreshSnapshot(null, signal);
  server({ ...manifest, id: "2026-11-14-" + "b".repeat(32), generated_at: "2026-11-14T01:00:00Z" }, true);
  await expect(refreshSnapshot(snapshot, signal)).rejects.toThrow("HTTP 503");
  expect(snapshot.manifest).toEqual(manifest);
});

test("a missed morning update is flagged after the publishing window", () => {
  expect(isStale(manifest, Date.parse("2026-11-15T00:44:59Z"))).toBe(false);
  expect(isStale(manifest, Date.parse("2026-11-15T00:45:00Z"))).toBe(true);
});

function overrideResponse(suffix: string, value: unknown, status = 200) {
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (url: string, ...args: unknown[]) =>
    url.endsWith(suffix) ? Response.json(value, { status }) : original(url, ...args as [])));
}

const nextManifest = { ...manifest, id: "2026-11-14-" + "b".repeat(32), generated_at: "2026-11-14T01:00:00Z" };

test("the feed recovers after a failed refresh", async () => {
  server();
  const previous = await refreshSnapshot(null, signal);
  server(nextManifest, true);
  await expect(refreshSnapshot(previous, signal)).rejects.toThrow();
  server(nextManifest);
  const next = await refreshSnapshot(previous, signal);
  expect(next.manifest.id).toBe(nextManifest.id);
  expect(previous.manifest.id).toBe(manifest.id);
});

test("an older manifest cannot roll the app back", async () => {
  server(nextManifest);
  const previous = await refreshSnapshot(null, signal);
  const fetch = server(manifest);
  expect(await refreshSnapshot(previous, signal)).toBe(previous);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("missing first snapshot rejects so the caller can show replay", async () => {
  server(manifest, true);
  await expect(refreshSnapshot(null, signal)).rejects.toThrow("HTTP 503");
});

test("malformed manifest fails before requesting payloads", async () => {
  const fetch = server();
  overrideResponse("/manifest.json", { ...manifest, id: "../../bad" });
  await expect(refreshSnapshot(null, signal)).rejects.toThrow("manifest");
  expect(fetch).not.toHaveBeenCalled();
});

test.each([
  ["wrong date", { ...payload, date: "2026-11-13" }],
  ["missing counts", { ...payload, counts: null }],
  ["wrong observation day", { ...payload, fires_date: "2026-11-12" }],
  ["wrong forecast window", { ...payload, window_start_utc: "2026-11-14T01:00Z" }],
  ["invalid ranking share", { ...payload, top10_share: 2 }],
  ["missing bulletin", { ...payload, bulletin: null }],
  ["null frame", { ...payload, frames: [null, ...payload.frames.slice(1)] }],
  ["missing frame", { ...payload, frames: payload.frames.slice(1) }],
  ["excessive frame", { ...payload, frames: [{ offset: 0, count: 12001 }, ...payload.frames.slice(1)] }],
  ["invalid place reference", { ...payload, places: [{ name: "Test", contributions: [{ fire: 0, share: 1 }] }] }],
  ["null fire", { ...payload, fires: [null] }],
  ["bad coordinates", { ...payload, fires: [{ id: "f", lat: 100, lon: 110, tier: 1, top_places: null }] }],
])("rejects %s before replacing a good snapshot", async (_, broken) => {
  server();
  const previous = await refreshSnapshot(null, signal);
  server(nextManifest);
  overrideResponse(`/${manifest.date}.json`, broken);
  await expect(refreshSnapshot(previous, signal)).rejects.toThrow();
  expect(previous.manifest.id).toBe(manifest.id);
});

test.each([null, { ignores: [] }, { ...limits, not_claimed: null },
  { ...limits, replay2023: { ...limits.replay2023, pooled: "bad" } },
  { ...limits, forecast2026: {} }, { ...limits, learn: {} },
])("rejects malformed limits %j", async (broken) => {
  server();
  overrideResponse("/limits.json", broken);
  await expect(refreshSnapshot(null, signal)).rejects.toThrow();
});

test("rejects particles that refer to an unknown fire", async () => {
  server();
  overrideResponse(`/${manifest.date}.json`, { ...payload,
    frames: [{ offset: 0, count: 1 }, ...payload.frames.slice(1).map(() => ({ offset: 8, count: 0 }))] });
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith(".particles.bin.gz")
    ? new Response(new Uint8Array(gzipSync(new Uint8Array(8)))) : original(url)));
  await expect(refreshSnapshot(null, signal)).rejects.toThrow("particle fire");
});


test("the existing real replay passes the live-feed checks", async () => {
  const date = "2026-09-20";
  const latest = { ...manifest, date, id: date + "-" + "a".repeat(32),
    generated_at: date + "T00:20:00Z", observation_cutoff: date + "T00:00:00Z",
    forecast_run: "2026-09-19T12:00:00Z" };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/manifest.json")) return Response.json(latest);
    const name = url.split("/").at(-1)!;
    return new Response(new Uint8Array(readFileSync(new URL(`../public/replay/${name}`, import.meta.url))));
  }));
  const result = await refreshSnapshot(null, signal);
  expect(result.day.date).toBe(date);
  expect(result.day.fires.length).toBeGreaterThan(0);
  expect(result.bin.byteLength).toBeGreaterThan(0);
});

test("truncated particle payload is rejected", async () => {
  server();
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith(".particles.bin.gz")
    ? new Response(new Uint8Array(gzipSync(new Uint8Array(3)))) : original(url)));
  await expect(refreshSnapshot(null, signal)).rejects.toThrow("do not match");
});
