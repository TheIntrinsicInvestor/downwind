// Pure geometry for the results charts: a value on a 0 to max axis becomes a pixel width. Rounded to two decimals so
// float noise (0.59 * 400) never leaks into SVG attributes or tests.

const r2 = (n: number) => Math.round(n * 100) / 100;

export function barWidth(value: number, max: number, width: number): number {
  if (!(value > 0) || !(max > 0)) return 0;
  return value >= max ? width : r2((value / max) * width);
}

// The gain's range as a bracket: from baseline + low to baseline + high, clamped to the axis.
export function gainBracket(base: number, low: number, high: number, max: number, width: number): { x1: number; x2: number } {
  return { x1: barWidth(base + low, max, width), x2: barWidth(base + high, max, width) };
}
