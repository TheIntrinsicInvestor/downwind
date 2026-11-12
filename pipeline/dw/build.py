"""Command line entry point.
python -m dw.build --pick                  choose the replay day from the 2026 data and measure ranking stability
python -m dw.build --day 2026-09-20 --days 3   run T-3..T and export T-2, T-1, T into web/public/replay"""
import argparse
import time

import pandas as pd

from dw import config
from dw.evaluate import metar_daily, metar_path
from dw.export import export_day, write_index, write_limits
from dw.fetch import load_fires, load_met
from dw.grids import load_grids
from dw.rank import pick_day, run_day, stability
from dw.tiers import assign_tiers, build_squares

REPLAY_OUT = config.ROOT / "downwind" / "web" / "public" / "replay"
EMPTY_BULLETIN = {"text": "", "source": "template", "model": None}


def pontianak_ext_2026() -> pd.Series:
    return metar_daily(metar_path(2026, "WIOO"), pd.Timestamp("2026-08-31"))


def cmd_pick():
    t0 = time.time()
    fires, met, grids = load_fires(2026), load_met(2026), load_grids()
    day = pick_day(fires, grids, pontianak_ext_2026())
    sq = build_squares(fires, day - pd.Timedelta(days=1), grids)
    tiers = assign_tiers(sq)[sq.in_province]
    print(f"replay day T = {day.date()} (fires detected {(day - pd.Timedelta(days=1)).date()} UTC)")
    print("province tiers:", {f"p{t}": int((tiers == t).sum()) for t in (1, 2, 3)})
    print("stability:", stability(day, fires, met, grids))
    print(f"runtime {time.time() - t0:.0f} s")


def cmd_day(day: pd.Timestamp, n_days: int, out=REPLAY_OUT):
    t0 = time.time()
    fires, met, grids = load_fires(2026), load_met(2026), load_grids()
    days = [day - pd.Timedelta(days=i) for i in range(n_days, -1, -1)]      # T-n .. T; the first is only "previous"
    prev = run_day(days[0], fires, met, grids)
    exported = []
    for d in days[1:]:
        res = run_day(d, fires, met, grids, record_frames=True)
        stab = stability(d, fires, met, grids)
        export_day(res, prev, stab, EMPTY_BULLETIN, out)
        name = d.strftime("%Y-%m-%d")
        exported.append(name)
        size_j = (out / f"{name}.json").stat().st_size
        size_b = (out / f"{name}.particles.bin.gz").stat().st_size
        print(f"{name}: counts {res.counts}, top10 share {res.top10_share:.3f}, stability {stab}, "
              f"json {size_j / 1e6:.2f} MB + particles {size_b / 1e6:.2f} MB = {(size_j + size_b) / 1e6:.2f} MB", flush=True)
        prev = res
    write_index(exported, exported[-1], out)
    write_limits(None, out)
    print(f"wrote {len(exported)} days, index.json, limits.json to {out} in {time.time() - t0:.0f} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pick", action="store_true")
    ap.add_argument("--day")
    ap.add_argument("--days", type=int, default=3)
    a = ap.parse_args()
    if a.pick:
        cmd_pick()
    if a.day:
        cmd_day(pd.Timestamp(a.day), a.days)


if __name__ == "__main__":
    main()
