import numpy as np
import pandas as pd
import pytest

import dw.learn as learn
from dw.learn import FEATURES, cv_aucs, decide, persistence_table
from tests.conftest import flat_met

T = pd.Timestamp("2026-09-20")


def two_day_fires(extra_on_T=False):
    """Detections on T-2 and T-1 in one square, one on T-1 in another; optionally one on T in the first."""
    rows = [(0.0, 110.0, T - pd.Timedelta(days=2), "D"), (0.0, 110.0, T - pd.Timedelta(days=1), "N"),
            (0.5, 111.0, T - pd.Timedelta(days=1), "D")]
    if extra_on_T:
        rows.append((0.0, 110.0, T, "D"))
    rows.append((3.0, 100.0, T, "D"))                   # something on T elsewhere, so T is inside the data
    return pd.DataFrame({"lat": [r[0] for r in rows], "lon": [r[1] for r in rows], "date": [r[2] for r in rows],
                         "frp": 5.0, "conf": "n", "daynight": [r[3] for r in rows]})


def _met():
    return flat_met(0, 0, 0, hours=24 * 6, t0=T - pd.Timedelta(days=4))


def test_features_use_only_t_minus_1_or_earlier():
    t = persistence_table(two_day_fires(), _met())
    t2 = persistence_table(two_day_fires(extra_on_T=True), _met())
    t, t2 = t[t["T"] == T].reset_index(drop=True), t2[t2["T"] == T].reset_index(drop=True)
    pd.testing.assert_frame_equal(t[FEATURES], t2[FEATURES])
    assert (t2.label >= t.label).all() and t2.label.sum() == t.label.sum() + 1


def test_feature_values_for_a_known_square():
    t = persistence_table(two_day_fires(), _met())
    r = t[(t["T"] == T) & (t.id == f"{int(np.floor(0.0 / 0.015))}_{int(np.floor(110.0 / 0.015))}")].iloc[0]
    assert r.n == 1 and r.n_night == 1 and r.n_day == 0 and r.days_running == 2 and r.seen_t2 == 1 and r.seen_t3 == 0
    assert r.month == 9 and r.label == 0


def test_label_missing_past_the_data():
    f = two_day_fires()
    f = f[f.date < T]                                     # nothing on T: T is past the data
    t = persistence_table(f, _met())
    assert t[t["T"] == T].label.isna().all()


def test_no_coordinates_in_features():
    assert not {"lat", "lon", "latitude", "longitude"} & set(FEATURES)


def test_decide_rule():
    assert decide(0.80, 0.66) and not decide(0.68, 0.66)


@pytest.mark.slow
def test_reproduces_research_cv():           # slow: same three folds as results_v3.md
    aucs = cv_aucs()                          # leave one season out over 2019, 2023, 2025
    assert aucs == pytest.approx([0.835, 0.832, 0.720], abs=0.01)


def test_2026_never_in_training(monkeypatch):
    seen = []
    real_fit = learn.fit
    monkeypatch.setattr(learn, "fit", lambda table: seen.append(set(table["T"].dt.year)) or real_fit(table))
    monkeypatch.setattr(learn, "SEASONS", (2023, 2025))             # keep the test quick
    learn.train_final()
    assert seen and all(2026 not in s for s in seen)
