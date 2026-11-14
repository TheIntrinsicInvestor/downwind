import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
import pandas as pd
import pytest

from dw import build, config, learn, live
from dw.fetch import load_persistence_weather
from dw.learn import _daily_weather
from tests.conftest import flat_met, peat_everywhere, toy_grids

_on_peat = pytest.fixture(autouse=True)(peat_everywhere)

DAY = pd.Timestamp("2026-11-15")
COLS = ["latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time", "satellite", "instrument",
        "confidence", "version", "bright_ti5", "frp", "daynight"]


def feed(rows):
    return pd.DataFrame([{"latitude": la, "longitude": lo, "bright_ti4": 330.0, "scan": 0.4, "track": 0.4,
                          "acq_date": d, "acq_time": t, "satellite": "N21", "instrument": "VIIRS",
                          "confidence": "n", "version": "2.0NRT", "bright_ti5": 290.0, "frp": 5.0, "daynight": "N"}
                         for la, lo, d, t in rows], columns=COLS)


def test_archive_keeps_detections_that_left_the_feed(tmp_path):
    archive = tmp_path / "archive.csv"
    first = tmp_path / "first.csv"
    feed([(0.1, 109.1, "2026-11-01", 1830), (0.2, 109.2, "2026-11-13", 1830)]).to_csv(first, index=False)
    live.merge_archive(first, archive, DAY - pd.Timedelta(days=1))
    second = tmp_path / "second.csv"                     # next morning's 7-day feed no longer has 1 Nov
    feed([(0.2, 109.2, "2026-11-13", 1830), (0.3, 109.3, "2026-11-14", 1830)]).to_csv(second, index=False)
    merged = live.merge_archive(second, archive, DAY)
    assert list(merged.acq_date) == ["2026-11-01", "2026-11-13", "2026-11-14"]   # kept, deduplicated, ordered
    assert len(pd.read_csv(archive)) == 3


def test_archive_drops_old_and_out_of_box_rows(tmp_path):
    src = tmp_path / "feed.csv"
    old = (DAY - pd.Timedelta(days=live.ARCHIVE_DAYS + 1)).strftime("%Y-%m-%d")
    feed([(0.1, 109.1, old, 600), (20.0, 100.0, "2026-11-14", 600), (0.1, 109.1, "2026-11-14", 600)]).to_csv(src, index=False)
    merged = live.merge_archive(src, None, DAY)
    assert len(merged) == 1 and merged.acq_date.iat[0] == "2026-11-14"
    assert list(merged.columns) == live.ARCHIVE_COLUMNS


def test_archive_missing_file_is_a_first_run(tmp_path):
    src = tmp_path / "feed.csv"
    feed([(0.1, 109.1, "2026-11-14", 600)]).to_csv(src, index=False)
    merged = live.merge_archive(src, tmp_path / "none" / "archive.csv", DAY)
    assert len(merged) == 1 and (tmp_path / "none" / "archive.csv").exists()


def test_build_live_ranks_from_the_merged_archive(tmp_path, monkeypatch):
    archive = tmp_path / "archive.csv"
    feed([(0.1, 109.1, "2026-11-05", 600)]).to_csv(archive, index=False)          # left the 7-day feed already
    src = feed([(0.2, 109.2, "2026-11-14", 600)])
    monkeypatch.setattr(live, "download", lambda url: src.to_csv(index=False).encode())
    monkeypatch.setattr(live, "prepare_grids", lambda: None)
    monkeypatch.setattr(config, "MODEL_DIR", tmp_path / "no-model")   # weighting off: this test is about the archive
    seen = {}

    def build(day, n, fires_csv, out, *, persistence_weather, model_learn=None):
        seen["dates"] = sorted(pd.read_csv(fires_csv).acq_date)
        seen["weather"] = persistence_weather

    monkeypatch.setattr(live, "build_snapshots", build)
    live.build_live(DAY, tmp_path, archive)
    assert seen["dates"] == ["2026-11-05", "2026-11-14"] and seen["weather"] is None
    assert len(pd.read_csv(archive)) == 2 and (tmp_path / "manifest.json").exists()


# ---- persistence weighting on live runs

MODEL_DIR = Path(__file__).resolve().parents[1] / "model"
SEASON_DAY = pd.Timestamp("2026-10-14")
LIVE_CHECK = {"satellite": "NOAA-21", "period": "Sep to Oct 2026", "test_auc": 0.793, "heuristic_auc": 0.622,
              "months": [8, 9, 10, 11],
              "november": {"auc": 0.829, "heuristic_auc": 0.653, "passed": True, "period": "1 to 13 Nov 2026"}}


def open_meteo(day, *, gap=False):
    """A fake api.open-meteo.com/v1/forecast: previous UTC day plus the day itself, one response per point asked for.
    Rain at hour h is 0.1 * (h % 4) plus the latitude; humidity is 50 + h plus the latitude."""
    def respond(url):
        query = parse_qs(urlparse(url).query)
        lats = [float(x) for x in query["latitude"][0].split(",")]
        times = [f"{t:%Y-%m-%dT%H:%M}" for t in pd.date_range(day - pd.Timedelta(days=1), periods=48, freq="h")]
        out = []
        for k, lat in enumerate(lats):
            rain = [0.1 * (h % 4) + lat for h in range(48)]
            humidity = [50.0 + h % 24 + lat for h in range(48)]
            if gap and k == 3:
                humidity[5] = None
            out.append({"hourly": {"time": times, "precipitation": rain, "relative_humidity_2m": humidity}})
        return json.dumps(out).encode()
    return respond


def test_weather_npz_keeps_sum_and_mean_semantics(tmp_path, monkeypatch):
    monkeypatch.setattr(live, "download", open_meteo(SEASON_DAY))
    monkeypatch.setattr(live.time, "sleep", lambda s: None)
    path = tmp_path / "weather.npz"
    live.fetch_persistence_weather(SEASON_DAY, path)
    met = load_persistence_weather(path)
    assert met.precip.shape == (15, 26, 24) and met.rh.shape == (15, 26, 24)         # lat x lon x hour
    assert list(met.times[[0, -1]]) == [pd.Timestamp("2026-10-13 00:00"), pd.Timestamp("2026-10-13 23:00")]
    t0, nd, rain, rh = _daily_weather(met)
    i = int(np.where(met.lats == 2.0)[0][0])
    assert nd == 1 and t0 == pd.Timestamp("2026-10-13")
    assert rain[i, 7, 0] == pytest.approx(sum(0.1 * (h % 4) for h in range(24)) + 24 * 2.0)   # daily sum of mm/h
    assert rh[i, 7, 0] == pytest.approx(np.mean([50.0 + h for h in range(24)]) + 2.0)         # daily mean of %


def run_live(tmp_path, monkeypatch, day, *, model_dir=MODEL_DIR, weather=None):
    """build_live end to end on toy grids with no network. Returns the out directory."""
    name = f"{day:%Y-%m-%d}"
    previous = f"{day - pd.Timedelta(days=1):%Y-%m-%d}"
    rows = [(0.0, 109.07, 1830, "D"), (0.001, 109.071, 1830, "N"), (0.002, 109.072, 1830, "N")]
    csv = feed([(la, lo, previous, t) for la, lo, t, _ in rows])
    csv["daynight"] = [dn for *_, dn in rows]
    weather = weather or open_meteo(day)

    def download(url):
        if "open-meteo" in url:
            return weather(url)
        return csv.to_csv(index=False).encode()

    monkeypatch.setattr(live, "download", download)
    monkeypatch.setattr(live.time, "sleep", lambda s: None)
    monkeypatch.setattr(live, "prepare_grids", lambda: None)
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(config, "MODEL_DIR", model_dir)
    monkeypatch.setenv("DOWNWIND_FORECAST_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.delenv("NEBIUS_API_KEY", raising=False)
    monkeypatch.delenv("DOWNWIND_SECRETS_FILE", raising=False)
    monkeypatch.setattr(learn, "peat_at", lambda lat, lon: np.ones(len(lat), dtype=bool))
    monkeypatch.setattr(build, "load_grids", lambda: toy_grids(0, 109.07, 100_000))
    forecast = flat_met(5, 0, 0, hours=64, t0=day - pd.Timedelta(hours=12))
    (tmp_path / "cache").mkdir(exist_ok=True)
    np.savez_compressed(
        tmp_path / "cache" / f"forecast_{day - pd.Timedelta(hours=12):%Y%m%dT%H}.npz",
        lats=forecast.lats, lons=forecast.lons, times=forecast.times.to_numpy(), precipitation=forecast.precip,
        wind_speed_10m=forecast.u["10m"], wind_direction_10m=np.full_like(forecast.precip, 270),
        wind_speed_925hPa=forecast.u["925"], wind_direction_925hPa=np.full_like(forecast.precip, 270))
    out = tmp_path / "snapshot"
    live.build_live(day, out)
    return out, json.loads((out / f"{name}.json").read_text(encoding="utf-8")), \
        json.loads((out / "limits.json").read_text(encoding="utf-8"))


def test_in_season_run_is_weighted_with_the_committed_model(tmp_path, monkeypatch, capsys):
    _, snapshot, limits = run_live(tmp_path, monkeypatch, SEASON_DAY)
    assert snapshot["persistence_weighted"] is True
    assert any(fire["persist_p"] is not None for fire in snapshot["fires"])
    assert limits["learn"]["live_check"] == LIVE_CHECK
    assert "persistence weighting on" in capsys.readouterr().out


def broken_model_dir(tmp_path):
    return tmp_path / "no-model"


def bad_weather(url):
    raise OSError("network down")


@pytest.mark.parametrize("case, reason", [
    ("out_of_season", "month 12 is outside"),
    ("no_model", "no model files"),
    ("fetch_error", "OSError: network down"),
    ("gap", "missing hours"),
    ("persist_raises", "ValueError: boom"),
])
def test_fallbacks_build_unweighted_and_say_why(tmp_path, monkeypatch, capsys, case, reason):
    day, model_dir, weather = SEASON_DAY, MODEL_DIR, None
    if case == "out_of_season":
        day = pd.Timestamp("2026-12-14")
    elif case == "no_model":
        model_dir = broken_model_dir(tmp_path)
    elif case == "fetch_error":
        weather = bad_weather
    elif case == "gap":
        weather = open_meteo(day, gap=True)
    else:
        def boom(*args, **kwargs):
            raise ValueError("boom")
        monkeypatch.setattr(build, "persist_from_inputs", boom)
    _, snapshot, limits = run_live(tmp_path, monkeypatch, day, model_dir=model_dir, weather=weather)
    assert snapshot["persistence_weighted"] is False
    assert limits["learn"] is None
    printed = capsys.readouterr().out
    assert "persistence weighting off, building unweighted" in printed and reason in printed
    assert snapshot["fires"]                                              # a snapshot is always published
