export const POPULATION_ATTRIBUTION = "Population: WorldPop (2025), R2025A, CC BY 4.0";
export const POPULATION_URL = process.env.NEXT_PUBLIC_POPULATION_TILES_URL || "/population/tiles.pmtiles";

// Match the indexed PNG palette in scripts/build_population_tiles.py.
export const POPULATION_BREAKS = [
  { label: ">0–<1", color: "#245975" },
  { label: "1–<5", color: "#347e98" },
  { label: "5–<20", color: "#44a6b5" },
  { label: "20–<50", color: "#70cecc" },
  { label: "50+", color: "#c6f5de" },
];

export type PopulationOverlayMode = "heatmap" | "raster";
export const POPULATION_OVERLAY_MODE: PopulationOverlayMode =
  process.env.NEXT_PUBLIC_POPULATION_OVERLAY_MODE === "raster" ? "raster" : "heatmap";
export const POPULATION_POINTS_URL =
  process.env.NEXT_PUBLIC_POPULATION_POINTS_URL || "/population/points.pmtiles";
export const POPULATION_WEIGHT_CAP = 500;

export const POPULATION_HEATMAP_STOPS = POPULATION_BREAKS.map(({ color }, index) => ({
  color,
  stop: [0.1, 0.3, 0.5, 0.7, 1][index],
}));

export function populationBeforeLayer(layers: readonly { id: string; type: string }[]) {
  return layers.find(({ id, type }) =>
    type === "symbol" || type === "custom" || id === "regency-fill")?.id;
}
