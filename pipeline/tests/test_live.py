import pandas as pd

from dw import live

DAY = pd.Timestamp("2026-11-15")
COLS = ["latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time", "satellite", "instrument",
        "confidence", "version", "bright_ti5", "frp", "daynight"]


def feed(rows):
    return pd.DataFrame([{"latitude": la, "longitude": lo, "bright_ti4": 330.0, "scan": 0.4, "track": 0.4,
                          "acq_date": d, "acq_time": t, "satellite": "N21", "instrument": "VIIRS",
                          "confidence": "n", "version": "2.0NRT", "bright_ti5": 290.0, "frp": 5.0, "daynight": "N"}
                         for la, lo, d, t in rows], columns=COLS)


def test_archive_keeps_detections_that_left_the_feed(tmp_path):
    archive = tmp_path / "archive.csv"
    first = tmp_path / "first.csv"
    feed([(0.1, 109.1, "2026-11-01", 1830), (0.2, 109.2, "2026-11-13", 1830)]).to_csv(first, index=False)
    live.merge_archive(first, archive, DAY - pd.Timedelta(days=1))
    second = tmp_path / "second.csv"                     # next morning's 7-day feed no longer has 1 Nov
    feed([(0.2, 109.2, "2026-11-13", 1830), (0.3, 109.3, "2026-11-14", 1830)]).to_csv(second, index=False)
    merged = live.merge_archive(second, archive, DAY)
    assert list(merged.acq_date) == ["2026-11-01", "2026-11-13", "2026-11-14"]   # kept, deduplicated, ordered
    assert len(pd.read_csv(archive)) == 3


def test_archive_drops_old_and_out_of_box_rows(tmp_path):
    src = tmp_path / "feed.csv"
    old = (DAY - pd.Timedelta(days=live.ARCHIVE_DAYS + 1)).strftime("%Y-%m-%d")
    feed([(0.1, 109.1, old, 600), (20.0, 100.0, "2026-11-14", 600), (0.1, 109.1, "2026-11-14", 600)]).to_csv(src, index=False)
    merged = live.merge_archive(src, None, DAY)
    assert len(merged) == 1 and merged.acq_date.iat[0] == "2026-11-14"
    assert list(merged.columns) == live.ARCHIVE_COLUMNS


def test_archive_missing_file_is_a_first_run(tmp_path):
    src = tmp_path / "feed.csv"
    feed([(0.1, 109.1, "2026-11-14", 600)]).to_csv(src, index=False)
    merged = live.merge_archive(src, tmp_path / "none" / "archive.csv", DAY)
    assert len(merged) == 1 and (tmp_path / "none" / "archive.csv").exists()


def test_build_live_ranks_from_the_merged_archive(tmp_path, monkeypatch):
    archive = tmp_path / "archive.csv"
    feed([(0.1, 109.1, "2026-11-05", 600)]).to_csv(archive, index=False)          # left the 7-day feed already
    src = feed([(0.2, 109.2, "2026-11-14", 600)])
    monkeypatch.setattr(live, "download", lambda url: src.to_csv(index=False).encode())
    monkeypatch.setattr(live, "prepare_grids", lambda: None)
    seen = {}

    def build(day, n, fires_csv, out, *, persistence_weather):
        seen["dates"] = sorted(pd.read_csv(fires_csv).acq_date)
        seen["weather"] = persistence_weather

    monkeypatch.setattr(live, "build_snapshots", build)
    live.build_live(DAY, tmp_path, archive)
    assert seen["dates"] == ["2026-11-05", "2026-11-14"] and seen["weather"] is None
    assert len(pd.read_csv(archive)) == 2 and (tmp_path / "manifest.json").exists()
