import { expect, test } from "vitest";
import { noChangesLine, shareLine } from "./replay";

test("share line with Priority 1 fires is unchanged", () => {
  const s = shareLine(349, 0.5349);
  expect(s).toEqual({ before: "The top ten fires carry ", strong: "53%", after: " of the modelled smoke over residents." });
  expect(`${s.before}${s.strong}${s.after}`).toBe("The top ten fires carry 53% of the modelled smoke over residents.");
});

test("share line with no Priority 1 fires says there is no ranked list", () => {
  const s = shareLine(0, 0);
  expect(s).toEqual({ before: "No Priority 1 fires, so there is no ranked list today.", strong: "", after: "" });
});

test("changes line: replay keeps its exact wording, live says it does not compare yet", () => {
  expect(noChangesLine(false)).toBe("First day of the replay, so there is no earlier list to compare.");
  expect(noChangesLine(true)).toBe("The live view does not compare with the previous morning yet.");
});
