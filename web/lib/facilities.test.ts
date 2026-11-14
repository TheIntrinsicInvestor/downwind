import { expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { type Facility, facilitiesIn, facilityName, inSchoolHours, isFacilityDataset, smokeHoursNear, summarise } from "./facilities";

// 2026-09-19 00:00 UTC is Saturday 07:00 WIB; hour 24 is Sunday 07:00 WIB.
const WINDOW = "2026-09-19T00:00:00Z";

function facility(id: number, kind: "school" | "health", lon: number, lat: number, name = "", district = "Kota Test"): Facility {
  return { type: "Feature", id: `node/${id}`, properties: { kind, name, district, osm_url: `https://www.openstreetmap.org/node/${id}` },
    geometry: { type: "Point", coordinates: [lon, lat] } };
}

function particles(points: [number, number, number?][]) {
  const raw = new ArrayBuffer(points.length * 8), view = new DataView(raw);
  points.forEach(([lon, lat, alpha = 255], i) => {
    view.setInt16(i * 8, Math.round((lon - 95) / 25 * 65535 - 32768), true);
    view.setInt16(i * 8 + 2, Math.round((lat + 8) / 14 * 65535 - 32768), true);
    view.setUint16(i * 8 + 4, 0, true); view.setUint8(i * 8 + 6, alpha);
  });
  return raw;
}

test("smoke within 2 km counts, farther or invisible smoke does not", () => {
  const fs = [facility(1, "school", 110, 0), facility(2, "school", 110.5, 0)];
  const bin = particles([[110.01, 0], [110.6, 0], [110.5, 0.005, 0]]);
  const hours = smokeHoursNear(bin, [{ offset: 0, count: 0 }, { offset: 0, count: 3 }], fs);
  expect(hours).toEqual([[1], []]);
});

test("a particle in a neighbouring grid cell still counts", () => {
  const fs = [facility(1, "health", 110.0199, 0.0199)];
  const hours = smokeHoursNear(particles([[110.0205, 0.0205]]), [{ offset: 0, count: 1 }], fs);
  expect(hours).toEqual([[0]]);
});

test("school hours are 07:00 to 13:00 WIB and skip Sundays", () => {
  expect(inSchoolHours(WINDOW, 0)).toBe(true);     // Sat 07:00
  expect(inSchoolHours(WINDOW, 5)).toBe(true);     // Sat 12:00
  expect(inSchoolHours(WINDOW, 6)).toBe(false);    // Sat 13:00
  expect(inSchoolHours(WINDOW, 24)).toBe(false);   // Sun 07:00
});

test("summary counts near and total per kind, flags school hours, orders the list", () => {
  const fs = [facility(1, "school", 0, 0, "SD B"), facility(2, "school", 0, 0, "SD A"),
    facility(3, "school", 0, 0), facility(4, "health", 0, 0, "Puskesmas")];
  const s = summarise(fs, [[8, 9], [3], [], [30]], WINDOW);
  expect(s.schools).toEqual({ total: 3, near: 2 });
  expect(s.health).toEqual({ total: 1, near: 1 });
  expect(s.schoolSmokeAt).toBe(3);
  expect(s.schoolHoursAt).toBe(3);                 // Sat 10:00
  expect(s.near.map((n) => n.facility.properties.name)).toEqual(["SD A", "SD B", "Puskesmas"]);
});

test("smoke near schools only outside school hours leaves the school-hours flag empty", () => {
  const s = summarise([facility(1, "school", 0, 0)], [[10, 24]], WINDOW);   // Sat 17:00, Sun 07:00
  expect(s.schoolSmokeAt).toBe(10);
  expect(s.schoolHoursAt).toBeNull();
});

test("district filter, unnamed labels and dataset validation", () => {
  const data = { type: "FeatureCollection", metadata: { extracted_at: "x" },
    features: [facility(1, "school", 0, 0, "", "A"), facility(2, "health", 0, 0, "", "B")] };
  expect(isFacilityDataset(data)).toBe(true);
  expect(isFacilityDataset({ ...data, features: [{ ...data.features[0], properties: { kind: "cafe" } }] })).toBe(false);
  expect(facilitiesIn(data as never, "B").map((f) => f.id)).toEqual(["node/2"]);
  expect(facilityName(data.features[0])).toBe("Unnamed school");
  expect(facilityName(data.features[1])).toBe("Unnamed clinic or hospital");
});

const COMMITTED = new URL("../public/context/facilities.geojson", import.meta.url);
test.skipIf(!existsSync(COMMITTED))("committed facilities file is valid", () => {
  const data = JSON.parse(readFileSync(COMMITTED, "utf8"));
  expect(isFacilityDataset(data)).toBe(true);
  expect(data.features.length).toBeGreaterThan(0);
  expect(data.metadata.licence).toBe("ODbL-1.0");
});
