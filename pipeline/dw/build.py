"""Command line entry point.
python -m dw.build --pick                  choose the replay day from the 2026 data and measure ranking stability
python -m dw.build --day 2026-09-20 --days 3   run T-3..T and export T-2, T-1, T into web/public/replay
python -m dw.build --learn                 train the persistence model, score 2026 once, save model and result"""
import argparse
import time
from pathlib import Path

import pandas as pd

from dw import config
from dw.bulletin import TOKENS, build_facts, make_bulletin, template_bulletin
from dw.evaluate import metar_daily, metar_path
from dw.export import export_day, write_index, write_limits
from dw.fetch import forecast_run, load_fires, load_fires_csv, load_forecast, load_met, with_forecast
from dw.grids import load_grids
from dw.learn import load_learn, persist_for_day, run_learn
from dw.rank import pick_day, run_day, stability, top10_overlap
from dw.tiers import assign_tiers, build_squares

REPLAY_OUT = config.ROOT / "downwind" / "web" / "public" / "replay"
SNAPSHOT_OUT = Path(__file__).resolve().parents[2] / "data" / "snapshots"


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


def cmd_day(day: pd.Timestamp, n_days: int, out=REPLAY_OUT, *, fires_csv: Path | None = None):
    t0 = time.time()
    fires = load_fires(2026) if fires_csv is None else load_fires_csv(fires_csv)
    grids = load_grids()
    days = [day - pd.Timedelta(days=i) for i in range(n_days, -1, -1)]      # T-n .. T; the first is only "previous"
    prev = None
    met = None
    model, learn = None, None
    if fires_csv is None:
        met = load_met(2026)
        model, learn = load_learn()
    use = bool(learn and learn["shipped"])
    print(f"persistence model: {'shipped, weighting smoke' if use else 'not used'}", flush=True)
    pers = (lambda d: persist_for_day(model, d)) if use else (lambda d: None)
    # each morning runs on the forecast in hand at 07:00 local (fetch.forecast_run), not on hindsight weather
    if met is not None:
        prev = run_day(days[0], fires, with_forecast(met, days[0]), grids, persist=pers(days[0]))
    exported = []
    for d in days[1:]:
        met_d = load_forecast(d) if met is None else with_forecast(met, d)
        res = run_day(d, fires, met_d, grids, record_frames=True, persist=pers(d))
        stab = stability(d, fires, met_d, grids, persist=pers(d))
        print(f"  forecast run {forecast_run(d):%Y-%m-%d %H} UTC", flush=True)
        if met is not None:
            stab["hindsight_overlap"] = top10_overlap(res, run_day(d, fires, met, grids, persist=pers(d)))
            print(f"  top ten shared with hindsight weather: {stab['hindsight_overlap']} of 10", flush=True)
        if use:
            plain = run_day(d, fires, met_d, grids)
            print(f"  weighted vs plain ranking: {top10_overlap(res, plain)} of 10 of the top ten shared", flush=True)
        facts = build_facts(res, prev)
        bulletin = (make_bulletin(facts) if fires_csv is None
                    else {"text": template_bulletin(facts), "source": "template", "model": None})
        export_day(res, prev, stab, bulletin, out)
        name = d.strftime("%Y-%m-%d")
        exported.append(name)
        size_j = (out / f"{name}.json").stat().st_size
        size_b = (out / f"{name}.particles.bin.gz").stat().st_size
        print(f"{name}: counts {res.counts}, top10 share {res.top10_share:.3f}, stability {stab}, "
              f"json {size_j / 1e6:.2f} MB + particles {size_b / 1e6:.2f} MB = {(size_j + size_b) / 1e6:.2f} MB", flush=True)
        print(f"  bulletin: source {bulletin['source']}, model {bulletin['model']}, tokens so far {TOKENS['total']}", flush=True)
        prev = res
    write_index(exported, exported[-1], out)
    write_limits(learn, out)
    print(f"wrote {len(exported)} days, index.json, limits.json to {out} in {time.time() - t0:.0f} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pick", action="store_true")
    ap.add_argument("--day")
    ap.add_argument("--days", type=int, help="days to export (default: 3 for replay, 1 with --fires-csv)")
    ap.add_argument("--fires-csv", type=Path, help="downloaded NASA FIRMS CSV for --day")
    ap.add_argument("--out", type=Path, help="output directory for --day")
    ap.add_argument("--learn", action="store_true")
    a = ap.parse_args()
    if (a.fires_csv is not None or a.out is not None) and not a.day:
        ap.error("--fires-csv and --out require --day")
    if a.days is not None and a.days < 1:
        ap.error("--days must be at least 1")
    if a.pick:
        cmd_pick()
    if a.learn:
        learn = run_learn()
        print("cross-validation AUC (hold out 2019, 2023, 2025):", learn["cv_auc"])
        print(f"2026 (scored once): model AUC {learn['test_auc_2026']}, days-burning AUC {learn['heuristic_auc_2026']}, "
              f"base rate {learn['base_rate_2026']}, shipped {learn['shipped']}")
    if a.day:
        n_days = a.days if a.days is not None else (3 if a.fires_csv is None else 1)
        default_out = REPLAY_OUT if a.fires_csv is None else SNAPSHOT_OUT
        cmd_day(pd.Timestamp(a.day), n_days, out=a.out or default_out, fires_csv=a.fires_csv)


if __name__ == "__main__":
    main()
