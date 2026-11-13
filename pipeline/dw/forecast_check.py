"""Does the smoke index keep its skill with the forecast a task force actually had? (13 Nov 2026)

For each local day T from 2 Sep to 31 Oct 2026, the mean smoke score near each airport city over local day T,
built exactly as evaluate.season_scores builds it (fires of day d released over UTC day d + 1, 0.25 degree cells,
peat-weighted FRP, 925 hPa winds, 48 h particles), but run separately per day so the weather can differ:
  forecast:  hindsight weather before T 00 UTC (already past at the 07:00 local meeting), then the previous day's
             12 UTC ECMWF IFS 0.25 degree run (fetch.forecast_run) for T 00 UTC onwards;
  hindsight: the stitched historical-forecast weather throughout, as in the 2023 test.
Both use the same random seed, so they differ only in the weather. Scored against daily airport visibility
(METAR extinction) at the five airports with 2026 records, with the no-wind fire count as the baseline.
usage: python -m dw.forecast_check"""
import json

import numpy as np
import pandas as pd

from dw import config
from dw import evaluate as ev
from dw.fetch import REQUIRED, Met, fetch_forecast, forecast_run, with_forecast
from dw.sim import run_particles

START, END = pd.Timestamp("2026-09-02"), pd.Timestamp("2026-10-31")
STEP = 2                                                 # 2 degree weather grid for BOTH runs (API call budget)
AIRPORTS = ["WIOO", "WIBB", "WIPP", "WAOO", "WBGG"]      # Pontianak, Pekanbaru, Palembang, Banjarmasin, Kuching
SPAN_H = 65                                              # T-2 00 UTC to T 17 UTC, the end of local day T


def day_scores(T, cells, day0, met, cla, clo, cell=0.25, seed=0) -> np.ndarray:
    """Mean smoke score within R_KM of each city over local day T (T-1 17 UTC to T 17 UTC). Particles come from
    fires of T-3, T-2 and T-1, each released over the following UTC day, so every particle alive in that day is
    included (they live 48 h)."""
    T = pd.Timestamp(T).normalize()
    s0 = T - pd.Timedelta(days=2)
    base = (s0 - day0).days                              # day index of UTC day s0
    dix = cells.dix.to_numpy()
    release = {}
    for h in range(SPAN_H):
        idx = np.where(dix + 1 == base + h // 24)[0]     # fires of day d release over UTC day d + 1
        if len(idx):
            release[h] = idx
    first = SPAN_H - 24                                  # T-1 17 UTC is hour 41
    S = np.zeros((len(cla), 24))

    def on_step(h, la, lo, w, src):
        if h >= first and len(la):
            S[:, h - first] = ev._city_hits(la, lo, cla, clo, config.R_KM) @ w

    run_particles(cells.clat.to_numpy(), cells.clon.to_numpy(), cells.frp.to_numpy(), release, met, s0, SPAN_H,
                  level="925", k=1.0, seed=seed, jitter=cell, on_step=on_step)
    return S.mean(axis=1)


def coarsen(met: Met, step: int) -> Met:
    """Every `step`-th grid point of `met`, so hindsight and forecast runs share one grid."""
    s = (slice(None, None, step), slice(None, None, step))
    return Met(lats=met.lats[::step], lons=met.lons[::step], times=met.times,
               u={k: a[s] for k, a in met.u.items()}, v={k: a[s] for k, a in met.v.items()},
               precip=met.precip[s], rh=None if met.rh is None else met.rh[s])


def thin_raw(raw, step: int) -> dict:
    """A stored 1 degree forecast thinned to every `step`-th point (no new download)."""
    out = {k: np.asarray(raw[k])[::step, ::step] for k in REQUIRED}
    out.update(lats=np.asarray(raw["lats"])[::step], lons=np.asarray(raw["lons"])[::step], times=np.asarray(raw["times"]))
    return out


def coarse_forecast(day, step: int = STEP) -> dict:
    """The day's forecast on the coarse grid: thinned from a 1 degree file if one exists, else downloaded."""
    full = config.DATA / f"forecast_{forecast_run(day):%Y%m%dT%H}.npz"
    if full.exists():
        return thin_raw(np.load(full), step)
    return dict(np.load(fetch_forecast(day, step=step)))


def _station_cities():
    names, cla, clo = ev._cities()
    icao = {c["name"]: c["icao"] for c in json.loads((config.REPLAY_DATA / "cities.json").read_text(encoding="utf-8"))}
    keep = [i for i, n in enumerate(names) if icao.get(n) in AIRPORTS]
    return [names[i] for i in keep], cla[keep], clo[keep], {names[i]: icao[names[i]] for i in keep}


def main(seeds=(0, 1)):
    names, cla, clo, icao = _station_cities()
    cells, met_full, day0 = ev._season_cells(2026, 0.25)
    met = coarsen(met_full, STEP)
    days = pd.date_range(START, END)
    obs = {n: ev.metar_daily(ev.metar_path(2026, icao[n]), day0) for n in names}
    out = {}
    for seed in seeds:
        rows = {"forecast": [], "hindsight": []}
        for T in days:
            rows["forecast"].append(day_scores(T, cells, day0, with_forecast(met, T, coarse_forecast(T)), cla, clo, seed=seed))
            rows["hindsight"].append(day_scores(T, cells, day0, met, cla, clo, seed=seed))
        for k, v in rows.items():
            df = pd.DataFrame(np.array(v), index=days, columns=names)
            rho, n, hit = ev.pooled_spearman({c: df[c] for c in names}, obs)
            pont = [c for c in names if icao[c] == "WIOO"][0]
            o = obs[pont].loc[START:END]
            p_rho = pd.Series(df[pont].reindex(o.index).to_numpy()).corr(pd.Series(o.to_numpy()), method="spearman")
            out[(k, seed)] = (rho, n, hit, p_rho)
            print(f"{k:9} seed {seed}: pooled {rho:.3f}  n {n}  worst-quartile hit {hit:.3f}  Pontianak {p_rho:.3f}",
                  flush=True)
    base = ev.baseline_scores(2026).loc[START:END]
    rho, n, hit = ev.pooled_spearman({c: base[c] for c in names}, obs)
    print(f"baseline (fire count within 300 km, no wind): pooled {rho:.3f}  n {n}  worst-quartile hit {hit:.3f}")
    return out


def fetch_all() -> int:
    """Download every missing coarse forecast; stop at the first failure (the free API's hourly or daily limit).
    Returns how many days still lack a forecast."""
    missing = 0
    for T in pd.date_range(START, END):
        try:
            coarse_forecast(T)
        except RuntimeError as e:
            print(f"stopped at {T.date()}: {e}", flush=True)
            missing = sum(1 for d in pd.date_range(T, END)
                          if not (config.DATA / f"forecast_{forecast_run(d):%Y%m%dT%H}.npz").exists()
                          and not (config.DATA / f"forecast_{forecast_run(d):%Y%m%dT%H}_{STEP}deg.npz").exists())
            break
    print(f"{missing} days still without a forecast", flush=True)
    return missing


if __name__ == "__main__":
    import sys
    if "--fetch" in sys.argv:
        fetch_all()
    else:
        main()
