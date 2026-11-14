import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

// Display only: the chosen place's outline on the Protect map. Matched by name to the day files' place names
// (public/context/regencies.geojson, written by pipeline/dw/regencies.py).
export type Regency = Feature<Polygon | MultiPolygon, { name: string }>;
export type RegencyCollection = FeatureCollection<Polygon | MultiPolygon, { name: string }>;

export const REGENCY_URL = "/context/regencies.geojson";

export function regencyByName(data: RegencyCollection, name: string): Regency | null {
  return data.features.find((f) => f.properties.name === name) ?? null;
}

// [west, south, east, north] of the outer rings.
export function regencyBounds(r: Regency): [number, number, number, number] {
  const polys: Position[][][] = r.geometry.type === "Polygon" ? [r.geometry.coordinates] : r.geometry.coordinates;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const poly of polys) for (const [lon, lat] of poly[0]) {
    west = Math.min(west, lon); east = Math.max(east, lon);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return [west, south, east, north];
}

// Screen padding so the outline sits in the clear part of the map: side panels on wide screens, the bottom sheet on phones.
export function highlightPadding(viewportWidth: number) {
  return viewportWidth >= 1024
    ? { top: 90, bottom: 110, left: 380, right: 400 }
    : { top: 150, bottom: 380, left: 30, right: 30 };
}
