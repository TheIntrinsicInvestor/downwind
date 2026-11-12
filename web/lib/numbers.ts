// Number check for chat answers: the same rule as pipeline/dw/bulletin.py offending().
// A number in the text passes if, with commas removed, it equals a number in the facts at the precision
// the text shows (53 passes for 52.7). Nothing else passes.

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

export function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map((m) => m.replace(/,+$/, ""));
}

function factNumbers(obj: unknown, out: number[]): void {
  if (obj === null || obj === undefined || typeof obj === "boolean") return;
  if (typeof obj === "number") { out.push(obj); return; }
  if (typeof obj === "string") { numbersIn(obj).forEach((n) => out.push(Number(n.replace(/,/g, "")))); return; }
  if (Array.isArray(obj)) { obj.forEach((v) => factNumbers(v, out)); return; }
  if (typeof obj === "object") Object.values(obj as Record<string, unknown>).forEach((v) => factNumbers(v, out));
}

const roundTo = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

export function offending(text: string, facts: unknown): string[] {
  const known: number[] = [];
  factNumbers(facts, known);
  return numbersIn(text).filter((tok) => {
    const val = Number(tok.replace(/,/g, ""));
    const dp = tok.includes(".") ? tok.split(".")[1].length : 0;
    return !known.some((k) => roundTo(k, dp) === roundTo(val, dp));
  });
}
