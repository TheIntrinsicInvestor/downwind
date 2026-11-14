import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { distanceToSiteKm, firstSmokeNearSite, nearestSites, type Site, type SiteDataset } from "./sites";

function square(lon = 110, lat = 0): Site {
  return { type: "Feature", id: "way/1", properties: { kind: "industrial", name: "Test", osm_url: "https://www.openstreetmap.org/way/1" },
    geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + 0.02, lat], [lon + 0.02, lat + 0.02], [lon, lat + 0.02], [lon, lat]]] } };
}

test("distance is zero inside a mapped polygon and approximate km outside", () => {
  expect(distanceToSiteKm(0.01, 110.01, square())).toBe(0);
  expect(distanceToSiteKm(0.01, 109.9, square())).toBeCloseTo(11.12, 1);
});

test("holes are not treated as inside the mapped site", () => {
  const site = square();
  if (site.geometry.type !== "Polygon") throw new Error();
  site.geometry.coordinates.push([[110.005, 0.005], [110.015, 0.005], [110.015, 0.015], [110.005, 0.015], [110.005, 0.005]]);
  expect(distanceToSiteKm(0.01, 110.01, site)).toBeGreaterThan(0.5);
});

test("multipolygons retain separate areas", () => {
  const one = square(), two = square(111);
  const site = { ...one, geometry: { type: "MultiPolygon" as const,
    coordinates: [one.geometry.coordinates, two.geometry.coordinates] } } as Site;
  expect(distanceToSiteKm(0.01, 111.01, site)).toBe(0);
  expect(distanceToSiteKm(0.01, 110.5, site)).toBeGreaterThan(50);
});

test("nearest sites are ordered by distance rather than feature order", () => {
  const dataset = { type: "FeatureCollection", features: [square(112), square(110), square(111)] } as SiteDataset;
  const result = nearestSites({ lat: 0.01, lon: 110.01 }, dataset);
  expect(result[0].km).toBe(0);
  expect(result[1].km).toBeLessThan(result[2].km);
});

function particle(lon: number, lat: number, fire = 0, alpha = 255) {
  const raw = new ArrayBuffer(8), view = new DataView(raw);
  view.setInt16(0, Math.round((lon - 95) / 25 * 65535 - 32768), true);
  view.setInt16(2, Math.round((lat + 8) / 14 * 65535 - 32768), true);
  view.setUint16(4, fire, true); view.setUint8(6, alpha);
  return raw;
}

test("smoke proximity uses the existing sampled positions and first matching hour", () => {
  const frames = [{ offset: 0, count: 0 }, { offset: 0, count: 1 }];
  expect(firstSmokeNearSite(particle(110.01, 0.01), frames, 0, square())).toBe(1);
});

test("nearby sampled smoke uses a 2 km display margin", () => {
  expect(firstSmokeNearSite(particle(109.99, 0.01), [{ offset: 0, count: 1 }], 0, square())).toBe(0);
  expect(firstSmokeNearSite(particle(109.9, 0.01), [{ offset: 0, count: 1 }], 0, square())).toBeNull();
});

test("other sources and invisible particles do not trigger a heads-up", () => {
  expect(firstSmokeNearSite(particle(110.01, 0.01, 1), [{ offset: 0, count: 1 }], 0, square())).toBeNull();
  expect(firstSmokeNearSite(particle(110.01, 0.01, 0, 0), [{ offset: 0, count: 1 }], 0, square())).toBeNull();
});

test("real committed features have valid geometry, provenance and finite distances", () => {
  const data: SiteDataset = JSON.parse(readFileSync(new URL("../public/context/sites.geojson", import.meta.url), "utf8"));
  expect(data.features.length).toBeGreaterThan(0);
  expect(data.metadata.licence).toBe("ODbL-1.0");
  for (const site of data.features) {
    expect(["industrial", "plantation"]).toContain(site.properties.kind);
    expect(site.properties.osm_url).toMatch(/^https:\/\/www.openstreetmap.org\/(way|relation)\/\d+$/);
    expect(Number.isFinite(distanceToSiteKm(0, 110, site))).toBe(true);
  }
});
