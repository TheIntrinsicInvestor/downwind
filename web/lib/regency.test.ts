import { expect, test } from "vitest";
import { type RegencyCollection, highlightPadding, regencyBounds, regencyByName } from "./regency";

const DATA = { type: "FeatureCollection", features: [
  { type: "Feature", properties: { name: "A" }, geometry: { type: "Polygon", coordinates: [[[110, -1], [111, -1], [111, 0], [110, 0], [110, -1]]] } },
  { type: "Feature", properties: { name: "B" }, geometry: { type: "MultiPolygon", coordinates: [
    [[[112, 2], [113, 2], [113, 3], [112, 2]]], [[[108, -3], [109, -3], [109, -2], [108, -3]]]] } },
] } as unknown as RegencyCollection;

test("regencyByName matches the exact place name, null when absent", () => {
  expect(regencyByName(DATA, "A")?.properties.name).toBe("A");
  expect(regencyByName(DATA, "Z")).toBeNull();
});

test("regencyBounds covers every part of a multi-polygon", () => {
  expect(regencyBounds(regencyByName(DATA, "A")!)).toEqual([110, -1, 111, 0]);
  expect(regencyBounds(regencyByName(DATA, "B")!)).toEqual([108, -3, 113, 3]);
});

test("highlightPadding leaves room for the side panels on wide screens and the sheet on phones", () => {
  expect(highlightPadding(1440).left).toBeGreaterThan(300);
  expect(highlightPadding(360)).toMatchObject({ left: 30, right: 30 });
  expect(highlightPadding(360).bottom).toBeGreaterThan(300);
});
