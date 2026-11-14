"""Export mapped industrial and plantation areas for a display-only context layer.

No simulation or ranking inputs are written. OSM tags describe mapped land use,
not ownership, verified facilities, ignition causes, or fire spread risk.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from dw.reach import PBF_PATH, fetch_pbf

BBOX = (108.0, -3.5, 115.0, 3.0)  # Western Borneo; includes West Kalimantan and nearby areas.
CROPS = {"oil_palm", "palm", "rubber", "coconut", "tea", "coffee", "cacao", "cocoa", "oil_palms", "rubber_trees", "coconut_palms", "palm_oil", "palm_fruit"}


def category(tags):
    if tags.get("landuse") == "industrial" or tags.get("man_made") == "works":
        return "industrial"
    if tags.get("landuse") == "plantation" or (
        tags.get("landuse") in {"orchard", "farmland", "forest"} and
        (tags.get("crop", "").lower().replace(" ", "_") in CROPS or
         tags.get("trees", "").lower() in CROPS or tags.get("produce", "").lower() in CROPS)
    ):
        return "plantation"
    return None


def export_sites(pbf: Path, out: Path, bbox=BBOX):
    import osmium
    with osmium.io.Reader(str(pbf)) as reader:
        source_timestamp = reader.header().get("osmosis_replication_timestamp") or reader.header().get("timestamp")
    factory = osmium.geom.GeoJSONFactory()
    features = []
    west, south, east, north = bbox

    class Areas(osmium.SimpleHandler):
        def area(self, area):
            kind = category(area.tags)
            if kind is None:
                return
            geometry = json.loads(factory.create_multipolygon(area))
            points = [p for polygon in geometry["coordinates"] for ring in polygon for p in ring]
            if not points:
                return
            xs, ys = zip(*points)
            if max(xs) < west or min(xs) > east or max(ys) < south or min(ys) > north:
                return
            osm_type = "way" if area.from_way() else "relation"
            features.append({"type": "Feature", "id": f"{osm_type}/{area.orig_id()}",
                             "properties": {"kind": kind, "name": area.tags.get("name", ""),
                                            "osm_url": f"https://www.openstreetmap.org/{osm_type}/{area.orig_id()}"},
                             "geometry": geometry})

    Areas().apply_file(str(pbf), locations=True, idx="sparse_file_array")
    if not features:
        raise ValueError("No mapped industrial or plantation polygons found; not replacing the existing dataset")
    result = {"type": "FeatureCollection", "features": features,
              "metadata": {"source": "OpenStreetMap via Geofabrik Kalimantan", "licence": "ODbL-1.0",
                           "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                           "source_timestamp": source_timestamp,
                           "extract_file_modified_at": datetime.fromtimestamp(pbf.stat().st_mtime, timezone.utc).isoformat(timespec="seconds"),
                           "bbox": list(bbox), "coverage": "Western Borneo; incomplete mapped coverage"}}
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
    print(f"Exported {export_sites(args.pbf, args.out)} mapped areas to {args.out}")


if __name__ == "__main__":
    main()
