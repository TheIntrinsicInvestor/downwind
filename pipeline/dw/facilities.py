"""Export mapped schools and health facilities for the Protect tab (display only).

Each facility is a point (areas use the average of their outer ring) with its kind, name, OpenStreetMap link and the
geoBoundaries ADM2 district it falls in, so the web app can count facilities per Protect place. Nothing here enters
exposure, tiers or ranking. OpenStreetMap misses many rural schools and clinics, so counts are minimums.

    python -m dw.facilities --out ../web/public/context/facilities.geojson
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from dw import config
from dw.reach import PBF_PATH, fetch_pbf
from dw.sites import BBOX

SCHOOL = {"school"}
HEALTH_AMENITY = {"hospital", "clinic"}
HEALTH_CARE = {"hospital", "clinic", "centre"}     # Indonesian puskesmas are often tagged healthcare=centre


def category(tags):
    if tags.get("amenity") in SCHOOL:
        return "school"
    if tags.get("amenity") in HEALTH_AMENITY or tags.get("healthcare") in HEALTH_CARE:
        return "health"
    return None


def _rings(geometry):
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    return []


def _inside(lon, lat, polygon):
    """Even-odd test over all rings of one polygon (outer ring plus holes)."""
    inside = False
    for ring in polygon:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i][0], ring[i][1]
            xj, yj = ring[j][0], ring[j][1]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
    return inside


class Districts:
    """Point-in-polygon lookup against geoBoundaries ADM2 (the same names as Protect places)."""

    def __init__(self, features):
        self.items = []
        for f in features:
            polygons = _rings(f["geometry"])
            points = [p for polygon in polygons for ring in polygon for p in ring]
            if not points:
                continue
            xs, ys = zip(*[(p[0], p[1]) for p in points])
            self.items.append((f["properties"]["shapeName"], (min(xs), min(ys), max(xs), max(ys)), polygons))

    def name_at(self, lon, lat):
        for name, (x0, y0, x1, y1), polygons in self.items:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and any(_inside(lon, lat, poly) for poly in polygons):
                return name
        return None


def load_districts(path: Path | None = None) -> Districts:
    path = path or config.DATA / "adm2.geojson"
    if not path.is_file():                              # only the ADM2 file, not every static download
        import urllib.request
        from dw.fetch import STATIC, UA
        path.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(STATIC["adm2.geojson"], headers=UA)
        path.write_bytes(urllib.request.urlopen(request, timeout=300).read())
    return Districts(json.loads(path.read_text(encoding="utf-8"))["features"])


def export_facilities(pbf: Path, out: Path, districts: Districts, bbox=BBOX) -> int:
    import osmium
    west, south, east, north = bbox
    features = []

    def add(osm_type, osm_id, tags, lon, lat):
        kind = category(tags)
        if kind is None or not (west <= lon <= east and south <= lat <= north):
            return
        district = districts.name_at(lon, lat)
        if district is None:
            return
        features.append({"type": "Feature", "id": f"{osm_type}/{osm_id}",
                         "properties": {"kind": kind, "name": tags.get("name", ""), "district": district,
                                        "osm_url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}"},
                         "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]}})

    class Handler(osmium.SimpleHandler):
        def node(self, n):
            if category(n.tags) and n.location.valid():
                add("node", n.id, n.tags, n.location.lon, n.location.lat)

        def area(self, a):
            if not category(a.tags):
                return
            for outer in a.outer_rings():
                pts = [(p.lon, p.lat) for p in outer if p.location.valid()]
                if pts:
                    lon = sum(p[0] for p in pts) / len(pts)
                    lat = sum(p[1] for p in pts) / len(pts)
                    add("way" if a.from_way() else "relation", a.orig_id(), a.tags, lon, lat)
                break

    Handler().apply_file(str(pbf), locations=True, idx="sparse_file_array")
    if not features:
        raise ValueError("No mapped schools or health facilities found; not replacing the existing dataset")
    result = {"type": "FeatureCollection", "features": features,
              "metadata": {"source": "OpenStreetMap via Geofabrik Kalimantan", "licence": "ODbL-1.0",
                           "districts": "geoBoundaries IDN ADM2 (simplified)",
                           "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                           "bbox": list(bbox), "coverage": "Western Borneo; rural facilities are often unmapped"}}
    out.parent.mkdir(parents=True, exist_ok=True)
    temporary = out.with_suffix(out.suffix + ".tmp")
    try:
        temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        temporary.replace(out)
    finally:
        temporary.unlink(missing_ok=True)
    return len(features)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pbf", type=Path, default=PBF_PATH)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.pbf.exists():
        fetch_pbf(args.pbf)
    n = export_facilities(args.pbf, args.out, load_districts())
    print(f"Exported {n} schools and health facilities to {args.out}")


if __name__ == "__main__":
    main()
