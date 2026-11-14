import numpy as np
import pandas as pd
import pytest

from dw.config import FIRE_CELL
from dw.grids import load_grids, peat_at
from dw.tiers import assign_tiers, build_squares

DAY = pd.Timestamp("2026-09-20")
L_SHAPE = [(0, 0), (0, 1), (1, 0)]       # square offsets (lat, lon) that are all neighbours of each other


def det(lat, lon, day=DAY, conf="n", frp=10.0):
    return {"lat": lat, "lon": lon, "date": pd.Timestamp(day), "frp": frp, "conf": conf}


def fires(*rows):
    return pd.DataFrame(list(rows), columns=["lat", "lon", "date", "frp", "conf"])


def _scan(want_peat, need_clear_row=False):
    """A point in West Kalimantan whose peat status is want_peat (and, if asked, its 3-square row too)."""
    g = load_grids()
    for la in np.arange(-1.5, 1.0, 0.1):
        for lo in np.arange(109.0, 112.0, 0.1):
            p = np.array([la + FIRE_CELL / 2]), np.array([lo + FIRE_CELL / 2])
            if not g.province.at(*p)[0]:
                continue
            row = [p] if not need_clear_row else [(p[0] + a * FIRE_CELL, p[1] + b * FIRE_CELL) for a, b in L_SHAPE]
            if all(bool(peat_at(*q)[0]) == want_peat for q in row):
                return float(p[0][0]), float(p[1][0])
    raise AssertionError("no candidate point found")


@pytest.fixture(scope="module")
def grids():
    return load_grids()


@pytest.fixture(scope="module")
def peat_pt():
    return _scan(True)


@pytest.fixture(scope="module")
def dry_pt():
    return _scan(False, need_clear_row=True)


@pytest.fixture(scope="module")
def peat_row_pt():
    return _scan(True, need_clear_row=True)


@pytest.mark.research
def test_peat_alone_is_tier2(grids, peat_pt):
    # strict Pasal 9(3): peat is necessary but not sufficient
    sq = build_squares(fires(det(*peat_pt)), DAY, grids)
    assert len(sq) == 1 and sq.peat.iloc[0] and sq.in_province.iloc[0]
    assert assign_tiers(sq).tolist() == [2]


@pytest.mark.research
def test_tier1_peat_cluster(grids, peat_row_pt):
    # three mutually adjacent peat squares: each sees all 3 non-low detections in its 3x3 neighbourhood
    la, lo = peat_row_pt
    sq = build_squares(fires(*[det(la + a * FIRE_CELL, lo + b * FIRE_CELL) for a, b in L_SHAPE]), DAY, grids)
    assert len(sq) == 3 and sq.peat.all()
    assert assign_tiers(sq).tolist() == [1, 1, 1]


@pytest.mark.research
def test_cluster_off_peat_is_tier2(grids, dry_pt):
    la, lo = dry_pt
    sq = build_squares(fires(*[det(la + a * FIRE_CELL, lo + b * FIRE_CELL) for a, b in L_SHAPE]), DAY, grids)
    assert len(sq) == 3 and not sq.peat.any()
    assert assign_tiers(sq).tolist() == [2, 2, 2]


@pytest.mark.research
def test_line_of_three_only_middle_is_cluster(grids, dry_pt):
    # in a straight line the end squares see only 2 detections in their neighbourhood
    la, lo = dry_pt
    sq = build_squares(fires(*[det(la, lo + i * FIRE_CELL) for i in range(3)]), DAY, grids)
    assert sq.sort_values("lon").neighbours_nonlow.tolist() == [2, 3, 2]


@pytest.mark.research
def test_tier1_peat_persistent(grids, peat_pt):
    f = fires(*[det(*peat_pt, day=DAY - pd.Timedelta(days=d)) for d in (0, 1, 2)])
    sq3 = build_squares(f, DAY, grids)
    sq2 = build_squares(f, DAY - pd.Timedelta(days=1), grids)
    assert sq3.days_running.iloc[0] == 3 and sq2.days_running.iloc[0] == 2
    assert assign_tiers(sq3).tolist() == [1] and assign_tiers(sq2).tolist() == [2]


@pytest.mark.research
def test_persistent_off_peat_is_tier2(grids, dry_pt):
    f = fires(*[det(*dry_pt, day=DAY - pd.Timedelta(days=d)) for d in (0, 1, 2)])
    sq = build_squares(f, DAY, grids)
    assert sq.days_running.iloc[0] == 3 and assign_tiers(sq).tolist() == [2]


@pytest.mark.research
def test_tier2_isolated_non_peat(grids, dry_pt):
    sq = build_squares(fires(det(*dry_pt)), DAY, grids)
    assert assign_tiers(sq).tolist() == [2]


@pytest.mark.research
def test_tier3_low_confidence(grids, peat_pt):
    sq = build_squares(fires(det(*peat_pt, conf="l"), det(*peat_pt, conf="l")), DAY, grids)
    assert len(sq) == 1 and sq.frp.iloc[0] == 0 and sq.n_detect.iloc[0] == 2 and sq.n_nonlow.iloc[0] == 0
    assert assign_tiers(sq).tolist() == [3]


@pytest.mark.research
def test_square_id_stable_across_days(grids, dry_pt):
    f = fires(det(*dry_pt), det(*dry_pt, day=DAY - pd.Timedelta(days=5)))
    a = build_squares(f, DAY, grids)
    b = build_squares(f, DAY - pd.Timedelta(days=5), grids)
    assert a.id.tolist() == b.id.tolist() and len(a) == 1


@pytest.mark.research
def test_square_columns_and_place(grids):
    sq = build_squares(fires(det(-0.03, 109.34)), DAY, grids)
    assert {"id", "lat", "lon", "frp", "n_detect", "n_nonlow", "peat", "in_province", "place",
            "neighbours_nonlow", "days_running"} <= set(sq.columns)
    assert "Pontianak" in sq.place.iloc[0]


@pytest.mark.research
def test_other_day_ignored(grids, dry_pt):
    sq = build_squares(fires(det(*dry_pt, day=DAY - pd.Timedelta(days=1))), DAY, grids)
    assert len(sq) == 0


def test_fire_age_counts_days_running_in_square_or_neighbours():
    from dw.tiers import fire_age
    c = FIRE_CELL
    lat, lon = 0.5 * c, 109.0 + 0.5 * c
    rows = [det(lat, lon)]                                              # DAY
    rows += [det(lat + c, lon, DAY - pd.Timedelta(days=1))]             # neighbour square, DAY-1
    rows += [det(lat, lon, DAY - pd.Timedelta(days=2))]                 # same square, DAY-2
    rows += [det(lat, lon, DAY - pd.Timedelta(days=4))]                 # gap on DAY-3 ends the run
    rows += [det(lat, lon, DAY - pd.Timedelta(days=3), conf="l")]       # low confidence does not count
    fires = pd.DataFrame(rows)
    assert fire_age(fires, DAY, [lat], [lon]).tolist() == [3]
    far = fire_age(fires, DAY, [lat + 5 * c], [lon])                     # nothing nearby on DAY
    assert far.tolist() == [0]
    long = pd.DataFrame([det(lat, lon, DAY - pd.Timedelta(days=i)) for i in range(20)])
    assert fire_age(long, DAY, [lat], [lon]).tolist() == [14]           # capped
