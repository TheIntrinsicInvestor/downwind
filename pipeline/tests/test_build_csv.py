import gzip
import json
import sys
from unittest.mock import Mock

import numpy as np
import pandas as pd
import pytest

from dw import build, config, learn
from dw.fetch import load_fires_csv
from tests.conftest import flat_met, peat_everywhere, toy_grids


_on_peat = pytest.fixture(autouse=True)(peat_everywhere)


@pytest.mark.parametrize("weighted", [False, True])
def test_build_morning_snapshot_from_firms_csv(tmp_path, monkeypatch, weighted):
    day = pd.Timestamp("2026-11-14")
    detections = tmp_path / "firms.csv"
    detections.write_text(
        "latitude,longitude,acq_date,frp,confidence,satellite,daynight\n"
        "0,109.07,2026-11-13,10,n,N21,D\n"
        "0.001,109.071,2026-11-13,10,n,N21,D\n"
        "0.002,109.072,2026-11-13,10,n,N21,N\n"
        "0.1,109.07,2026-11-13,1,l,N21,D\n"
        "0.2,109.07,2026-11-14,100,n,N21,D\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setenv("DOWNWIND_FORECAST_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.delenv("NEBIUS_API_KEY", raising=False)
    monkeypatch.delenv("DOWNWIND_SECRETS_FILE", raising=False)
    forecast = flat_met(5, 0, 0, hours=64, t0=day - pd.Timedelta(hours=12))
    config.forecast_cache().mkdir()
    np.savez_compressed(
        config.forecast_cache() / "forecast_20261113T12.npz",
        lats=forecast.lats, lons=forecast.lons,
        times=forecast.times.to_numpy(), precipitation=forecast.precip,
        wind_speed_10m=forecast.u["10m"], wind_direction_10m=np.full_like(forecast.precip, 270),
        wind_speed_925hPa=forecast.u["925"], wind_direction_925hPa=np.full_like(forecast.precip, 270),
    )
    grids = toy_grids(0, 109.07, 100_000)
    monkeypatch.setattr(build, "load_grids", lambda: grids)
    out = tmp_path / "snapshot"
    args = ["dw.build", "--day", str(day.date()), "--fires-csv", str(detections), "--out", str(out)]
    if weighted:
        monkeypatch.setattr(learn, "peat_at", lambda lat, lon: np.ones(len(lat), dtype=bool))
        model = Mock()
        model.predict_proba.return_value = np.array([[0.25, 0.75]])
        monkeypatch.setattr(build, "load_learn", lambda: (model, {"shipped": True}))
        weather = flat_met(0, 0, 0, hours=24, t0=day - pd.Timedelta(days=1))
        path = tmp_path / "weather.npz"
        np.savez_compressed(path, lats=weather.lats, lons=weather.lons, times=weather.times.to_numpy(),
                            precipitation=weather.precip, relative_humidity_2m=weather.rh)
        args.extend(["--persistence-weather", str(path)])
    monkeypatch.setattr(sys, "argv", args)

    build.main()

    name = str(day.date())
    snapshot = json.loads((out / f"{name}.json").read_text(encoding="utf-8"))
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    assert index == {"days": [name], "default": name}
    assert snapshot["fires_date"] == "2026-11-13"
    assert snapshot["counts"] == {"p1": 1, "p2": 0, "p3": 1}
    assert snapshot["stability"] is None
    assert snapshot["persistence_weighted"] is weighted
    ranked = next(fire for fire in snapshot["fires"] if fire["rank"] == 1)
    assert ranked["persist_p"] == (0.75 if weighted else None)
    assert snapshot["bulletin"]["source"] == "template"
    assert len(snapshot["frames"]) == config.WINDOW_H
    assert gzip.decompress((out / f"{name}.particles.bin.gz").read_bytes())


def test_firms_error_response_is_rejected(tmp_path):
    detections = tmp_path / "firms.csv"
    detections.write_text("Invalid MAP_KEY.\n", encoding="utf-8")
    with pytest.raises(ValueError, match="missing FIRMS columns"):
        load_fires_csv(detections)
