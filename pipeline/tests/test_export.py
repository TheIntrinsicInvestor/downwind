import gzip
import json

import numpy as np
import pandas as pd
import pytest

from dw.export import REC, export_day, write_index, write_limits
from dw.rank import FRAME_CAP, DayResult, run_day
from tests.conftest import T0, flat_met, one_fire, toy_grids

DATE = T0.strftime("%Y-%m-%d")
Y = T0 - pd.Timedelta(days=1)
STAB = {"seed_overlap": 9, "wind_level_overlap": 7, "cell": 0.015, "k": 4.0}
BULLETIN = {"text": "", "source": "template", "model": None}
FIRES = pd.concat([one_fire(Y, la, 109.0) for la in (-0.2, 0.0, 0.2)]
                  + [one_fire(Y, 0.5, 108.5, conf="l"), one_fire(Y, 0.6, 108.6, n=1)], ignore_index=True)


@pytest.fixture(scope="module")
def RES():
    return run_day(T0, FIRES, flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 100_000), record_frames=True)


def _day(tmp_path):
    return json.loads((tmp_path / f"{DATE}.json").read_text(encoding="utf-8"))


def test_day_json_matches_contract(tmp_path, RES):
    export_day(RES, None, STAB, BULLETIN, tmp_path)
    d = _day(tmp_path)
    assert d["date"] == DATE and d["fires_date"] == Y.strftime("%Y-%m-%d")
    assert d["window_start_utc"] == f"{DATE}T00:00Z" and d["hours"] == 48
    assert set(d["counts"]) == {"p1", "p2", "p3"} and isinstance(d["top10_share"], float)
    assert d["stability"] == STAB and d["bulletin"] == BULLETIN and len(d["frames"]) == 48
    fire_keys = {"id", "lat", "lon", "tier", "in_province", "frp", "n_detect", "place", "rank", "share",
                 "people_40km", "top_places", "first_arrival_h", "heading", "reach_km", "persist_p", "age_days"}
    assert len(d["fires"]) == len(RES.squares)
    for f in d["fires"]:
        assert set(f) == fire_keys and f["tier"] in (1, 2, 3)
        if f["rank"] is None:
            assert f["share"] is None
        else:
            assert isinstance(f["rank"], int) and 0 <= f["share"] <= 1
    ranked = [f for f in d["fires"] if f["rank"] == 1][0]
    assert ranked["top_places"][0]["name"] == "Kota Toy" and isinstance(ranked["people_40km"], int)
    assert d["places"][0]["name"] == "Kota Toy"
    c = d["places"][0]["contributions"]
    assert sum(x["share"] for x in c) <= 1.0 + 1e-9 and all(0 <= x["fire"] < len(d["fires"]) for x in c)


def test_bin_roundtrip(tmp_path, RES):
    export_day(RES, None, STAB, BULLETIN, tmp_path)
    d = _day(tmp_path)
    raw = np.frombuffer(gzip.decompress((tmp_path / f"{DATE}.particles.bin.gz").read_bytes()), dtype=REC)
    f0 = raw[: d["frames"][0]["count"]]
    lon = 95 + (f0["lon_q"].astype(float) + 32768) / 65535 * 25
    assert len(f0) > 0
    assert np.abs(np.sort(lon) - np.sort(RES.frames[0][1])).max() < 0.001
    assert f0["fire"].max() < len(d["fires"])
    assert sum(fr["count"] for fr in d["frames"]) * 8 == len(gzip.decompress((tmp_path / f"{DATE}.particles.bin.gz").read_bytes()))
    f10 = raw[d["frames"][10]["offset"] // 8: d["frames"][10]["offset"] // 8 + d["frames"][10]["count"]]
    lat = -8 + (f10["lat_q"].astype(float) + 32768) / 65535 * 14
    assert np.abs(np.sort(lat) - np.sort(RES.frames[10][0])).max() < 0.001


def _synthetic(n_fires=5000, per_frame=12_000):
    rng = np.random.default_rng(0)
    sq = pd.DataFrame({
        "id": [f"{i}_{i}" for i in range(n_fires)], "lat": rng.uniform(-3, 3, n_fires), "lon": rng.uniform(105, 115, n_fires),
        "frp": rng.uniform(1, 50, n_fires), "n_detect": 3, "n_nonlow": 3, "peat": True, "in_province": True,
        "place": "Kabupaten Contoh", "neighbours_nonlow": 3, "days_running": 1, "tier": 1,
        "exposure": rng.uniform(0, 1, n_fires)})
    sq["share"] = sq.exposure / sq.exposure.sum()
    sq["rank"] = sq.exposure.rank(ascending=False, method="first")
    sq["people_40km"] = np.where(sq["rank"] <= 20, 123456.0, np.nan)
    sq["top_places"] = [[("Kabupaten Contoh", 0.7), ("Kota Contoh", 0.2), ("Kabupaten Lain", 0.1)]] * n_fires
    sq["first_arrival_h"] = 5.0
    sq["heading"] = "NE"
    pf = pd.DataFrame({"place": ["Kota Contoh"] * n_fires, "fire_id": sq.id, "exposure": sq.exposure, "first_arrival_h": 3.0})
    frames = [(rng.uniform(-3, 3, per_frame), rng.uniform(105, 115, per_frame), rng.uniform(0, 1, per_frame),
               rng.integers(0, n_fires, per_frame)) for _ in range(48)]
    return DayResult(date=T0, squares=sq, place_fire=pf, counts={"p1": n_fires, "p2": 0, "p3": 0},
                     top10_share=0.01, frames=frames)


def test_day_under_5mb(tmp_path):
    export_day(_synthetic(), None, STAB, BULLETIN, tmp_path)
    size = (tmp_path / f"{DATE}.json").stat().st_size + (tmp_path / f"{DATE}.particles.bin.gz").stat().st_size
    assert size < 5_000_000


def test_frames_capped_within_contract(tmp_path):
    # the contract allows at most 12,000 records a frame; we cap at FRAME_CAP to keep a full day under 5 MB
    export_day(_synthetic(n_fires=50, per_frame=15_000), None, STAB, BULLETIN, tmp_path)
    assert max(fr["count"] for fr in _day(tmp_path)["frames"]) == FRAME_CAP <= 12_000


def test_empty_day_exports(tmp_path):              # Review Focus 3
    res = run_day(T0, FIRES.iloc[0:0], flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 1000), record_frames=True)
    export_day(res, None, STAB, BULLETIN, tmp_path)
    d = _day(tmp_path)
    assert d["fires"] == [] and d["places"] == [] and d["top10_share"] == 0.0
    assert len(d["frames"]) == 48 and all(fr["count"] == 0 for fr in d["frames"])
    assert gzip.decompress((tmp_path / f"{DATE}.particles.bin.gz").read_bytes()) == b""


def test_changes_null_without_previous_day(tmp_path, RES):
    export_day(RES, None, STAB, BULLETIN, tmp_path)
    assert _day(tmp_path)["changes"] is None


def test_changes_against_previous_day(tmp_path, RES):
    prev = DayResult(date=T0 - pd.Timedelta(days=1),
                     squares=pd.DataFrame({"id": ["gone_1", RES.squares.id[RES.squares["rank"] == 1].iloc[0]],
                                           "rank": [1.0, 2.0]}),
                     place_fire=pd.DataFrame(), counts={}, top10_share=0.0, frames=None)
    export_day(RES, prev, STAB, BULLETIN, tmp_path)
    d = _day(tmp_path)
    ranked = sorted(i for i, f in enumerate(d["fires"]) if f["rank"] is not None and f["rank"] > 1)
    assert sorted(d["changes"]["new_in_top10"]) == ranked and d["changes"]["left_top10"] == 1


def test_no_nan_in_json(tmp_path, RES):
    export_day(RES, None, STAB, BULLETIN, tmp_path)
    text = (tmp_path / f"{DATE}.json").read_text(encoding="utf-8")
    assert "NaN" not in text and "Infinity" not in text


def test_limits_copy_has_no_em_dash(tmp_path):
    write_limits(None, tmp_path)
    text = (tmp_path / "limits.json").read_text(encoding="utf-8")
    lim = json.loads(text)
    assert "—" not in text and lim["learn"] is None and lim["replay2023"]["pooled"] == 0.45
    assert len(lim["ignores"]) == 6 and len(lim["not_claimed"]) == 4
    assert lim["forecast2026"]["forecast"] == 0.59 and lim["forecast2026"]["days"] == 300


def test_index(tmp_path):
    write_index(["2026-09-18", "2026-09-19", "2026-09-20"], "2026-09-20", tmp_path)
    assert json.loads((tmp_path / "index.json").read_text(encoding="utf-8")) == {
        "days": ["2026-09-18", "2026-09-19", "2026-09-20"], "default": "2026-09-20"}


def test_limits_burning_line_follows_the_model(tmp_path):
    learn = {"shipped": True, "test_auc_2026": 0.79, "heuristic_auc_2026": 0.621, "cv_auc": [0.835, 0.832, 0.72],
             "base_rate_2026": 0.324, "visibility_correction": "tested, not used"}
    write_limits(learn, tmp_path)
    ign = json.loads((tmp_path / "limits.json").read_text(encoding="utf-8"))["ignores"]
    assert not any("assumed yes" in x for x in ign) and any("seen again" in x for x in ign)
    write_limits({**learn, "shipped": False}, tmp_path)
    assert any("assumed yes" in x for x in json.loads((tmp_path / "limits.json").read_text(encoding="utf-8"))["ignores"])
