"""Map distance from each fire to the nearest mapped road (OpenStreetMap, Geofabrik Kalimantan extract).
Information only: it is shown on the fire card and never enters exposure, tiers or ranking.

The distances come from a committed grid, model/reach_road_0.005.npz: uint8 in 0.1 km steps (255 means 25.5 km or more),
0.005 degrees per cell, row 0 at the north edge, covering lon W to W+ncols*res and lat n-nrows*res to n.
Against exact road distances the grid's error was a median 0.15 km and a maximum 0.40 km at Priority 1 fires.
Roads include tracks. Rivers and canals are left out: they are mainly pump water sources, not access routes.
OSM misses many plantation and logging tracks.

Runtime uses the bundled grid. Rebuilding it needs pyosmium; run it by hand when
the OSM extract is refreshed:
    python -m dw.reach build <kalimantan.osm.pbf> <out.npz>
    python -m dw.reach annotate <replay day files...>      (adds reach_km to existing day files without a rebuild)"""
import argparse
import json
import shutil
import sys
import urllib.request
from functools import lru_cache
from pathlib import Path
from tempfile import NamedTemporaryFile

import numpy as np

from dw import config

GRID_PATH = Path(__file__).resolve().parent.parent / "model" / "reach_road_0.005.npz"
RES = 0.005
W, S, E, N = 108.0, -3.8, 115.0, 2.6        # West Kalimantan bounding box plus margin
LAT_REF = -0.5                               # the province straddles the equator
KX = 111.32 * np.cos(np.radians(LAT_REF))    # km per degree of longitude
KY = 110.57                                  # km per degree of latitude
STEP_KM = 0.05                               # lines are densified to this spacing before rasterising
CLIP = 255                                   # uint8 steps of 0.1 km

ROAD = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
        "tertiary", "tertiary_link", "unclassified", "residential", "service", "track", "road", "living_street"}


PREP_RES = 0.01
KM_PER_CELL = 1.11
PBF_URL = "https://download.geofabrik.de/asia/indonesia/kalimantan-latest.osm.pbf"
PBF_PATH = config.DATA / "kalimantan-latest.osm.pbf"
ROADS_PATH = config.DATA / "osm_roads.json"
WATER_PATH = config.DATA / "osm_water.json"
ROAD_TYPES = {"trunk", "primary", "secondary", "tertiary", "unclassified", "track"}
WATER_TYPES = {"river", "canal"}
UA = {"User-Agent": "downwind-pipeline/0.1"}


def _province_bbox():
    from dw.grids import LAT1, LON0, RES as G, load_grids
    rows, cols = np.where(load_grids().province.values)
    return (LON0 + cols.min() * G, LAT1 - (rows.max() + 1) * G,
            LON0 + (cols.max() + 1) * G, LAT1 - rows.min() * G)


def fetch_pbf(path: Path = PBF_PATH) -> Path:
    """Stream the extract to disk; interrupted downloads never become cache hits."""
    if path.is_file():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            with urllib.request.urlopen(urllib.request.Request(PBF_URL, headers=UA), timeout=120) as response:
                shutil.copyfileobj(response, temporary)
        if temporary_path.stat().st_size == 0:
            raise ValueError("Empty Geofabrik extract")
        temporary_path.replace(path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return path


def _write_lines(path, lines):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
        try:
            json.dump(lines, temporary, allow_nan=False, separators=(",", ":"))
        except BaseException:
            temporary_path.unlink(missing_ok=True)
            raise
    try:
        temporary_path.replace(path)
    finally:
        temporary_path.unlink(missing_ok=True)


def extract_lines(path: Path = PBF_PATH, *, roads_path: Path = ROADS_PATH,
                  water_path: Path = WATER_PATH, bbox=None) -> tuple[int, int]:
    """Keep selected ways overlapping the province bounding box, including crossings.

    The disk-backed node index avoids retaining the whole extract in RAM.
    An incomplete way fails extraction rather than inventing a connecting segment.
    """
    try:
        import osmium
    except ImportError:
        raise RuntimeError("Install pipeline/requirements.txt before running python -m dw.reach") from None
    west, south, east, north = _province_bbox() if bbox is None else bbox
    roads, water = [], []

    class Lines(osmium.SimpleHandler):
        def way(self, way):
            road = way.tags.get("highway") in ROAD_TYPES
            wet = way.tags.get("waterway") in WATER_TYPES
            if not (road or wet):
                return
            points = [(node.lon, node.lat) for node in way.nodes]
            if len(points) < 2:
                return
            lons, lats = zip(*points)
            if max(lons) < west or min(lons) > east or max(lats) < south or min(lats) > north:
                return
            if road:
                roads.append(points)
            if wet:
                water.append(points)

    Lines().apply_file(str(path), locations=True, idx="sparse_file_array")
    # An empty extract must not masquerade as a usable distance dataset.
    if not roads or not water:
        raise ValueError("OSM extract has no selected roads or waterways in the province bounding box")
    _write_lines(roads_path, roads)
    _write_lines(water_path, water)
    _grid.cache_clear()
    return len(roads), len(water)


def distance_grid(lines) -> np.ndarray | None:
    """km from each 0.01 degree cell over BOX to the nearest line (row 0 at the north edge); None if no lines."""
    if not lines:
        return None
    lon0, lat0, lon1, lat1 = config.BOX
    nc, nr = int(round((lon1 - lon0) / PREP_RES)), int(round((lat1 - lat0) / PREP_RES))
    img = Image.new("L", (nc, nr), 0)
    dr = ImageDraw.Draw(img)
    for line in lines:
        pts = [((lo - lon0) / PREP_RES, (lat1 - la) / PREP_RES) for lo, la in line]
        if len(pts) >= 2:
            dr.line(pts, fill=1, width=1)
    on = np.asarray(img).astype(bool)
    if not on.any():
        return None
    return distance_transform_edt(~on) * KM_PER_CELL


def reach_from(grid, lat, lon) -> np.ndarray:
    lat = np.asarray(lat, float); lon = np.asarray(lon, float)
    if grid is None:
        return np.full(lat.shape, np.nan)
    lon0, lat0, lon1, lat1 = config.BOX
    r = np.clip(np.floor((lat1 - lat) / PREP_RES).astype(int), 0, grid.shape[0] - 1)
    c = np.clip(np.floor((lon - lon0) / PREP_RES).astype(int), 0, grid.shape[1] - 1)
    return grid[r, c]


@lru_cache(maxsize=2)
def _grid(path: Path):
    if not path.is_file():
        raise FileNotFoundError(f"Missing {path}; run python -m dw.reach")
    grid = distance_grid(json.loads(path.read_text(encoding="utf-8")))
    if grid is None:
        raise ValueError(f"No usable lines in {path}; run python -m dw.reach")
    return grid


def road_km(lat, lon) -> np.ndarray:
    """Approximate km to a mapped road; this is not travel distance or access."""
    return reach_from(_grid(ROADS_PATH), lat, lon)


def water_km(lat, lon) -> np.ndarray:
    """Approximate km to a mapped river/canal; availability is not verified."""
    return reach_from(_grid(WATER_PATH), lat, lon)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pbf", type=Path, help="Use an existing local OSM PBF instead of downloading")
    args = parser.parse_args()
    path = args.pbf if args.pbf is not None else fetch_pbf()
    roads, water = extract_lines(path)
    print(f"Saved {roads} roads and {water} waterways to {config.DATA}")


def _ways(pbf_path):
    import osmium
    fp = (osmium.FileProcessor(str(pbf_path), osmium.osm.NODE | osmium.osm.WAY).with_locations()
          .with_filter(osmium.filter.KeyFilter("highway")))
    for w in fp:
        if not w.is_way() or not (w.tags.get("highway") in ROAD):
            continue
        try:
            pts = [(nd.lon, nd.lat) for nd in w.nodes]
        except Exception:
            continue
        if len(pts) >= 2:
            yield np.asarray(pts, dtype="float32")


def build_grid(pbf_path, out_path) -> None:
    """Offline builder: rasterise every road and track, then take the distance
    transform. Writes an npz with keys road (uint8), w, n, res."""
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
    np.savez_compressed(out_path, road=np.minimum(np.round(dist * 10), CLIP).astype("uint8"), w=W, n=N, res=RES)


@lru_cache(maxsize=1)
def _load():
    z = np.load(GRID_PATH)
    return z["road"], float(z["w"]), float(z["n"]), float(z["res"])


def reach_km(lat, lon) -> np.ndarray:
    """km to the nearest mapped road (tracks included); NaN outside the grid."""
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
        main()
