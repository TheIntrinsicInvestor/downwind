"""One replay day: smoke from the fires of T-1, people-weighted exposure, ranking inside Priority 1,
stability between seeds and wind levels, and the choice of replay day."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

from dw.config import FIRE_CELL, K, PEAT_RATIO, RELEASE_H, SEED, WINDOW_H
from dw.grids import NC, NR, Grids, people_near
from dw.reach import reach_km
from dw.sim import run_particles
from dw.tiers import assign_tiers, build_squares, fire_age

FRAME_CAP = 8_000           # records per animation frame; the format allows 12,000, but particle records barely
                            # compress, and 8,000 keeps a full 5,000-fire day under 5 MB (12,000 gave 6.1 MB)
TOP_PEOPLE = 20             # squares that get a people_40km figure
TOP_SMOKE = 20              # best-ranked squares whose particles are always kept in the animation sample
COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


@dataclass
class DayResult:
    date: pd.Timestamp            # T
    squares: pd.DataFrame         # build_squares columns plus tier, exposure, share, rank, people_40km,
                                  # top_places, first_arrival_h, heading
    place_fire: pd.DataFrame      # place, fire_id, exposure, first_arrival_h
    counts: dict                  # {"p1", "p2", "p3"}, province only
    top10_share: float
    frames: list | None           # per hour: (lat, lon, w, square row index) of a fixed particle sample


def _heading(lat0, lon0, lat1, lon1):
    dx = (lon1 - lon0) * np.cos(np.radians(lat0))
    dy = lat1 - lat0
    if dx == 0 and dy == 0:
        return None
    return COMPASS[int(round(np.degrees(np.arctan2(dx, dy)) / 45.0)) % 8]


def run_day(day, fires, met, grids: Grids, *, level="925", k=K, seed=SEED, cell=FIRE_CELL, record_frames=False,
            persist: pd.Series | None = None) -> DayResult:
    day = pd.Timestamp(day).normalize()
    sq = build_squares(fires, day - pd.Timedelta(days=1), grids, cell).reset_index(drop=True)
    sq["tier"] = assign_tiers(sq).astype(int) if len(sq) else pd.Series(dtype=int)
    n = len(sq)
    sq["age_days"] = fire_age(fires, day - pd.Timedelta(days=1), sq.lat, sq.lon, cell) if n else []
    sq["reach_km"] = reach_km(sq.lat.to_numpy(float), sq.lon.to_numpy(float)) if n else []   # card information only

    src_rows = np.where(sq.frp.to_numpy(float) > 0)[0] if n else np.empty(0, int)
    w_src = sq.frp.to_numpy(float)[src_rows] if n else np.empty(0)
    if len(src_rows):                                   # peat makes about 6 times more smoke per unit of heat
        w_src = w_src * np.where(sq.peat.to_numpy(bool)[src_rows], PEAT_RATIO, 1.0)
    if persist is not None and len(src_rows):
        w_src = w_src * persist.reindex(sq.id.to_numpy()[src_rows]).fillna(1.0).to_numpy(float)
    ns = len(src_rows)
    na = len(grids.adm2_names)

    exposure = np.zeros(ns)
    place_exp = np.zeros(ns * na)
    place_first = np.full(ns * na, np.inf)
    place_peak = np.zeros(ns * na)
    place_peak_hour = np.zeros(ns * na, dtype=int)
    sum_lat = np.zeros(ns); sum_lon = np.zeros(ns); sum_w = np.zeros(ns)
    in_p1 = np.zeros(ns, bool)
    if ns:
        in_p1 = (sq.in_province.to_numpy(bool) & (sq.tier.to_numpy() == 1))[src_rows]
    visited_keys = []                       # (source, cell) pairs for province Priority 1 sources
    frames = [] if record_frames else None
    max_particles = ns * (int(k * RELEASE_H) + 1)
    pick = np.random.default_rng(seed + 1).random(max_particles) < min(1.0, FRAME_CAP / max(max_particles, 1))

    def on_step(h, la, lo, w, s, pid):
        if len(la):
            exposure[:] += np.bincount(s, weights=w * grids.pop40.at(la, lo), minlength=ns)
            a = grids.adm2.at(la, lo)
            pp = w * grids.pop.at(la, lo)
            m = (a >= 0) & (pp > 0)
            key = s[m] * na + a[m]
            hourly = np.bincount(key, weights=pp[m], minlength=ns * na)
            place_exp[:] += hourly
            higher = hourly > place_peak
            place_peak[higher] = hourly[higher]
            place_peak_hour[higher] = h
            np.minimum.at(place_first, key, h)
            if h == 24:
                sum_lat[:] += np.bincount(s, weights=w * la, minlength=ns)
                sum_lon[:] += np.bincount(s, weights=w * lo, minlength=ns)
                sum_w[:] += np.bincount(s, weights=w, minlength=ns)
            m1 = in_p1[s]
            if m1.any():
                r, c = grids.pop.index(la[m1], lo[m1])
                ok = (r >= 0) & (r < NR) & (c >= 0) & (c < NC)
                visited_keys.append(np.unique(s[m1][ok].astype(np.int64) * (NR * NC) + r[ok] * NC + c[ok]))
        if frames is not None:                  # candidates: background sample plus every province Priority 1 particle
            keep = (pick[pid] | in_p1[s]) if len(pid) else np.zeros(0, bool)
            frames.append((la[keep].copy(), lo[keep].copy(), w[keep].copy(), s[keep].copy(), pid[keep].copy()))

    run_particles(sq.lat.to_numpy(float)[src_rows] if n else [], sq.lon.to_numpy(float)[src_rows] if n else [],
                  w_src, {h: np.arange(ns) for h in range(RELEASE_H)} if ns else {}, met, day, WINDOW_H,
                  level=level, k=k, seed=seed, jitter=cell, on_step=on_step, with_ids=True)

    # per square results
    sq["exposure"] = 0.0
    if ns:
        sq.loc[src_rows, "exposure"] = exposure
    prov = sq.in_province.to_numpy(bool) if n else np.zeros(0, bool)
    total = float(sq.exposure[prov].sum()) if n else 0.0
    sq["share"] = sq.exposure / total if total > 0 else 0.0
    sq["rank"] = np.nan
    if n:
        cand = sq[prov & (sq.tier == 1)].sort_values(["exposure", "id"], ascending=[False, True])
        sq.loc[cand.index, "rank"] = np.arange(1, len(cand) + 1, dtype=float)
    top10_share = float(sq.share[sq["rank"] <= 10].sum()) if n else 0.0

    # places
    pe = place_exp.reshape(ns, na) if ns else np.zeros((0, na))
    pf = place_first.reshape(ns, na) if ns else np.zeros((0, na))
    peak_hours = place_peak_hour.reshape(ns, na)
    rows, top_places, first_arrival = [], [None] * n, [np.nan] * n
    for j in range(ns):
        tot = pe[j].sum()
        if tot <= 0:
            continue
        order = np.argsort(-pe[j], kind="stable")
        order = order[pe[j][order] > 0]
        i = src_rows[j]
        top_places[i] = [(grids.adm2_names[a], float(pe[j, a] / tot)) for a in order[:3]]
        first_arrival[i] = float(pf[j, order[0]])
        for a in order:
            rows.append((grids.adm2_names[a], sq.id.iat[i], float(pe[j, a]), float(pf[j, a]), int(peak_hours[j, a])))
    sq["top_places"] = pd.Series(top_places, index=sq.index, dtype=object)
    sq["first_arrival_h"] = first_arrival
    place_fire = pd.DataFrame(rows, columns=["place", "fire_id", "exposure", "first_arrival_h", "peak_h"])

    heading = [None] * n
    for j in range(ns):
        if sum_w[j] > 0:
            i = src_rows[j]
            heading[i] = _heading(sq.lat.iat[i], sq.lon.iat[i], sum_lat[j] / sum_w[j], sum_lon[j] / sum_w[j])
    sq["heading"] = pd.Series(heading, index=sq.index, dtype=object)

    # people within 40 km of the smoke path, for the best-ranked squares only
    sq["people_40km"] = np.nan
    if n and visited_keys:
        keys = np.unique(np.concatenate(visited_keys))
        src_of = keys // (NR * NC)
        cell_of = keys % (NR * NC)
        row_to_src = {int(r): j for j, r in enumerate(src_rows)}
        for i in sq.index[sq["rank"] <= TOP_PEOPLE]:
            j = row_to_src.get(int(i))
            visited = np.zeros(NR * NC, bool)
            if j is not None:
                visited[cell_of[src_of == j]] = True
            sq.loc[i, "people_40km"] = float(people_near(grids, visited.reshape(NR, NC)))
    elif n:
        for i in sq.index[sq["rank"] <= TOP_PEOPLE]:
            sq.loc[i, "people_40km"] = 0.0

    if frames is not None:
        frames = _final_frames(frames, sq, src_rows, pick)

    if persist is not None:
        sq["persist_p"] = persist.reindex(sq.id.to_numpy()).to_numpy(float) if n else []

    p = sq[prov] if n else sq
    counts = {f"p{t}": int((p.tier == t).sum()) if n else 0 for t in (1, 2, 3)}
    return DayResult(date=day, squares=sq, place_fire=place_fire, counts=counts, top10_share=top10_share,
                     frames=frames)


def _final_frames(cands, sq, src_rows, pick):
    """Per hour: all particles of the TOP_SMOKE best-ranked squares (best rank first), then the background
    sample, truncated to FRAME_CAP. Ordered by priority then particle id, so a particle keeps its place."""
    prio = np.full(len(src_rows), np.inf)
    if len(src_rows):
        r = sq["rank"].to_numpy(float)[src_rows]
        top = r <= TOP_SMOKE
        prio[top] = r[top]
    out = []
    for la, lo, w, s, pid in cands:
        if not len(la):
            out.append((la, lo, w, s))
            continue
        pr = prio[s]
        use = np.isfinite(pr) | pick[pid]
        order = np.lexsort((pid[use], pr[use]))[:FRAME_CAP]
        idx = np.where(use)[0][order]
        out.append((la[idx], lo[idx], w[idx], src_rows[s[idx]]))
    return out


def _top10(res: DayResult) -> set:
    sq = res.squares
    return set(sq.id[sq["rank"] <= 10]) if len(sq) else set()


def top10_overlap(a: DayResult, b: DayResult) -> int:
    return len(_top10(a) & _top10(b))


def stability(day, fires, met, grids, *, k=K, cell=FIRE_CELL, persist=None) -> dict:
    base = run_day(day, fires, met, grids, k=k, cell=cell, seed=0, persist=persist)
    other_seed = run_day(day, fires, met, grids, k=k, cell=cell, seed=1, persist=persist)
    surface = run_day(day, fires, met, grids, k=k, cell=cell, seed=0, level="10m", persist=persist)
    return {"seed_overlap": top10_overlap(base, other_seed), "wind_level_overlap": top10_overlap(base, surface),
            "cell": cell, "k": k}


def pick_day(fires, grids, pontianak_ext: pd.Series) -> pd.Timestamp:
    """Among T in 2026-09-04..2026-10-30 with Pontianak extinction in the season's worst quartile,
    the T with the most province Priority 1 squares on T-1."""
    ext = pontianak_ext.dropna()
    worst = ext[ext >= ext.quantile(0.75)]
    best, best_n = None, -1
    for t in sorted(worst.index):
        if not (pd.Timestamp("2026-09-04") <= t <= pd.Timestamp("2026-10-30")):
            continue
        sq = build_squares(fires, t - pd.Timedelta(days=1), grids)
        if not len(sq):
            continue
        n = int(((assign_tiers(sq) == 1) & sq.in_province).sum())
        if n > best_n:
            best, best_n = pd.Timestamp(t), n
    return best
