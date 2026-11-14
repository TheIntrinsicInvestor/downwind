"""Reference level for the per-place hourly smoke series (config.HOURLY_REF; 100 on the chart = this level).
usage: python -m dw.hourly_ref
Runs the replay days 18, 19 and 20 Sep 2026 exactly as dw.build.cmd_day does (forecast weather, shipped persistence
weighting, no bulletins, no Nebius) and prints the highest per-resident hourly value of any place."""
import numpy as np
import pandas as pd

from dw.fetch import load_fires, load_met, with_forecast
from dw.grids import load_grids
from dw.learn import load_learn, persist_for_day
from dw.rank import run_day

DAYS = ["2026-09-18", "2026-09-19", "2026-09-20"]


def main():
    fires, met, grids = load_fires(2026), load_met(2026), load_grids()
    model, learn = load_learn()
    use = bool(learn and learn["shipped"])
    print(f"persistence model: {'shipped, weighting smoke' if use else 'not used'}")
    vals = []
    for d in map(pd.Timestamp, DAYS):
        res = run_day(d, fires, with_forecast(met, d), grids, persist=persist_for_day(model, d) if use else None)
        v = res.place_hourly.to_numpy(float).ravel()
        vals.append(v[v > 0])
        print(f"{d:%Y-%m-%d}: {len(vals[-1])} nonzero place-hours, max {vals[-1].max():.6g}")
    v = np.concatenate(vals)
    print(f"place-hours nonzero: {len(v)}; median {np.median(v):.6g}; 99th percentile {np.percentile(v, 99):.6g}")
    print(f"max (worst hour of any place): {v.max():.6g}  -> HOURLY_REF (3 s.f.) = {float(f'{v.max():.3g}')}")


if __name__ == "__main__":
    main()
