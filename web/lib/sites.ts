import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import type { Fire } from "./replay";

export type Site = Feature<Polygon | MultiPolygon, { kind: "industrial" | "plantation"; name: string; osm_url: string }>;
export type SiteDataset = FeatureCollection<Polygon | MultiPolygon, Site["properties"]> & {
  metadata: { source: string; source_timestamp?: string; extracted_at: string; licence: string; coverage: string };
};
export const SITE_COLORS = { industrial: "#bdabff", plantation: "#7ed6ab" };

// Local tangent-plane distance to mapped polygon boundaries, with holes respected.
// Display context only; not route distance, spread likelihood, or a ranking input.
export function distanceToSiteKm(lat: number, lon: number, site: Site): number {
  const polygons = site.geometry.type === "Polygon" ? [site.geometry.coordinates] : site.geometry.coordinates;
  const project = (p: Position) => [(p[0] - lon) * 111.195 * Math.cos(lat * Math.PI / 180), (p[1] - lat) * 111.195];
  let nearest = Infinity;
  for (const polygon of polygons) {
    let inside = false;
    for (const ring of polygon) {
      let inRing = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = project(ring[j]), [bx, by] = project(ring[i]);
        if ((ay > 0) !== (by > 0) && 0 < ax + (bx - ax) * -ay / (by - ay)) inRing = !inRing;
        const dx = bx - ax, dy = by - ay;
        const t = dx * dx + dy * dy === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)));
        nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
      }
      if (inRing) inside = !inside;
    }
    if (inside) return 0;
  }
  return nearest;
}

export function nearestSites(fire: Pick<Fire, "lat" | "lon">, dataset: SiteDataset) {
  return dataset.features.map((site) => ({ site, km: distanceToSiteKm(fire.lat, fire.lon, site) }))
    .sort((a, b) => a.km - b.km).slice(0, 5);
}

// Inspect the existing, capped animation particles; never extrapolate fire spread.
// The 2 km margin is a display threshold, not a health or hazard threshold.
export function firstSmokeNearSite(bin: ArrayBuffer, frames: { offset: number; count: number }[], fire: number, site: Site): number | null {
  const polygons = site.geometry.type === "Polygon" ? [site.geometry.coordinates] : site.geometry.coordinates;
  const points = polygons.flat(2);
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p[0]); east = Math.max(east, p[0]);
    south = Math.min(south, p[1]); north = Math.max(north, p[1]);
  }
  const margin = 2 / 110;
  const data = new DataView(bin);
  for (let h = 0; h < frames.length; h++) {
    const frame = frames[h];
    for (let n = 0; n < frame.count; n++) {
      const offset = frame.offset + n * 8;
      if (data.getUint16(offset + 4, true) !== fire || data.getUint8(offset + 6) === 0) continue;
      const lon = 95 + (data.getInt16(offset, true) + 32768) / 65535 * 25;
      const lat = -8 + (data.getInt16(offset + 2, true) + 32768) / 65535 * 14;
      if (lon < west - margin || lon > east + margin || lat < south - margin || lat > north + margin) continue;
      if (distanceToSiteKm(lat, lon, site) <= 2) return h;
    }
  }
  return null;
}
