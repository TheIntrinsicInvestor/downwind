import numpy as np
import pytest

from dw.config import GRID_RES, R_KM
from dw.grids import load_grids, people_near

pytestmark = pytest.mark.research


@pytest.fixture(scope="module")
def g():
    return load_grids()


def test_population_total_inside_box(g):
    assert g.pop.values.shape == (280, 500)
    assert 150e6 < g.pop.values.sum() < 274e6          # box excludes eastern Indonesia; whole file is 274M
    assert g.pop.at(np.array([-6.2]), np.array([106.82]))[0] > 50_000     # central Jakarta cell


def test_pop40_is_population_within_40km(g):
    r, c = g.pop.index(np.array([-0.03]), np.array([109.34]))             # Pontianak
    yy, xx = np.ogrid[:g.pop.values.shape[0], :g.pop.values.shape[1]]
    disc = ((yy - r[0]) ** 2 + (xx - c[0]) ** 2) * (GRID_RES * 111.0) ** 2 <= R_KM ** 2
    assert g.pop40.values[r[0], c[0]] == pytest.approx(g.pop.values[disc].sum(), rel=0.02)


def test_province_mask(g):
    assert g.province.at(np.array([-0.03]), np.array([109.34]))[0]         # Pontianak: inside
    assert not g.province.at(np.array([1.55]), np.array([110.35]))[0]      # Kuching: Malaysia
    assert not g.province.at(np.array([-2.21]), np.array([113.92]))[0]     # Palangka Raya: Central Kalimantan
    assert "Pontianak" in " ".join(g.adm2_names)


def test_adm2_names_pontianak_and_outside_box(g):
    i = g.adm2.at(np.array([-0.03]), np.array([109.34]))[0]
    assert i >= 0 and "Pontianak" in g.adm2_names[i]
    assert g.adm2.at(np.array([20.0]), np.array([109.0]))[0] == -1         # outside BOX
    assert g.pop.at(np.array([20.0]), np.array([109.0]))[0] == 0


def test_people_near_single_cell_equals_pop40(g):
    visited = np.zeros(g.pop.values.shape, bool)
    r, c = g.pop.index(np.array([-0.03]), np.array([109.34]))
    visited[r[0], c[0]] = True
    assert people_near(g, visited) == pytest.approx(g.pop40.values[r[0], c[0]], rel=0.02)
    assert people_near(g, np.zeros_like(visited)) == 0


WEST_KALIMANTAN_REGENCIES = {
    "Bengkayang", "Kapuas Hulu", "Kayong Utara", "Ketapang", "Kota Pontianak", "Kota Singkawang", "Kubu Raya",
    "Landak", "Melawi", "Mempawah", "Sambas", "Sanggau", "Sekadau", "Sintang"}


def test_province_cells_carry_only_province_regencies(g):
    # ADM1 and ADM2 are simplified separately; a province cell must not be labelled with a neighbour's regency
    v = g.adm2.values
    inside = {g.adm2_names[i] for i in np.unique(v[g.province.values & (v >= 0)])}
    assert inside == WEST_KALIMANTAN_REGENCIES
    outside = {g.adm2_names[i] for i in np.unique(v[~g.province.values & (v >= 0)])}
    assert not (outside & WEST_KALIMANTAN_REGENCIES)
