import { describe, expect, it } from "vitest";
import { areaPath, clockTicks, fmtLevel, hasSmoke, indexAtX, linePath, midnights, nightSpans, niceMax, peakIndex, xAt, yAt, type Box } from "./timeline";

const B: Box = { w: 320, h: 150, left: 30, right: 10, top: 10, bottom: 20 };
const START = "2026-11-14T00:00:00Z";   // 07:00 WIB on Sat 14 Nov

describe("niceMax", () => {
  it("never goes below 10, so trace places show a curve", () => {
    expect(niceMax(0)).toBe(10);
    expect(niceMax(0.4)).toBe(10);
    expect(niceMax(10)).toBe(10);
  });
  it("rounds up to a nice number", () => {
    expect(niceMax(12)).toBe(12.5);
    expect(niceMax(64)).toBe(80);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(101)).toBe(125);
    expect(niceMax(430)).toBe(500);
  });
});

describe("fmtLevel", () => {
  it("formats traces and zero", () => {
    expect(fmtLevel(0)).toBe("0");
    expect(fmtLevel(0.4)).toBe("below 1");
    expect(fmtLevel(11.6)).toBe("12");
  });
});

describe("peak and smoke", () => {
  it("finds the first highest hour", () => {
    expect(peakIndex([1, 5, 3, 5])).toBe(1);
  });
  it("detects all-zero", () => {
    expect(hasSmoke(new Array(48).fill(0))).toBe(false);
    expect(hasSmoke([0, 0, 0.2])).toBe(true);
  });
});

describe("scaling", () => {
  it("maps ends and baseline", () => {
    expect(xAt(0, 48, B)).toBe(30);
    expect(xAt(47, 48, B)).toBe(310);
    expect(yAt(0, 100, B)).toBe(130);
    expect(yAt(100, 100, B)).toBe(10);
    expect(yAt(500, 100, B)).toBe(10);   // clamped
  });
  it("inverts x to the nearest hour", () => {
    expect(indexAtX(30, 48, B)).toBe(0);
    expect(indexAtX(310, 48, B)).toBe(47);
    expect(indexAtX(-50, 48, B)).toBe(0);
    expect(indexAtX(999, 48, B)).toBe(47);
    expect(indexAtX(xAt(20, 48, B), 48, B)).toBe(20);
  });
});

describe("paths", () => {
  it("builds a line and a closed area", () => {
    expect(linePath([0, 100], 100, { ...B, w: 100, left: 0, right: 0 })).toBe("M0.0 130.0L100.0 10.0");
    const a = areaPath([0, 100], 100, { ...B, w: 100, left: 0, right: 0 });
    expect(a.startsWith("M0.0 130.0L100.0 10.0")).toBe(true);
    expect(a.endsWith("Z")).toBe(true);
  });
});

describe("time axis (window starts 07:00 WIB)", () => {
  it("shades 18:00 to 06:00", () => {
    // 18:00 is h=11, 06:00 next day is h=23, then 18:00 is h=35 to the end at 47
    expect(nightSpans(START, 48)).toEqual([[11, 23], [35, 47]]);
  });
  it("puts one midnight line at h=17 labelled with the day", () => {
    expect(midnights(START, 48)).toEqual([{ h: 17, label: "Sun 15" }, { h: 41, label: "Mon 16" }]);
  });
  it("ticks every 6 h on the clock, skipping midnight", () => {
    const t = clockTicks(START, 48);
    expect(t.slice(0, 4)).toEqual([
      { h: 5, label: "12:00" }, { h: 11, label: "18:00" }, { h: 23, label: "06:00" }, { h: 29, label: "12:00" },
    ]);
    expect(t.every((x) => x.label !== "00:00")).toBe(true);
  });
});
