import { describe, expect, it } from "vitest";
import { forecastTime } from "./replay";
import { arrivalLabel, driftLine, headingWords, shortWib } from "./firecard";

const START = "2026-09-20T00:00Z";   // Sunday 20 Sep, 07:00 WIB at hour 0

describe("shortWib", () => {
  it("adds 7 h to the window start and shows weekday plus hour", () => {
    expect(shortWib(START, 0)).toBe("Sun 07:00");
    expect(shortWib(START, 6)).toBe("Sun 13:00");
    expect(shortWib(START, 18)).toBe("Mon 01:00");
  });
  it("returns null for missing or non-finite hours", () => {
    expect(shortWib(START, null)).toBeNull();
    expect(shortWib(START, undefined)).toBeNull();
    expect(shortWib(START, NaN)).toBeNull();
  });
  it("agrees with forecastTime", () => {
    expect(forecastTime(START, 18)).toBe("Mon 21 Sep, 01:00 WIB");
    expect(shortWib(START, 18)).toBe("Mon 01:00");
  });
});

describe("arrivalLabel", () => {
  it("handles already there, a time, and missing", () => {
    expect(arrivalLabel(START, 0)).toBe("Already there");
    expect(arrivalLabel(START, 6)).toBe("Sun 13:00");
    expect(arrivalLabel(START, null)).toBe("n/a");
    expect(arrivalLabel(START, undefined)).toBe("n/a");
  });
});

describe("headingWords / driftLine", () => {
  it("maps all eight compass points", () => {
    expect(["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map(headingWords)).toEqual(
      ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]);
  });
  it("builds the drift line without naming a place", () => {
    expect(driftLine("W")).toBe("Drifts west over the first 24 hours");
    expect(driftLine("NW")).toBe("Drifts north-west over the first 24 hours");
    expect(driftLine(null)).toBeNull();
    expect(driftLine("??")).toBeNull();
  });
});
