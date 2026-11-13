"""Season runs against airport visibility. Ports of validation-2023-replay/replay.py
(fire cells, city scores, daily means, METAR extinction, no-wind baseline, pooled metrics)."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from dw import config
from dw.fetch import load_fires, load_met
from dw.grids import peat_at
from dw.sim import run_particles


def _cities():
    c = json.loads((config.REPLAY_DATA / "cities.json").read_text(encoding="utf-8"))
    return ([x["name"] for x in c], np.array([x["lat"] for x in c]), np.array([x["lon"] for x in c]))


def _city_hits(la, lo, cla, clo, r_km):
    """bool (n_cities, n_particles): particle within r_km of each city."""
    dy = (la[None, :] - cla[:, None]) * 111.0
    dx = (lo[None, :] - clo[:, None]) * 111.0 * np.cos(np.radians(cla[:, None]))
    return dx * dx + dy * dy < r_km * r_km


def _season_cells(year, cell):
    """Non-low detections grouped into cell-days, as replay.py does. Returns (cells, met, day0)."""
    met = load_met(year)
    day0 = met.times[0].normalize()
    last = met.times[-1].normalize() - pd.Timedelta(days=3)
    f = load_fires(year)
    f = f[(f.conf != "l") & (f.date >= day0) & (f.date <= last)].copy()
    f["frp"] = f.frp * np.where(peat_at(f.lat.to_numpy(), f.lon.to_numpy()), config.PEAT_RATIO, 1.0)   # as rank.py
    f["clat"] = (np.floor(f.lat / cell) + 0.5) * cell
    f["clon"] = (np.floor(f.lon / cell) + 0.5) * cell
    cells = f.groupby(["date", "clat", "clon"]).agg(frp=("frp", "sum")).reset_index()
    cells["dix"] = (cells.date - day0).dt.days
    return cells, met, day0


def season_scores(year: int, level="925", fire_lag=1, cell=0.25, seed=0) -> pd.DataFrame:
    """Daily (local day) mean smoke score within R_KM of each city in cities.json. Index: local date."""
    default = (level, fire_lag, cell, seed) == ("925", 1, 0.25, 0)
    cache = config.DATA / f"season_{year}_{level}_peat.csv"
    if default and cache.exists():
        return pd.read_csv(cache, index_col=0, parse_dates=True, encoding="utf-8")
    names, cla, clo = _cities()
    cells, met, day0 = _season_cells(year, cell)
    nt = len(met.times)
    dix = cells.dix.to_numpy()
    release = {}
    for h in range(nt):
        idx = np.where(dix + fire_lag == h // 24)[0]
        if len(idx):
            release[h] = idx
    S = np.zeros((len(names), nt))

    def on_step(h, la, lo, w, src):
        if len(la):
            S[:, h] = _city_hits(la, lo, cla, clo, config.R_KM) @ w

    run_particles(cells.clat.to_numpy(), cells.clon.to_numpy(), cells.frp.to_numpy(), release, met,
                  met.times[0], nt, level=level, k=1.0, seed=seed, jitter=cell, on_step=on_step)
    d = (np.arange(nt) + config.LOCAL_OFFSET_H) // 24
    df = pd.DataFrame(S.T, columns=names).groupby(d).mean()
    df.index = day0 + pd.to_timedelta(df.index, unit="D")
    df.index.name = "date"
    if default:
        config.DATA.mkdir(parents=True, exist_ok=True)
        df.to_csv(cache, encoding="utf-8")
    return df


def baseline_scores(year: int, fire_lag=1, radius_km=300.0) -> pd.DataFrame:
    """No-wind baseline: FRP of fire cells within radius_km of each city, by fire day + lag."""
    names, cla, clo = _cities()
    cells, met, day0 = _season_cells(year, 0.25)
    nday = len(met.times) // 24
    B = np.zeros((len(names), nday + 2))
    for d, g in cells.groupby("dix"):
        dy = (g.clat.to_numpy()[None, :] - cla[:, None]) * 111
        dx = (g.clon.to_numpy()[None, :] - clo[:, None]) * 111 * np.cos(np.radians(cla[:, None]))
        dd = d + fire_lag
        if dd < B.shape[1]:
            B[:, dd] += (np.hypot(dx, dy) < radius_km) @ g.frp.to_numpy()
    df = pd.DataFrame(B.T, columns=names)
    df.index = day0 + pd.to_timedelta(np.arange(B.shape[1]), unit="D")
    df.index.name = "date"
    return df


def metar_path(year: int, icao: str) -> Path:
    if year == 2023:
        return config.REPLAY_DATA / "metar" / f"{icao}.csv"
    return config.CHECK_DATA / f"metar_{year}_{icao}.csv"


def metar_daily(path: Path, day0: pd.Timestamp, filt=True) -> pd.Series:
    """Daily mean extinction (3.9 / visibility km) per local day with at least 6 reports. Index: local date."""
    m = pd.read_csv(path, na_values=["M"], encoding="utf-8")
    if len(m) < 50:
        return pd.Series(dtype=float)
    m["valid"] = pd.to_datetime(m.valid)
    m = m.dropna(subset=["vsby"])
    m["wx"] = m.wxcodes.fillna("").astype(str)
    if filt:                                        # drop rain or fog reports unless smoke or haze is also coded
        bad = m.wx.str.contains("RA|DZ|TS|SH|FG|BR") & ~m.wx.str.contains("FU|HZ")
        m = m[~bad]
    vis = np.clip(m.vsby * 1.609, 0.2, 10.0)
    m["ext"] = 3.9 / vis
    m["d"] = ((m.valid - day0).dt.total_seconds() // 3600 + config.LOCAL_OFFSET_H) // 24
    g = m.groupby("d").ext.agg(["mean", "size"])
    s = g["mean"][g["size"] >= 6]
    s.index = day0 + pd.to_timedelta(s.index.astype(int), unit="D")
    return s


def clip_eval(df: pd.DataFrame, start: str, end: str) -> dict:
    sub = df.loc[pd.Timestamp(start):pd.Timestamp(end)]
    return {c: sub[c] for c in sub.columns}


def pooled_spearman(pred: dict, obs: dict) -> tuple[float, int, float]:
    """(rank-normalised pooled Spearman, n, mean top-quartile hit rate) over cities with at least 15 days."""
    pooled_x, pooled_o, hits = [], [], []
    for c, o in obs.items():
        p = pred[c]
        o = o[o.index.isin(p.index)]
        x = p.reindex(o.index).to_numpy()
        if len(o) < 15 or np.all(x == x[0]):
            hits.append(np.nan)
            continue
        q = max(1, int(round(0.25 * len(o))))
        top_o = set(np.argsort(-o.to_numpy())[:q])
        top_x = set(np.argsort(-x, kind="stable")[:q])
        hits.append(len(top_o & top_x) / q)
        pooled_x += list(pd.Series(x).rank(pct=True))
        pooled_o += list(pd.Series(o.to_numpy()).rank(pct=True))
    rho = spearmanr(pooled_x, pooled_o).correlation if pooled_x else np.nan
    return float(rho), len(pooled_x), float(np.nanmean(hits)) if hits else np.nan
