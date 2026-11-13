import { describe, expect, it } from "vitest";
import { barWidth, gainBracket } from "./chart";

describe("barWidth", () => {
  it("scales a value on a 0 to max axis", () => expect(barWidth(0.59, 1, 400)).toBe(236));
  it("is 0 for negative values", () => expect(barWidth(-1, 1, 400)).toBe(0));
  it("is capped at the full width", () => expect(barWidth(2, 1, 400)).toBe(400));
});

describe("gainBracket", () => {
  it("spans baseline + low to baseline + high", () => expect(gainBracket(0.45, 0.08, 0.28, 1, 400)).toEqual({ x1: 212, x2: 292 }));
});
