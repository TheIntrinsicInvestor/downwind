"""Particle smoke engine. Every particle remembers the source that released it.
A port of the loop in validation-2023-replay/replay.py (simulate), keeping its random-draw order."""
import numpy as np
import pandas as pd

from dw.config import K, LIFE_H, RAIN_K, RELEASE_H, SEED, SIGMA


def _interp(field, met, la, lo, t):
    """Bilinear interpolation of field[:, :, t] at (la, lo)."""
    dlat = met.lats[1] - met.lats[0]
    dlon = met.lons[1] - met.lons[0]
    i = np.clip((la - met.lats[0]) / dlat, 0, len(met.lats) - 1.001)
    j = np.clip((lo - met.lons[0]) / dlon, 0, len(met.lons) - 1.001)
    i0 = i.astype(int); j0 = j.astype(int); di = i - i0; dj = j - j0
    f = field[:, :, t]
    return (f[i0, j0] * (1 - di) * (1 - dj) + f[i0 + 1, j0] * di * (1 - dj)
            + f[i0, j0 + 1] * (1 - di) * dj + f[i0 + 1, j0 + 1] * di * dj)


def run_particles(src_lat, src_lon, src_w, release, met, t0: pd.Timestamp, n_hours: int, *, level="925",
                  k=K, seed=SEED, sigma=SIGMA, rain_k=RAIN_K, life_h=LIFE_H, jitter=0.0, on_step=None, with_ids=False) -> None:
    """Run hourly from t0 for n_hours.

    release[h]: source indices releasing at hour offset h. Each release adds k particles per source
    (fractional k accumulated), weight src_w[i] / (RELEASE_H * k), uniform over a square of side `jitter`
    degrees centred on the source. Each hour: release, on_step(h, lat, lon, w, src), move by wind plus
    N(0, sigma) noise, rain removal, then drop old, out-of-grid and negligible particles.
    with_ids=True passes a sixth argument to on_step: each particle's id (release order, stable for its life)."""
    src_lat = np.asarray(src_lat, float); src_lon = np.asarray(src_lon, float); src_w = np.asarray(src_w, float)
    rng = np.random.default_rng(seed)
    U, V = met.u[level], met.v[level]
    h0 = int(round((t0 - met.times[0]) / pd.Timedelta(hours=1)))
    if h0 < 0 or h0 + n_hours > len(met.times):
        raise ValueError(f"met covers {met.times[0]} to {met.times[-1]}, run needs {n_hours} h from {t0}")
    la = np.empty(0); lo = np.empty(0); w = np.empty(0); age = np.empty(0); src = np.empty(0, int); pid = np.empty(0, int)
    half = jitter / 2
    acc = 0.0
    next_id = 0
    for h in range(n_hours):
        idx = release.get(h)
        if idx is not None and len(idx):
            acc += k; m = int(acc); acc -= m
            if m:
                rep = np.repeat(np.asarray(idx, int), m)
                la = np.r_[la, src_lat[rep] + rng.uniform(-half, half, len(rep))]
                lo = np.r_[lo, src_lon[rep] + rng.uniform(-half, half, len(rep))]
                w = np.r_[w, src_w[rep] / (RELEASE_H * k)]
                age = np.r_[age, np.zeros(len(rep))]
                src = np.r_[src, rep]
                pid = np.r_[pid, np.arange(next_id, next_id + len(rep))]
                next_id += len(rep)
        if on_step is not None:
            if with_ids:
                on_step(h, la, lo, w, src, pid)
            else:
                on_step(h, la, lo, w, src)
        if not len(la):
            continue
        t = h0 + h
        u = _interp(U, met, la, lo, t) + rng.normal(0, sigma, len(la))
        v = _interp(V, met, la, lo, t) + rng.normal(0, sigma, len(la))
        w = w * np.exp(-rain_k * _interp(met.precip, met, la, lo, t))
        la = la + v * 3600 / 111e3
        lo = lo + u * 3600 / (111e3 * np.cos(np.radians(la)))
        age += 1
        keep = ((age < life_h) & (la > met.lats[0]) & (la < met.lats[-1])
                & (lo > met.lons[0]) & (lo < met.lons[-1]) & (w > 1e-6))
        la, lo, w, age, src, pid = la[keep], lo[keep], w[keep], age[keep], src[keep], pid[keep]
