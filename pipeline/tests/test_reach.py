import numpy as np
import pytest

from dw.reach import distance_grid, reach_from


def test_distance_to_a_line():
    grid = distance_grid([[(110.0, 0.0), (111.0, 0.0)]])          # one east-west road along the equator
    on = reach_from(grid, np.array([0.0]), np.array([110.5]))[0]
    north = reach_from(grid, np.array([0.1]), np.array([110.5]))[0]
    assert on < 1.2 and north == pytest.approx(11.1, rel=0.1)


def test_no_lines_means_unknown():
    grid = distance_grid([])
    assert np.isnan(reach_from(grid, np.array([0.0]), np.array([110.0]))[0])
