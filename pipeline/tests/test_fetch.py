import numpy as np
import pandas as pd
import pytest

from dw import config
from dw.config import REPLAY_DATA, secret
from dw.fetch import load_fires, load_met


def test_load_fires_2026_counts():
    f = load_fires(2026)
    assert list(f.columns) == ["lat", "lon", "date", "frp", "conf"]
    assert len(f) == 287_734
    assert (f.conf != "l").sum() == 275_036
    assert f.date.min() == pd.Timestamp("2026-09-01") and f.date.max() == pd.Timestamp("2026-10-31")


def test_load_fires_2023_matches_replay():
    f = load_fires(2023)
    sel = f[(f.conf != "l") & (f.date >= "2023-08-31") & (f.date <= "2023-10-31")]
    assert len(sel) == 92_794          # first line of validation-2023-replay/replay_log.txt


def test_load_met_rejects_missing_winds(tmp_path, monkeypatch):
    raw = dict(np.load(REPLAY_DATA / "met_grid.npz"))
    w = raw["wind_speed_925hPa"].copy()
    flat = w.reshape(-1)
    flat[: int(0.05 * flat.size)] = np.nan          # 5% missing
    raw["wind_speed_925hPa"] = w
    np.savez_compressed(tmp_path / "met_2026.npz", **raw)
    monkeypatch.setattr(config, "DATA", tmp_path)
    with pytest.raises(ValueError, match="winds missing"):
        load_met(2026)


def test_met_2023_converts_direction_to_uv(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATA", tmp_path)    # no met_2023.npz here, so the replay file is used
    m = load_met(2023)
    raw = np.load(REPLAY_DATA / "met_grid.npz")
    s, d = raw["wind_speed_925hPa"][3, 4, 100], raw["wind_direction_925hPa"][3, 4, 100]
    assert m.u["925"][3, 4, 100] == pytest.approx(-s * np.sin(np.radians(d)))
    assert len(m.times) == 1560


def test_secret_error_never_contains_values():
    with pytest.raises(KeyError) as e:
        secret("NOT_A_REAL_NAME")
    assert "NOT_A_REAL_NAME" in str(e.value) and "=" not in str(e.value)


# ---- true forecast for the replay window (13 Nov): the run a 07:00 local meeting actually had

from dw.fetch import forecast_run, with_forecast
from tests.conftest import T0, flat_met


def _raw_forecast(hours, speed=2.0, direction=0.0, rain=1.0, start=None):
    met = flat_met(0, 0, 0, hours=1)
    shape = (len(met.lats), len(met.lons), hours)
    start = start if start is not None else T0 - pd.Timedelta(hours=12)
    return {"lats": met.lats, "lons": met.lons,
            "times": np.array(pd.date_range(start, periods=hours, freq="h").strftime("%Y-%m-%dT%H:%M")),
            "wind_speed_10m": np.full(shape, speed), "wind_direction_10m": np.full(shape, direction),
            "wind_speed_925hPa": np.full(shape, speed), "wind_direction_925hPa": np.full(shape, direction),
            "precipitation": np.full(shape, rain)}


def test_forecast_run_is_previous_day_12utc():
    assert forecast_run(pd.Timestamp("2026-09-20")) == pd.Timestamp("2026-09-19 12:00")


def test_with_forecast_replaces_only_the_window():
    met = flat_met(5.0, 0.0, 0.0, hours=96, t0=T0 - pd.Timedelta(hours=24))
    out = with_forecast(met, T0, _raw_forecast(64))
    i0 = list(out.times).index(T0)
    win = slice(i0, i0 + config.WINDOW_H + 1)
    assert np.allclose(out.v["925"][:, :, win], -2.0) and np.allclose(out.u["925"][:, :, win], 0.0, atol=1e-9)
    assert np.allclose(out.precip[:, :, win], 1.0)
    assert np.allclose(out.u["925"][:, :, :i0], 5.0) and np.allclose(out.u["925"][:, :, i0 + config.WINDOW_H + 1:], 5.0)
    assert np.allclose(met.u["925"], 5.0)                     # the input is not modified


def test_with_forecast_fails_when_window_not_covered():
    met = flat_met(5.0, 0.0, 0.0, hours=96, t0=T0 - pd.Timedelta(hours=24))
    with pytest.raises(ValueError):
        with_forecast(met, T0, _raw_forecast(30))
    raw = _raw_forecast(64)
    raw["wind_speed_925hPa"][0, 0, 20] = np.nan
    with pytest.raises(ValueError):
        with_forecast(met, T0, raw)
