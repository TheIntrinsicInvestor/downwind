"""Fire squares and the P.8/2018 tiers (our loose reading of Pasal 9, chosen by Brian on 12 Nov; spec 7.2).
Priority 1: on peat, or 3+ non-low detections in the square and its 8 neighbours (our own threshold; the
regulation gives none), or seen 3 days running. Priority 2: other non-low. Priority 3: low confidence only.
The rule's visible-smoke input is not computable and is omitted."""
import numpy as np
import pandas as pd

from dw.config import FIRE_CELL
from dw.grids import Grids, peat_at

CLUSTER_MIN = 3
PERSIST_DAYS = 3

COLUMNS = ["id", "lat", "lon", "frp", "n_detect", "n_nonlow", "peat", "in_province", "place",
           "neighbours_nonlow", "days_running"]


def _keys(lat, lon, cell):
    return np.floor(np.asarray(lat) / cell).astype(int), np.floor(np.asarray(lon) / cell).astype(int)


AGE_CAP = 14


def fire_age(fires: pd.DataFrame, day: pd.Timestamp, lat, lon, cell=FIRE_CELL) -> np.ndarray:
    """Consecutive days ending on `day` with a non-low detection in each square or its 8 neighbours, capped at
    AGE_CAP. Shown on the fire card only; it does not change the ranking."""
    nl = fires[fires.conf != "l"]
    seen = []
    for back in range(AGE_CAP):
        p = nl[nl.date == day - pd.Timedelta(days=back)]
        seen.append(set(zip(*_keys(p.lat, p.lon, cell))))
    iy, ix = _keys(lat, lon, cell)
    out = []
    for a, b in zip(iy, ix):
        near = {(a + dy, b + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)}
        n = 0
        for s in seen:
            if not (near & s):
                break
            n += 1
        out.append(n)
    return np.array(out, int)


def build_squares(fires: pd.DataFrame, day: pd.Timestamp, grids: Grids, cell=FIRE_CELL) -> pd.DataFrame:
    """One row per square with any detection on `day` (UTC acquisition date)."""
    day = pd.Timestamp(day)
    d = fires[fires.date == day]
    if d.empty:
        return pd.DataFrame({c: pd.Series(dtype=object) for c in COLUMNS})
    nonlow = (d.conf != "l").to_numpy()
    iy, ix = _keys(d.lat, d.lon, cell)
    det = pd.DataFrame({
        "iy": iy, "ix": ix,
        "frp": np.where(nonlow, d.frp.to_numpy(float), 0.0),
        "nonlow": nonlow.astype(int),
        "peat": peat_at(d.lat.to_numpy(), d.lon.to_numpy()) & nonlow,
    })
    sq = det.groupby(["iy", "ix"], sort=True).agg(
        frp=("frp", "sum"), n_detect=("frp", "size"), n_nonlow=("nonlow", "sum"), peat=("peat", "any")).reset_index()

    counts = dict(zip(zip(sq.iy, sq.ix), sq.n_nonlow))
    sq["neighbours_nonlow"] = [sum(counts.get((a + dy, b + dx), 0) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
                               for a, b in zip(sq.iy, sq.ix)]

    # consecutive days ending on `day` with a non-low detection in the square, capped
    earlier = []
    for back in range(1, PERSIST_DAYS):
        p = fires[(fires.date == day - pd.Timedelta(days=back)) & (fires.conf != "l")]
        earlier.append(set(zip(*_keys(p.lat, p.lon, cell))))
    running = []
    for a, b, n in zip(sq.iy, sq.ix, sq.n_nonlow):
        r = 0
        if n > 0:
            r = 1
            for seen in earlier:
                if (a, b) not in seen:
                    break
                r += 1
        running.append(min(r, PERSIST_DAYS))
    sq["days_running"] = running

    sq["lat"] = (sq.iy + 0.5) * cell
    sq["lon"] = (sq.ix + 0.5) * cell
    sq["id"] = [f"{a}_{b}" for a, b in zip(sq.iy, sq.ix)]
    sq["in_province"] = grids.province.at(sq.lat.to_numpy(), sq.lon.to_numpy()).astype(bool)
    idx = grids.adm2.at(sq.lat.to_numpy(), sq.lon.to_numpy())
    sq["place"] = [grids.adm2_names[i] if i >= 0 else None for i in idx]
    return sq[COLUMNS].reset_index(drop=True)


def assign_tiers(sq: pd.DataFrame) -> pd.Series:
    tier1 = sq.peat.astype(bool) | (sq.neighbours_nonlow >= CLUSTER_MIN) | (sq.days_running >= PERSIST_DAYS)
    t = np.where(sq.n_nonlow == 0, 3, np.where(tier1, 1, 2))
    return pd.Series(t, index=sq.index, name="tier", dtype=int)
