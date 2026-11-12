"""Fire-persistence model: the likelihood that a fire square seen on T-1 is seen again on T.
Port of validation-2019-comparison/persistence.py (label A1, 0.015 degree squares, boosted model, no tuning).
Trained on 2019, 2023, 2025; scored once on 2026. The output is "likelihood of being seen again tomorrow",
never "chance the fire is still burning" (cloud and smoke hide fires)."""
import json
import pickle

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

from dw import config
from dw.fetch import Met, _fire_files, load_met
from dw.grids import peat_at

FEATURES = ["n", "frp_sum", "frp_max", "n_day", "n_night", "days_running", "days_in_7",
            "n_3x3", "n_5x5", "seen_t2", "seen_t3", "peat", "rain_t1", "rh_t1", "month"]
SEASONS = (2019, 2023, 2025)
MODEL_PATH = config.DATA / "persist_model.pkl"
LEARN_PATH = config.DATA / "learn.json"

KJ, KD, OFFI = 32768, 4096 * 32768, 1000          # square-day key: day * KD + (i + OFFI) * KJ + j


def load_detections(year: int) -> pd.DataFrame:
    """Non-low detections with day/night flag, 1 Jul to 1 Nov, in BOX (as the research script)."""
    frames = []
    for p in _fire_files(year):
        f = pd.read_csv(p, encoding="utf-8")
        if "type" in f.columns:
            f = f[f["type"] == 0]
        frames.append(f)
    f = pd.concat(frames, ignore_index=True)
    lon0, lat0, lon1, lat1 = config.BOX
    f["acq_date"] = pd.to_datetime(f.acq_date)
    f = f[(f.acq_date >= f"{year}-07-01") & (f.acq_date <= f"{year}-11-01") & (f.confidence != "l")
          & f.latitude.between(lat0, lat1) & f.longitude.between(lon0, lon1)]
    return pd.DataFrame({"lat": f.latitude.to_numpy(float), "lon": f.longitude.to_numpy(float),
                         "date": f.acq_date.to_numpy(), "frp": f.frp.to_numpy(float),
                         "conf": f.confidence.astype(str).to_numpy(), "daynight": f.daynight.astype(str).to_numpy()})


def _daily_weather(met: Met):
    t0 = met.times[0].normalize()
    nd = len(met.times) // 24
    rain = met.precip[:, :, :nd * 24].reshape(len(met.lats), len(met.lons), nd, 24).sum(axis=3)
    rh = (met.rh[:, :, :nd * 24].reshape(len(met.lats), len(met.lons), nd, 24).mean(axis=3)
          if met.rh is not None else np.full(rain.shape, np.nan))
    return t0, nd, rain, rh


def persistence_table(fires: pd.DataFrame, met: Met, cell=config.FIRE_CELL) -> pd.DataFrame:
    """One row per (square, T) for squares with a non-low detection on T-1 (T-1 from 1 Aug to 31 Oct):
    id, T, FEATURES, label (non-low detection in the same square on T; NaN when T is past the data)."""
    last_day = pd.Timestamp(fires.date.max())
    f = fires[fires.conf != "l"]
    day = ((pd.to_datetime(f.date) - pd.Timestamp("1970-01-01")).dt.days).to_numpy(np.int64)
    i = np.floor(f.lat.to_numpy() / cell).astype(np.int64) + OFFI
    j = np.floor(f.lon.to_numpy() / cell).astype(np.int64)
    d = pd.DataFrame({"K": day * KD + i * KJ + j, "frp": f.frp.to_numpy(float),
                      "day": (f.daynight.to_numpy() == "D").astype(int), "night": (f.daynight.to_numpy() != "D").astype(int)})
    g = d.groupby("K").agg(n=("frp", "size"), frp_sum=("frp", "sum"), frp_max=("frp", "max"),
                           n_day=("day", "sum"), n_night=("night", "sum")).reset_index()
    keys, cnt = g.K.to_numpy(), g.n.to_numpy()

    def look(q):
        ix = np.clip(np.searchsorted(keys, q), 0, max(len(keys) - 1, 0))
        return np.where(keys[ix] == q, cnt[ix], 0) if len(keys) else np.zeros(len(q), int)

    dates = pd.Timestamp("1970-01-01") + pd.to_timedelta(g.K.to_numpy() // KD, unit="D")
    in_window = (dates.month >= 8) & (dates.month <= 10)
    r = g[in_window].reset_index(drop=True)
    K = r.K.to_numpy()
    kday = K // KD
    I = (K % KD) // KJ
    J = K % KJ
    la = (I - OFFI + 0.5) * cell
    lo = (J + 0.5) * cell
    t_minus_1 = pd.Timestamp("1970-01-01") + pd.to_timedelta(kday, unit="D")
    T = t_minus_1 + pd.Timedelta(days=1)

    X = pd.DataFrame({"id": [f"{a - OFFI}_{b}" for a, b in zip(I, J)], "T": T,
                      "n": r.n.to_numpy(), "frp_sum": r.frp_sum.to_numpy(), "frp_max": r.frp_max.to_numpy(),
                      "n_day": r.n_day.to_numpy(), "n_night": r.n_night.to_numpy()})
    flags = np.vstack([(look(K - k * KD) > 0).astype(int) for k in range(7)])
    X["days_running"] = np.cumprod(flags, axis=0).sum(axis=0)
    X["days_in_7"] = flags.sum(axis=0)

    def hood(base, rad):
        s = np.zeros(len(base), int)
        for di in range(-rad, rad + 1):
            for dj in range(-rad, rad + 1):
                s += look(base + di * KJ + dj)
        return s

    X["n_3x3"] = hood(K, 1)
    X["n_5x5"] = hood(K, 2)
    X["seen_t2"] = flags[1]
    X["seen_t3"] = flags[2]
    X["peat"] = peat_at(la, lo).astype(int)
    t0, nd, rain, rh = _daily_weather(met)
    md = np.asarray((t_minus_1 - t0).days)
    ok = (md >= 0) & (md < nd)
    gi = np.clip(np.rint((la - met.lats[0]) / (met.lats[1] - met.lats[0])).astype(int), 0, len(met.lats) - 1)
    gj = np.clip(np.rint((lo - met.lons[0]) / (met.lons[1] - met.lons[0])).astype(int), 0, len(met.lons) - 1)
    rain_t1 = np.full(len(K), np.nan); rh_t1 = np.full(len(K), np.nan)
    rain_t1[ok] = rain[gi[ok], gj[ok], md[ok]]
    rh_t1[ok] = rh[gi[ok], gj[ok], md[ok]]
    X["rain_t1"] = rain_t1
    X["rh_t1"] = rh_t1
    X["month"] = np.asarray(T.month)
    label = (look(K + KD) > 0).astype(float)
    label[np.asarray(T > last_day)] = np.nan
    X["label"] = label
    return X


_TABLES: dict = {}


def season_table(year: int) -> pd.DataFrame:
    if year not in _TABLES:
        _TABLES[year] = persistence_table(load_detections(year), load_met(year, require_winds=False))
    return _TABLES[year]


def heuristic_auc(table) -> float:
    t = table[table.label.notna()]
    return float(roc_auc_score(t.label, t.days_running))


def fit(table) -> HistGradientBoostingClassifier:
    t = table[table.label.notna()]
    return HistGradientBoostingClassifier(max_depth=3, max_iter=200, learning_rate=0.05, random_state=0).fit(
        t[FEATURES].astype(float), t.label.astype(int))


def predict(model, table) -> pd.Series:
    return pd.Series(model.predict_proba(table[FEATURES].astype(float))[:, 1], index=table.id.to_numpy())


def _auc(model, table) -> float:
    t = table[table.label.notna()]
    return float(roc_auc_score(t.label, model.predict_proba(t[FEATURES].astype(float))[:, 1]))


def cv_aucs() -> list:
    """Leave one season out over SEASONS (the research folds)."""
    out = []
    for ho in SEASONS:
        train = pd.concat([season_table(y) for y in SEASONS if y != ho], ignore_index=True)
        out.append(round(_auc(fit(train), season_table(ho)), 3))
    return out


def train_final() -> HistGradientBoostingClassifier:
    return fit(pd.concat([season_table(y) for y in SEASONS], ignore_index=True))


def decide(model_auc: float, heuristic_auc: float) -> bool:
    """Ship only if the model beats counting days burned by at least 0.03 on 2026."""
    return model_auc >= heuristic_auc + 0.03


def run_learn() -> dict:
    """Train on SEASONS, score 2026 once, save the model and the Limits["learn"] block."""
    cv = cv_aucs()
    model = train_final()
    t26 = season_table(2026)
    auc26, heur26 = _auc(model, t26), heuristic_auc(t26)
    labelled = t26[t26.label.notna()]
    learn = {"shipped": decide(auc26, heur26), "test_auc_2026": round(auc26, 3), "heuristic_auc_2026": round(heur26, 3),
             "cv_auc": cv, "base_rate_2026": round(float(labelled.label.mean()), 3),
             "visibility_correction": "tested, not used"}
    MODEL_PATH.write_bytes(pickle.dumps(model))
    LEARN_PATH.write_text(json.dumps(learn), encoding="utf-8")
    return learn


def load_learn():
    """(model, learn dict) if run_learn has been run, else (None, None)."""
    if not (MODEL_PATH.exists() and LEARN_PATH.exists()):
        return None, None
    return pickle.loads(MODEL_PATH.read_bytes()), json.loads(LEARN_PATH.read_text(encoding="utf-8"))


def persist_for_day(model, day: pd.Timestamp) -> pd.Series:
    """Likelihood by square id for fires of day T-1 (2026)."""
    t = season_table(2026)
    return predict(model, t[t["T"] == pd.Timestamp(day)])
