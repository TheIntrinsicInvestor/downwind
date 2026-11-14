import gzip
import json
import sys

import numpy as np
import pandas as pd
import pytest

from dw import build, config
from dw.fetch import load_fires_csv
from tests.conftest import flat_met, peat_everywhere, toy_grids


_on_peat = pytest.fixture(autouse=True)(peat_everywhere)


def test_build_morning_snapshot_from_firms_csv(tmp_path, monkeypatch):
    day = pd.Timestamp("2026-11-14")
    detections = tmp_path / "firms.csv"
    detections.write_text(
        "latitude,longitude,acq_date,frp,confidence,satellite\n"
        "0,109.07,2026-11-13,10,n,N21\n"
        "0.001,109.071,2026-11-13,10,n,N21\n"
        "0.002,109.072,2026-11-13,10,n,N21\n"
        "0.1,109.07,2026-11-13,1,l,N21\n"
        "0.2,109.07,2026-11-14,100,n,N21\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config, "DATA", tmp_path)
    forecast = flat_met(5, 0, 0, hours=64, t0=day - pd.Timedelta(hours=12))
    np.savez_compressed(
        tmp_path / "forecast_20261113T12.npz",
        lats=forecast.lats, lons=forecast.lons,
        times=forecast.times.to_numpy(), precipitation=forecast.precip,
        wind_speed_10m=forecast.u["10m"], wind_direction_10m=np.full_like(forecast.precip, 270),
        wind_speed_925hPa=forecast.u["925"], wind_direction_925hPa=np.full_like(forecast.precip, 270),
    )
    grids = toy_grids(0, 109.07, 100_000)
    monkeypatch.setattr(build, "load_grids", lambda: grids)
    out = tmp_path / "snapshot"
    monkeypatch.setattr(sys, "argv", ["dw.build", "--day", str(day.date()),
                                     "--fires-csv", str(detections), "--out", str(out)])

    build.main()

    name = str(day.date())
    snapshot = json.loads((out / f"{name}.json").read_text(encoding="utf-8"))
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    assert index == {"days": [name], "default": name}
    assert snapshot["fires_date"] == "2026-11-13"
    assert snapshot["counts"] == {"p1": 1, "p2": 0, "p3": 1}
    assert "hindsight_overlap" not in snapshot["stability"]
    assert all(fire["persist_p"] is None for fire in snapshot["fires"])
    assert snapshot["bulletin"]["source"] == "template"
    assert len(snapshot["frames"]) == config.WINDOW_H
    assert gzip.decompress((out / f"{name}.particles.bin.gz").read_bytes())


def test_firms_error_response_is_rejected(tmp_path):
    detections = tmp_path / "firms.csv"
    detections.write_text("Invalid MAP_KEY.\n", encoding="utf-8")
    with pytest.raises(ValueError, match="missing FIRMS columns"):
        load_fires_csv(detections)
