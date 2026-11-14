"""Map distance from each fire to the nearest mapped road, river or canal (OpenStreetMap, Geofabrik Kalimantan extract).
Information only: it is shown on the fire card and never enters exposure, tiers or ranking.

The distances come from a committed grid, model/reach_any_0.005.npz: uint8 in 0.1 km steps (255 means 25.5 km or more),
0.005 degrees per cell, row 0 at the north edge, covering lon W to W+ncols*res and lat n-nrows*res to n.
Against exact distances the grid's error was a median 0.13 km and a maximum 0.39 km at Priority 1 fires.
Roads include tracks; waterways are rivers, canals, drains and ditches. OSM misses many plantation and logging tracks.

Runtime needs only numpy. Rebuilding the grid needs pyosmium, which is NOT in requirements.txt; run it by hand when
the OSM extract is refreshed:
    python -m dw.reach build <kalimantan.osm.pbf> <out.npz>
    python -m dw.reach annotate <replay day files...>      (adds reach_km to existing day files without a rebuild)"""
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np

GRID_PATH = Path(__file__).resolve().parent.parent / "model" / "reach_any_0.005.npz"
RES = 0.005
W, S, E, N = 108.0, -3.8, 115.0, 2.6        # West Kalimantan bounding box plus margin
LAT_REF = -0.5                               # the province straddles the equator
KX = 111.32 * np.cos(np.radians(LAT_REF))    # km per degree of longitude
KY = 110.57                                  # km per degree of latitude
STEP_KM = 0.05                               # lines are densified to this spacing before rasterising
CLIP = 255                                   # uint8 steps of 0.1 km

ROAD = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
        "tertiary", "tertiary_link", "unclassified", "residential", "service", "track", "road", "living_street"}
WATER = {"river", "canal", "drain", "ditch"}


def _ways(pbf_path):
    import osmium
    fp = (osmium.FileProcessor(str(pbf_path), osmium.osm.NODE | osmium.osm.WAY).with_locations()
          .with_filter(osmium.filter.KeyFilter("highway", "waterway")))
    for w in fp:
        if not w.is_way() or not (w.tags.get("highway") in ROAD or w.tags.get("waterway") in WATER):
            continue
        try:
            pts = [(nd.lon, nd.lat) for nd in w.nodes]
        except Exception:
            continue
        if len(pts) >= 2:
            yield np.asarray(pts, dtype="float32")


def build_grid(pbf_path, out_path) -> None:
    """Offline builder: rasterise every road, track, river, canal, drain and ditch, then take the distance
    transform. Writes an npz with keys any (uint8), w, n, res."""
    from scipy.ndimage import distance_transform_edt
    nc, nr = int(round((E - W) / RES)), int(round((N - S) / RES))
    mask = np.ones((nr, nc), bool)
    for xy in _ways(pbf_path):
        x, y = xy[:, 0].astype("float64") * KX, xy[:, 1].astype("float64") * KY
        seg = np.hypot(np.diff(x), np.diff(y))
        n = np.maximum(np.ceil(seg / STEP_KM).astype(int), 1)
        rep = np.repeat(np.arange(len(seg)), n)
        t = (np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n)) / np.repeat(n, n)
        lon = xy[rep, 0] + t * (xy[rep + 1, 0] - xy[rep, 0])
        lat = xy[rep, 1] + t * (xy[rep + 1, 1] - xy[rep, 1])
        cc, rr = np.floor((lon - W) / RES).astype(int), np.floor((N - lat) / RES).astype(int)
        ok = (cc >= 0) & (cc < nc) & (rr >= 0) & (rr < nr)
        mask[rr[ok], cc[ok]] = False
    dist = distance_transform_edt(mask, sampling=(RES * KY, RES * KX)) if not mask.all() else np.full((nr, nc), 99.0)
    np.savez_compressed(out_path, any=np.minimum(np.round(dist * 10), CLIP).astype("uint8"), w=W, n=N, res=RES)


@lru_cache(maxsize=1)
def _load():
    z = np.load(GRID_PATH)
    return z["any"], float(z["w"]), float(z["n"]), float(z["res"])


def reach_km(lat, lon) -> np.ndarray:
    """km to the nearest mapped road, river or canal; NaN outside the grid."""
    grid, w, n, res = _load()
    lat = np.asarray(lat, float)
    lon = np.asarray(lon, float)
    r = np.floor((n - lat) / res)
    c = np.floor((lon - w) / res)
    ok = (r >= 0) & (r < grid.shape[0]) & (c >= 0) & (c < grid.shape[1])
    out = np.full(lat.shape, np.nan)
    out[ok] = grid[r[ok].astype(int), c[ok].astype(int)] / 10.0
    return out


def annotate(paths) -> None:
    """Fill fire["reach_km"] in existing replay day files, written back with the exporter's own writer."""
    import json
    from dw.export import _num, _write_json
    for p in map(Path, paths):
        day = json.loads(p.read_text(encoding="utf-8"))
        fires = day["fires"]
        km = reach_km([f["lat"] for f in fires], [f["lon"] for f in fires])
        for f, v in zip(fires, km):
            f["reach_km"] = _num(v, 1)
        _write_json(day, p)
        print(f"{p.name}: {len(fires)} fires, {sum(f['reach_km'] is not None for f in fires)} with reach_km")


if __name__ == "__main__":
    cmd, args = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 1 else ("", [])
    if cmd == "build" and len(args) == 2:
        build_grid(*args)
    elif cmd == "annotate" and args:
        annotate(args)
    else:
        sys.exit(__doc__)
