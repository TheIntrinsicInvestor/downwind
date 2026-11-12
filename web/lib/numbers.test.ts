import { expect, test } from "vitest";
import { offending } from "./numbers";

const FACTS = { date: "22 October 2026", p1_count: 1412, top10_share_pct: 53,
  top: [{ rank: 1, near: "Ketapang", share_pct: 12, people_40km: 680000, first_arrival_h: 7 }] };

test.each([
  ["Fire 1 near Ketapang puts 680,000 people under smoke.", []],
  ["The top ten carry 53% of exposure.", []],
  ["About 700,000 people are affected.", ["700,000"]],
  ["Roughly 0.7 million people.", ["0.7"]],
  ["Smoke arrives in 7 hours, on 22 October 2026.", []],
  ["There are 1,412 Priority 1 fires and 12 crews.", []],
  ["There are 1,413 Priority 1 fires.", ["1,413"]],
])("number check: %s", (text, bad) => {
  expect(offending(text, FACTS)).toEqual(bad);
});
