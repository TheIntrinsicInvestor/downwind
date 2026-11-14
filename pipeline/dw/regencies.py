"""Regency outlines for the Protect map highlight.
usage: python -m dw.regencies      (writes web/public/context/regencies.geojson)
Reads the geoBoundaries ADM2 file the grids are built from, keeps regencies that touch BOX, rounds coordinates to
0.001 degrees (about 110 m) and drops repeated points. The `name` property is the same shapeName as the place names
in the day files, so the web app matches by name. Display only: no ranking or simulation input."""
import json

from dw import config

OUT = config.ROOT / "web" / "public" / "context" / "regencies.geojson"
DECIMALS = 3


def _ring(ring):
    out = []
    for lon, lat in ring:
        p = [round(lon, DECIMALS), round(lat, DECIMALS)]
        if not out or p != out[-1]:
            out.append(p)
    return out if len(out) >= 4 else None


def _polygons(geometry):
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    result = []
    for poly in polys:
        rings = [_ring(r) for r in poly]
        if rings[0] is not None:
            result.append([r for r in rings if r is not None])
    return result


def _touches_box(polys):
    west, south, east, north = config.BOX
    xs = [p[0] for poly in polys for p in poly[0]]
    ys = [p[1] for poly in polys for p in poly[0]]
    return bool(xs) and max(xs) >= west and min(xs) <= east and max(ys) >= south and min(ys) <= north


def main():
    features = json.loads((config.DATA / "adm2.geojson").read_text(encoding="utf-8"))["features"]
    out, seen = [], set()
    for f in features:
        name = f["properties"]["shapeName"]
        polys = _polygons(f["geometry"])
        if name in seen or not polys or not _touches_box(polys):
            continue
        seen.add(name)
        geometry = {"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1 else {"type": "MultiPolygon", "coordinates": polys}
        out.append({"type": "Feature", "properties": {"name": name}, "geometry": geometry})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": out}, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    print(f"{len(out)} regencies, {OUT.stat().st_size / 1e6:.2f} MB -> {OUT}")


if __name__ == "__main__":
    main()
