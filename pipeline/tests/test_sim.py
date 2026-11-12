import numpy as np
import pytest

from dw.sim import run_particles
from tests.conftest import T0, flat_met


def test_steady_east_wind_moves_smoke_east_at_wind_speed():
    seen = {}
    run_particles([0.0], [100.0], [24.0], {0: np.array([0])}, flat_met(u=5.0, v=0.0, rain=0.0),
                  T0, 11, sigma=0.0, on_step=lambda h, la, lo, w, s: seen.update({h: (la.copy(), lo.copy())}))
    assert seen[10][1][0] == pytest.approx(100.0 + 5.0 * 36000 / 111e3, abs=1e-3)
    assert seen[10][0][0] == pytest.approx(0.0, abs=1e-6)


def test_heavy_rain_removes_smoke():
    w = {}
    run_particles([0.0], [100.0], [24.0], {0: np.array([0])}, flat_met(0.0, 0.0, rain=10.0),
                  T0, 3, sigma=0.0, on_step=lambda h, la, lo, ww, s: w.update({h: ww.sum()}))
    assert w[1] == pytest.approx(w[0] * np.exp(-3.0))


def test_no_fires_no_smoke():
    calls = []
    run_particles([], [], [], {}, flat_met(5.0, 0.0, 0.0), T0, 5, on_step=lambda *a: calls.append(a[3].sum()))
    assert sum(calls) == 0


def test_same_seed_same_result():
    def positions():
        seen = {}
        rel = {h: np.array([0, 1]) for h in range(24)}
        run_particles([0.0, 1.0], [100.0, 105.0], [10.0, 20.0], rel, flat_met(3.0, 1.0, 0.5), T0, 21,
                      sigma=1.5, seed=7, jitter=0.015,
                      on_step=lambda h, la, lo, w, s: seen.update({h: (la.copy(), lo.copy(), w.copy(), s.copy())}))
        return seen[20]
    a, b = positions(), positions()
    assert len(a[0]) > 0
    for x, y in zip(a, b):
        np.testing.assert_array_equal(x, y)


def test_particle_leaving_grid_is_dropped():
    counts = {}
    run_particles([0.0], [119.0], [24.0], {0: np.array([0])}, flat_met(20.0, 0.0, 0.0), T0, 31,
                  sigma=0.0, on_step=lambda h, la, lo, w, s: counts.update({h: len(la)}))
    assert counts[0] > 0 and counts[30] == 0


def test_weight_per_particle_and_fractional_k():
    ws = {}
    run_particles([0.0], [100.0], [24.0], {h: np.array([0]) for h in range(4)}, flat_met(0.0, 0.0, 0.0), T0, 4,
                  k=0.5, sigma=0.0, on_step=lambda h, la, lo, w, s: ws.update({h: w.copy()}))
    assert len(ws[0]) == 0 and len(ws[1]) == 1 and len(ws[3]) == 2      # half a particle per hour accumulates
    assert ws[1][0] == pytest.approx(24.0 / (24 * 0.5))


def test_with_ids_gives_each_particle_a_stable_id():
    seen = {}
    run_particles([0.0], [119.5], [24.0], {0: np.array([0]), 1: np.array([0])}, flat_met(10.0, 0.0, 0.0), T0, 6,
                  sigma=0.0, with_ids=True,
                  on_step=lambda h, la, lo, w, s, pid: seen.update({h: (pid.copy(), lo.copy())}))
    assert seen[0][0].tolist() == [0, 1, 2, 3] and seen[1][0].tolist() == [0, 1, 2, 3, 4, 5, 6, 7]
    later = seen[2]
    for p, x in zip(*later):                  # a surviving particle keeps its id and its track
        assert x == pytest.approx(seen[1][1][list(seen[1][0]).index(p)] + 10.0 * 3600 / 111e3)
