import numpy as np
import pandas as pd
import pytest

from dw.config import BOX
from dw.fetch import Met

T0 = pd.Timestamp("2026-10-22")


def toy_grids(city_lat, city_lon, people):
    """One populated cell; pop40 derived from it; every cell in the province and in one regency."""
    from scipy.signal import fftconvolve
    from dw.grids import Grid, Grids, _disc
    shape = (280, 500)
    pop = np.zeros(shape)
    g = Grid(pop)
    r, c = g.index(np.array([city_lat]), np.array([city_lon]))
    pop[r[0], c[0]] = people
    pop40 = np.maximum(fftconvolve(pop, _disc(), mode="same"), 0.0)
    pop40[pop40 < 1e-6] = 0.0
    return Grids(pop=Grid(pop), pop40=Grid(pop40), adm2=Grid(np.zeros(shape, np.int16)),
                 province=Grid(np.ones(shape, bool)), adm2_names=["Kota Toy"])


def one_fire(day, lat=0.0, lon=109.07, n=3, conf="n", frp=10.0):
    """n detections in one square on `day` (3 nominal detections on peat make it Priority 1; see peat_everywhere)."""
    return pd.DataFrame({"lat": [lat] * n, "lon": [lon] * n, "date": [pd.Timestamp(day)] * n,
                         "frp": [frp] * n, "conf": [conf] * n})


def flat_met(u, v, rain, hours=60, t0=T0):
    """A Met with constant wind and rain over the whole BOX for `hours` hours from t0."""
    lon0, lat0, lon1, lat1 = BOX
    lats = np.arange(lat0, lat1 + 0.01, 1.0)
    lons = np.arange(lon0, lon1 + 0.01, 1.0)
    shape = (len(lats), len(lons), hours)
    full = lambda x: np.full(shape, float(x))
    return Met(lats=lats, lons=lons, times=pd.date_range(t0, periods=hours, freq="h"),
               u={"925": full(u), "10m": full(u)}, v={"925": full(v), "10m": full(v)},
               precip=full(rain), rh=full(80.0))


def peat_everywhere():
    """Module fixture body: every toy fire is on peat, so the strict tier rule (peat AND cluster or 3 days) ranks it."""
    from dw import tiers
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(tiers, "peat_at", lambda la, lo: np.ones(len(np.asarray(la)), bool))
        yield
