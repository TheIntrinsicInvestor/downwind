import json

import pandas as pd
import pytest

from dw.config import REPLAY_DATA
from dw.evaluate import baseline_scores, clip_eval, metar_daily, metar_path, pooled_spearman, season_scores

DAY0_2023 = pd.Timestamp("2023-08-31")
_CITIES = json.loads((REPLAY_DATA / "cities.json").read_text(encoding="utf-8"))
_ICAOS = ["WIBB", "WIOO", "WIPP", "WAOO", "WSSS", "WMKK", "WBGG"]       # the 7 airports in replay_log.txt
STATIONS_2023 = {c["name"]: c["icao"] for c in _CITIES if c["icao"] in _ICAOS}


def test_metar_path():
    assert metar_path(2023, "WIOO") == REPLAY_DATA / "metar" / "WIOO.csv"
    assert metar_path(2026, "WIOO").name == "metar_2026_WIOO.csv"


def test_pooled_spearman_perfect_agreement():
    idx = pd.date_range("2023-09-01", periods=20)
    s = pd.Series(range(20), index=idx, dtype=float)
    rho, n, hit = pooled_spearman({"A": s, "B": s * 2}, {"A": s, "B": s + 1})
    assert rho == pytest.approx(1.0) and n == 40 and hit == pytest.approx(1.0)


def test_2023_reproduction():          # slow: about 40 s
    assert len(STATIONS_2023) == 7
    sim, base = season_scores(2023), baseline_scores(2023)
    assert sim.shape[1] == 21
    obs = {c: metar_daily(metar_path(2023, icao), DAY0_2023) for c, icao in STATIONS_2023.items()}
    rho, n, hit = pooled_spearman(clip_eval(sim, "2023-09-01", "2023-10-31"), obs)
    assert rho == pytest.approx(0.45, abs=0.02) and n == 421 and hit == pytest.approx(0.48, abs=0.01)
    assert pooled_spearman(clip_eval(base, "2023-09-01", "2023-10-31"), obs)[0] == pytest.approx(0.38, abs=0.01)
