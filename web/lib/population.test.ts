import { expect, test } from "vitest";
import { populationBeforeLayer } from "./population";

test("population heatmap is inserted above the basemap and beneath the regency highlight, labels, smoke and fires", () => {
  const layers = [
    { id: "land", type: "background" },
    { id: "water", type: "fill" },
    { id: "regency-fill", type: "fill" },
    { id: "place_city", type: "symbol" },
    { id: "smoke", type: "custom" },
    { id: "fires", type: "custom" },
  ];
  const before = populationBeforeLayer(layers);
  layers.splice(layers.findIndex(({ id }) => id === before), 0, { id: "population-density", type: "heatmap" });
  expect(layers.map(({ id }) => id)).toEqual(
    ["land", "water", "population-density", "regency-fill", "place_city", "smoke", "fires"],
  );
  expect(populationBeforeLayer(layers.filter(({ type, id }) => type !== "symbol" && id !== "regency-fill")))
    .toBe("smoke");
});
