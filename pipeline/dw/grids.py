"""Population, people within 40 km, regency and province rasters on the 0.05 degree grid, and the peat lookup.
usage: python -m dw.grids      (builds DATA/grids.npz and DATA/adm2_names.json)"""
import json
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt
from scipy.signal import fftconvolve

from dw import config

LON0, LAT0, LON1, LAT1 = config.BOX
RES = config.GRID_RES
NR = int(round((LAT1 - LAT0) / RES))        # 280 rows, north to south
NC = int(round((LON1 - LON0) / RES))        # 500 columns, west to east


@dataclass
class Grid:
    """Rows run north to south; covers BOX at GRID_RES."""
    values: np.ndarray

    def index(self, lat, lon):
        lat = np.asarray(lat, float); lon = np.asarray(lon, float)
        return (np.floor((LAT1 - lat) / RES).astype(int), np.floor((lon - LON0) / RES).astype(int))

    def at(self, lat, lon):
        """Nearest cell; 0 (False, or -1 for integer grids) outside BOX."""
        r, c = self.index(lat, lon)
        ok = (r >= 0) & (r < NR) & (c >= 0) & (c < NC)
        fill = -1 if np.issubdtype(self.values.dtype, np.signedinteger) else 0
        out = np.full(r.shape, fill, dtype=self.values.dtype)
        out[ok] = self.values[r[ok], c[ok]]
        return out


@dataclass
class Grids:
    pop: Grid           # people per cell
    pop40: Grid         # people within 40 km of each cell centre
    adm2: Grid          # int16 index into adm2_names, -1 where none
    province: Grid      # bool, inside PROVINCE
    adm2_names: list


def _disc():
    rad = int(np.ceil(config.R_KM / (RES * 111.0)))
    yy, xx = np.mgrid[-rad:rad + 1, -rad:rad + 1]
    return ((yy ** 2 + xx ** 2) * (RES * 111.0) ** 2 <= config.R_KM ** 2).astype(float)


def _population():
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(config.CHECK_DATA / "idn_pop_2020_1km.tif")
    dx, dy = im.tag_v2[33550][0], im.tag_v2[33550][1]
    lon_tl, lat_tl = im.tag_v2[33922][3], im.tag_v2[33922][4]
    a = np.asarray(im, dtype=np.float64)
    a = np.nan_to_num(np.where(a < 0, 0.0, a))           # nodata (-99999) and negatives to 0
    lat_c = lat_tl - (np.arange(a.shape[0]) + 0.5) * dy
    lon_c = lon_tl + (np.arange(a.shape[1]) + 0.5) * dx
    ri = np.floor((LAT1 - lat_c) / RES).astype(int)
    ci = np.floor((lon_c - LON0) / RES).astype(int)
    rok = (ri >= 0) & (ri < NR); cok = (ci >= 0) & (ci < NC)
    sub = a[np.ix_(rok, cok)]
    tmp = np.zeros((NR, sub.shape[1])); np.add.at(tmp, ri[rok], sub)
    pop = np.zeros((NR, NC)); np.add.at(pop.T, ci[cok], tmp.T)
    return pop, float(a.sum())


def _rings(geometry):
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return polys


def _px(ring):
    """Polygon ring to pixel coordinates: cell centres at integer positions, row 0 at the northern edge."""
    return [((lo - LON0) / RES - 0.5, (LAT1 - la) / RES - 0.5) for lo, la in ring]


def _area(feature):
    """Planar area of the outer rings, in square degrees (only used for drawing order)."""
    total = 0.0
    for p in _rings(feature["geometry"]):
        x, y = np.array(p[0], float).T
        total += 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
    return total


def _rasterise(features, values, background):
    """Largest polygons first, so a city enclosed by its surrounding regency is drawn on top of it."""
    img = Image.new("I", (NC, NR), background)
    dr = ImageDraw.Draw(img)
    order = sorted(range(len(features)), key=lambda i: -_area(features[i]))
    for feat, v in ((features[i], values[i]) for i in order):
        for p in _rings(feat["geometry"]):
            dr.polygon(_px(p[0]), fill=v)
            for hole in p[1:]:
                dr.polygon(_px(hole), fill=background)
    return np.asarray(img)


def _reconcile(adm2, province, n_names, max_cells=3):
    """ADM1 and ADM2 are simplified separately, so border cells can disagree. A regency belongs to the province
    holding most of its cells; a province cell labelled with an outside regency takes the nearest province
    regency, and an outside cell labelled with a province regency takes the nearest outside regency within
    max_cells (else none)."""
    inside = np.bincount(adm2[province & (adm2 >= 0)], minlength=n_names)
    total = np.bincount(adm2[adm2 >= 0], minlength=n_names)
    prov_reg = inside * 2 > total
    out = adm2.copy()
    lab = adm2 >= 0
    good_in = province & lab & prov_reg[np.where(lab, adm2, 0)]
    good_out = ~province & lab & ~prov_reg[np.where(lab, adm2, 0)]
    bad_in = province & lab & ~good_in
    bad_out = ~province & lab & ~good_out
    for bad, good, limit in ((bad_in, good_in, None), (bad_out, good_out, max_cells)):
        if not bad.any() or not good.any():
            continue
        dist, (ri, ci) = distance_transform_edt(~good, return_indices=True)
        take = bad if limit is None else bad & (dist <= limit)
        out[take] = adm2[ri[take], ci[take]]
        if limit is not None:
            out[bad & (dist > limit)] = -1
    return out


def build_grids() -> None:
    pop, whole = _population()
    pop40 = np.maximum(fftconvolve(pop, _disc(), mode="same"), 0.0)
    adm1 = json.loads((config.DATA / "adm1.geojson").read_text(encoding="utf-8"))["features"]
    prov_feats = [f for f in adm1 if f["properties"]["shapeName"] == config.PROVINCE]
    assert len(prov_feats) == 1, "province polygon not found"
    province = _rasterise(prov_feats, [1], 0).astype(bool)
    adm2 = json.loads((config.DATA / "adm2.geojson").read_text(encoding="utf-8"))["features"]
    names = [f["properties"]["shapeName"] for f in adm2]
    adm2_idx = _reconcile(_rasterise(adm2, list(range(len(adm2))), -1).astype(np.int16), province, len(names))
    np.savez_compressed(config.DATA / "grids.npz", pop=pop, pop40=pop40, adm2=adm2_idx, province=province)
    (config.DATA / "adm2_names.json").write_text(json.dumps(names, ensure_ascii=False), encoding="utf-8")
    load_grids.cache_clear()
    print(f"grid {pop.shape[0]} by {pop.shape[1]}; population in box {pop.sum():,.0f} of {whole:,.0f}; "
          f"province cells {int(province.sum())}; regency cells {int((adm2_idx >= 0).sum())} of {len(names)} regencies")


@lru_cache(maxsize=1)
def load_grids() -> Grids:
    names = json.loads((config.DATA / "adm2_names.json").read_text(encoding="utf-8"))
    with np.load(config.DATA / "grids.npz") as z:
        return Grids(pop=Grid(z["pop"]), pop40=Grid(z["pop40"]), adm2=Grid(z["adm2"]),
                     province=Grid(z["province"]), adm2_names=names)


@lru_cache(maxsize=1)
def _peat():
    path = config.DATA / "peat_z7.npz"
    if not path.exists():
        path = config.REPLAY_DATA / path.name
    with np.load(path) as z:
        return z["alpha"], 2 ** int(z["z"]), int(z["x0"]), int(z["y0"])


def peat_at(lat, lon) -> np.ndarray:
    """True where the GFW peat map (zoom 7 tiles) marks peat. Port of replay.py peat_at."""
    alpha, n7, x0, y0 = _peat()
    lat = np.asarray(lat, float); lon = np.asarray(lon, float)
    px = ((lon + 180) / 360 * n7 - x0) * 256
    py = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n7 - y0) * 256
    px = np.clip(px.astype(int), 0, alpha.shape[1] - 1)
    py = np.clip(py.astype(int), 0, alpha.shape[0] - 1)
    return alpha[py, px] > 0


def people_near(grids: Grids, visited: np.ndarray) -> int:
    """People living within 40 km of any visited cell."""
    if not visited.any():
        return 0
    near = fftconvolve(visited.astype(float), _disc(), mode="same") > 0.5
    return int(round(grids.pop.values[near].sum()))


if __name__ == "__main__":
    build_grids()
