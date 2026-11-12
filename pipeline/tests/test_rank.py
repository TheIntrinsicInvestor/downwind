import numpy as np
import pandas as pd
import pytest

from dw.config import FIRE_CELL
from dw.rank import DayResult, run_day, top10_overlap
from tests.conftest import T0, flat_met, one_fire, toy_grids

T = T0
Y = T - pd.Timedelta(days=1)


def sq_id(lat, lon):
    return f"{int(np.floor(lat / FIRE_CELL))}_{int(np.floor(lon / FIRE_CELL))}"


def two_fires(a, b):
    return pd.concat([one_fire(Y, *a), one_fire(Y, *b)], ignore_index=True)


A, B = (0.0, 109.07), (0.0, 112.0)
A_ID, B_ID = sq_id(*A), sq_id(*B)
FIRES = two_fires(A, (0.3, 108.9))
MET = flat_met(3.0, 1.0, 0.2)
GRIDS = toy_grids(0.0, 109.34, 500_000)


def test_fire_next_to_city_outranks_fire_upwind_of_nothing():
    # east wind 5 m/s; fire A 30 km west of the city; fire B 300 km east of it (smoke blows away over empty land)
    res = run_day(T, two_fires(A, B), flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 500_000))
    r = res.squares.set_index("id")
    assert r.loc[A_ID, "rank"] == 1 and r.loc[B_ID, "rank"] == 2
    assert r.loc[B_ID, "exposure"] == 0 and r.loc[A_ID, "share"] == pytest.approx(1.0)
    assert r.loc[A_ID, "heading"] == "E"
    assert r.loc[A_ID, "top_places"][0][0] == "Kota Toy" and r.loc[A_ID, "first_arrival_h"] >= 0
    assert r.loc[A_ID, "people_40km"] >= 500_000


def test_identical_on_two_runs():
    a = run_day(T, FIRES, MET, GRIDS); b = run_day(T, FIRES, MET, GRIDS)
    pd.testing.assert_frame_equal(a.squares, b.squares)


def test_uses_previous_utc_day_only():                       # Review Focus 2
    fires = pd.concat([one_fire(day=T - pd.Timedelta(days=1)), one_fire(day=T, lat=1.0)])
    res = run_day(T, fires, flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 1000))
    assert len(res.squares) == 1 and res.date == T


def three_p1_fires():
    return pd.concat([one_fire(Y, la, 109.0) for la in (-0.2, 0.0, 0.2)], ignore_index=True)


def test_fewer_than_ten_priority_one():                      # Review Focus 3
    res = run_day(T, three_p1_fires(), flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 1000))
    assert sorted(res.squares["rank"].dropna()) == [1, 2, 3] and 0 <= res.top10_share <= 1.0
    assert res.counts == {"p1": 3, "p2": 0, "p3": 0}


def test_no_fires_at_all():                                  # Review Focus 3
    res = run_day(T, FIRES.iloc[0:0], flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 1000), record_frames=True)
    assert len(res.squares) == 0 and res.counts == {"p1": 0, "p2": 0, "p3": 0} and res.top10_share == 0.0
    assert len(res.frames) == 48 and all(len(f[0]) == 0 for f in res.frames)


def test_low_confidence_fire_emits_nothing_and_is_unranked():
    fires = pd.concat([one_fire(Y, *A, conf="l"), one_fire(Y, 0.3, 108.9)], ignore_index=True)
    res = run_day(T, fires, flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 1000), record_frames=True)
    r = res.squares.set_index("id")
    assert r.loc[A_ID, "tier"] == 3 and r.loc[A_ID, "exposure"] == 0 and np.isnan(r.loc[A_ID, "rank"])
    a_row = res.squares.index[res.squares.id == A_ID][0]
    assert all(not (f[3] == a_row).any() for f in res.frames)


def test_people_40km_only_for_top_20():                      # 25 fires -> 20 non-null people_40km
    fires = pd.concat([one_fire(Y, -0.6 + 0.05 * i, 109.0) for i in range(25)], ignore_index=True)
    res = run_day(T, fires, flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 1000))
    sq = res.squares
    assert sq.people_40km.notna().sum() == 20
    assert set(sq.loc[sq.people_40km.notna(), "rank"]) == set(range(1, 21))


def test_top10_overlap_counts_shared_ids():
    def res(ids):
        sq = pd.DataFrame({"id": ids, "rank": list(range(1, len(ids) + 1))})
        return DayResult(date=T, squares=sq, place_fire=pd.DataFrame(), counts={}, top10_share=0.0, frames=None)
    a = res([f"f{i}" for i in range(12)])
    b = res([f"f{i}" for i in range(3, 15)])
    assert top10_overlap(a, b) == 7


def test_frames_are_a_fixed_sample_with_square_indices():
    res = run_day(T, FIRES, MET, GRIDS, record_frames=True)
    assert len(res.frames) == 48
    la, lo, w, src = res.frames[10]
    assert len(la) > 0 and src.max() < len(res.squares)


def test_persist_halves_exposure_same_squares():
    plain = run_day(T, FIRES, MET, GRIDS)
    persist = pd.Series({A_ID: 0.5, sq_id(0.3, 108.9): 1.0})
    weighted = run_day(T, FIRES, MET, GRIDS, persist=persist)
    assert weighted.squares.id.tolist() == plain.squares.id.tolist()
    a = plain.squares.set_index("id").exposure[A_ID]
    assert weighted.squares.set_index("id").exposure[A_ID] == pytest.approx(0.5 * a)
