import numpy as np
import pandas as pd

from dw.fetch import with_forecast
from dw.forecast_check import day_scores
from tests.conftest import T0, flat_met
from tests.test_fetch import _raw_forecast


def _cells(day0):
    # one 0.25 degree fire cell at lon 109.0 burning on every day from day0
    days = pd.date_range(day0, T0)
    return pd.DataFrame({"clat": 0.0, "clon": 109.0, "frp": 100.0, "dix": (days - day0).days})


def test_day_scores_follows_the_weather_from_the_meeting_on():
    day0 = T0 - pd.Timedelta(days=3)
    hindsight = flat_met(-5.0, 0.0, 0.0, hours=24 * 6, t0=day0)        # wind blowing west: away from the city
    east = _raw_forecast(64, speed=5.0, direction=270.0, rain=0.0)        # forecast: wind from the west, blowing east
    forecast = with_forecast(hindsight, T0, east)
    cla, clo = np.array([0.0]), np.array([109.6])                        # city 67 km east of the fire
    s_fc = day_scores(T0, _cells(day0), day0, forecast, cla, clo)
    s_hs = day_scores(T0, _cells(day0), day0, hindsight, cla, clo)
    assert s_fc[0] > 0 and s_hs[0] == 0
    assert np.array_equal(day_scores(T0, _cells(day0), day0, forecast, cla, clo), s_fc)   # deterministic


def test_coarsen_keeps_every_other_grid_point():
    from dw.forecast_check import coarsen
    met = flat_met(5.0, 1.0, 0.5, hours=3)
    met.u["925"][:, :, :] = np.arange(len(met.lons))[None, :, None]   # u = column index
    c = coarsen(met, 2)
    assert list(c.lats) == list(met.lats[::2]) and list(c.lons) == list(met.lons[::2])
    assert np.array_equal(c.u["925"][0, :, 0], np.arange(0, len(met.lons), 2))
    assert c.precip.shape == (len(c.lats), len(c.lons), 3) and c.rh.shape == c.precip.shape


def test_thin_raw_matches_coarse_grid():
    from dw.forecast_check import coarsen, thin_raw
    met = flat_met(5.0, 1.0, 0.5, hours=96, t0=T0 - pd.Timedelta(hours=24))
    raw = thin_raw(_raw_forecast(64), 2)
    out = with_forecast(coarsen(met, 2), T0, raw)                      # grids must line up or this raises
    assert out.u["925"].shape[:2] == (len(met.lats[::2]), len(met.lons[::2]))
