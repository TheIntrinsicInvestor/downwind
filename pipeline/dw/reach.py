"""Reachability: distance from each fire to the nearest main road or river (OpenStreetMap, via Overpass).
A tie-breaker only: crews go where they can reach.
usage: python -m dw.reach      (fetches DATA/osm_lines.json for the province's bounding box)"""
import json
import time
import urllib.parse
import urllib.request
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

from dw import config

RES = 0.01                                  # degrees per raster cell
KM_PER_CELL = 1.11
OVERPASS = ["https://overpass-api.de/api/interpreter",          # each retry moves to the next mirror
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.private.coffee/api/interpreter"]
LINES_PATH = config.DATA / "osm_lines.json"
UA = {"User-Agent": "downwind-pipeline/0.1"}


def _province_bbox():
    from dw.grids import LAT1, LON0, RES as G, load_grids
    rows, cols = np.where(load_grids().province.values)
    return (LON0 + cols.min() * G, LAT1 - (rows.max() + 1) * G, LON0 + (cols.max() + 1) * G, LAT1 - rows.min() * G)


def fetch_osm_lines() -> None:
    """Main roads (trunk to tertiary) and rivers in 1 degree boxes over the province; 3 tries per box."""
    if LINES_PATH.exists():
        return
    w, s, e, n = _province_bbox()
    lines = []
    for lat in np.arange(np.floor(s), np.ceil(n), 1.0):
        for lon in np.arange(np.floor(w), np.ceil(e), 1.0):
            box = f"{lat},{lon},{lat + 1},{lon + 1}"
            q = (f'[out:json][timeout:180];(way["highway"~"^(trunk|primary|secondary|tertiary)$"]({box});'
                 f'way["waterway"="river"]({box}););out geom;')
            for attempt in range(3):
                try:
                    req = urllib.request.Request(OVERPASS[attempt % len(OVERPASS)], data=urllib.parse.urlencode({"data": q}).encode("utf-8"), headers=UA)
                    els = json.loads(urllib.request.urlopen(req, timeout=240).read().decode("utf-8"))["elements"]
                    break
                except Exception as ex:
                    print(f"box {box}: attempt {attempt + 1} failed ({type(ex).__name__})", flush=True)
                    if attempt == 2:
                        raise RuntimeError(f"Overpass failed 3 times for box {box}") from None
                    time.sleep(20)
            lines += [[(p["lon"], p["lat"]) for p in el["geometry"]] for el in els if el.get("geometry")]
            print(f"box {box}: {len(els)} ways, {len(lines)} lines so far", flush=True)
            time.sleep(2)
    LINES_PATH.write_text(json.dumps(lines), encoding="utf-8")


def distance_grid(lines) -> np.ndarray | None:
    """km from each 0.01 degree cell over BOX to the nearest line (row 0 at the north edge); None if no lines."""
    if not lines:
        return None
    lon0, lat0, lon1, lat1 = config.BOX
    nc, nr = int(round((lon1 - lon0) / RES)), int(round((lat1 - lat0) / RES))
    img = Image.new("L", (nc, nr), 0)
    dr = ImageDraw.Draw(img)
    for line in lines:
        pts = [((lo - lon0) / RES, (lat1 - la) / RES) for lo, la in line]
        if len(pts) >= 2:
            dr.line(pts, fill=1, width=1)
    on = np.asarray(img).astype(bool)
    return distance_transform_edt(~on) * KM_PER_CELL


def reach_from(grid, lat, lon) -> np.ndarray:
    lat = np.asarray(lat, float); lon = np.asarray(lon, float)
    if grid is None:
        return np.full(lat.shape, np.nan)
    lon0, lat0, lon1, lat1 = config.BOX
    r = np.clip(np.floor((lat1 - lat) / RES).astype(int), 0, grid.shape[0] - 1)
    c = np.clip(np.floor((lon - lon0) / RES).astype(int), 0, grid.shape[1] - 1)
    return grid[r, c]


@lru_cache(maxsize=1)
def _grid():
    if not LINES_PATH.exists():
        return None
    return distance_grid(json.loads(LINES_PATH.read_text(encoding="utf-8")))


def reach_km(lat, lon) -> np.ndarray:
    """km to the nearest main road or river; NaN if the lines were never fetched."""
    return reach_from(_grid(), lat, lon)


if __name__ == "__main__":
    fetch_osm_lines()
    print("lines saved:", LINES_PATH)
