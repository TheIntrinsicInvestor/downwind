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
