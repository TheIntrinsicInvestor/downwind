import { gzipSync } from "node:zlib";
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
  date: manifest.date, hours: 48, fires: [], places: [],
  frames: Array.from({ length: 48 }, () => ({ offset: 0, count: 0 })),
};

function server(latest = manifest, missing = false) {
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/manifest.json")) return Response.json(latest);
    expect(url).toContain(`/snapshots/${latest.id}/`);
    if (url.endsWith("/limits.json")) return Response.json({ ignores: [] });
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
