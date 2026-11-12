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
