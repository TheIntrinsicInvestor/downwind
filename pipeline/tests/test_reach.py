import json

import numpy as np
import pandas as pd
import pytest

import dw.rank as rank_mod
from dw import reach
from dw.export import _write_json
from dw.reach import annotate, reach_km
from tests.conftest import T0, flat_met, one_fire, peat_everywhere, toy_grids

_on_peat = pytest.fixture(scope="module", autouse=True)(peat_everywhere)


def test_lookup_matches_the_grid_cell():
    grid, w, n, res = reach._load()
    r, c = 700, 600                                           # an interior cell
    lat, lon = n - (r + 0.5) * res, w + (c + 0.5) * res
    assert reach_km(lat, lon) == pytest.approx(grid[r, c] / 10.0)
    assert reach_km([lat, lat], [lon, lon]).shape == (2,)


def test_grid_is_road_only():
    z = np.load(reach.GRID_PATH)
    assert reach.GRID_PATH.name == "reach_road_0.005.npz" and "road" in z.files and "any" not in z.files


def test_known_value_in_a_city():
    near_road = reach_km(-0.0263, 109.3425)                   # Pontianak city centre: a mapped road is within a few hundred metres
    assert 0 <= near_road < 1.0


def test_outside_the_grid_is_nan():
    out = reach_km([10.0, 0.0, 0.0, -10.0], [110.0, 100.0, 120.0, 110.0])
    assert np.isnan(out).all()


def test_ranking_unchanged_with_and_without_reach(monkeypatch):
    fires = pd.concat([one_fire(T0 - pd.Timedelta(days=1), 0.0, 109.07), one_fire(T0 - pd.Timedelta(days=1), 0.3, 108.9)],
                      ignore_index=True)
    args = (T0, fires, flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 500_000))
    with_reach = rank_mod.run_day(*args).squares
    monkeypatch.setattr(rank_mod, "reach_km", lambda lat, lon: np.full(np.shape(lat), np.nan))
    without = rank_mod.run_day(*args).squares
    assert with_reach.reach_km.notna().all() and without.reach_km.isna().all()
    cols = ["id", "tier", "exposure", "share", "rank"]
    pd.testing.assert_frame_equal(with_reach[cols], without[cols])


def test_annotate_only_fills_reach_km(tmp_path):
    day = {"date": "2026-09-18", "counts": {"p1": 1}, "bulletin": "Text with é and –.",
           "fires": [{"id": "a", "lat": 0.0, "lon": 110.0, "rank": 1, "share": 0.5, "reach_km": None},
                     {"id": "b", "lat": 20.0, "lon": 110.0, "rank": None, "share": None, "reach_km": None}]}
    p = tmp_path / "2026-09-18.json"
    _write_json(day, p)
    before = json.loads(p.read_text(encoding="utf-8"))
    annotate([p])
    after = json.loads(p.read_text(encoding="utf-8"))
    assert isinstance(after["fires"][0]["reach_km"], float) and after["fires"][1]["reach_km"] is None
    for f in before["fires"] + after["fires"]:
        f.pop("reach_km")
    assert before == after
