import json

import numpy as np
import pandas as pd
import pytest

import dw.rank as rank_mod
from dw import reach
from dw.export import _write_json
from dw.reach import annotate, reach_km
from tests.conftest import T0, flat_met, one_fire, peat_everywhere, toy_grids

_on_peat = pytest.fixture(scope="module", autouse=True)(peat_everywhere)


def test_lookup_matches_the_grid_cell():
    grid, w, n, res = reach._load()
    r, c = 700, 600                                           # an interior cell
    lat, lon = n - (r + 0.5) * res, w + (c + 0.5) * res
    assert reach_km(lat, lon) == pytest.approx(grid[r, c] / 10.0)
    assert reach_km([lat, lat], [lon, lon]).shape == (2,)


def test_grid_is_road_only():
    z = np.load(reach.GRID_PATH)
    assert reach.GRID_PATH.name == "reach_road_0.005.npz" and "road" in z.files and "any" not in z.files


def test_known_value_in_a_city():
    near_road = reach_km(-0.0263, 109.3425)                   # Pontianak city centre: a mapped road is within a few hundred metres
    assert 0 <= near_road < 1.0


def test_outside_the_grid_is_nan():
    out = reach_km([10.0, 0.0, 0.0, -10.0], [110.0, 100.0, 120.0, 110.0])
    assert np.isnan(out).all()


def test_ranking_unchanged_with_and_without_reach(monkeypatch):
    fires = pd.concat([one_fire(T0 - pd.Timedelta(days=1), 0.0, 109.07), one_fire(T0 - pd.Timedelta(days=1), 0.3, 108.9)],
                      ignore_index=True)
    args = (T0, fires, flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 500_000))
    with_reach = rank_mod.run_day(*args).squares
    monkeypatch.setattr(rank_mod, "reach_km", lambda lat, lon: np.full(np.shape(lat), np.nan))
    without = rank_mod.run_day(*args).squares
    assert with_reach.reach_km.notna().all() and without.reach_km.isna().all()
    cols = ["id", "tier", "exposure", "share", "rank"]
    pd.testing.assert_frame_equal(with_reach[cols], without[cols])


def test_annotate_only_fills_reach_km(tmp_path):
    day = {"date": "2026-09-18", "counts": {"p1": 1}, "bulletin": "Text with é and –.",
           "fires": [{"id": "a", "lat": 0.0, "lon": 110.0, "rank": 1, "share": 0.5, "reach_km": None},
                     {"id": "b", "lat": 20.0, "lon": 110.0, "rank": None, "share": None, "reach_km": None}]}
    p = tmp_path / "2026-09-18.json"
    _write_json(day, p)
    before = json.loads(p.read_text(encoding="utf-8"))
    annotate([p])
    after = json.loads(p.read_text(encoding="utf-8"))
    assert isinstance(after["fires"][0]["reach_km"], float) and after["fires"][1]["reach_km"] is None
    for f in before["fires"] + after["fires"]:
        f.pop("reach_km")
    assert before == after


from dw.reach import distance_grid, reach_from


def test_distance_to_a_line():
    grid = distance_grid([[(110.0, 0.0), (111.0, 0.0)]])          # one east-west road along the equator
    on = reach_from(grid, np.array([0.0]), np.array([110.5]))[0]
    north = reach_from(grid, np.array([0.1]), np.array([110.5]))[0]
    assert on < 1.2 and north == pytest.approx(11.1, rel=0.1)


def test_no_lines_means_unknown():
    grid = distance_grid([])
    assert np.isnan(reach_from(grid, np.array([0.0]), np.array([110.0]))[0])


@pytest.fixture
def local_pbf(tmp_path):
    import osmium
    path = tmp_path / 'small.osm.pbf'
    with osmium.SimpleWriter(str(path)) as writer:
        for i, point in enumerate([(109.0, 0.0), (111.0, 0.0),
                                   (110.0, -0.5), (110.0, 0.5),
                                   (115.0, 0.0), (116.0, 0.0)], 1):
            writer.add_node(osmium.osm.mutable.Node(id=i, location=point))
        for i, tags, nodes in [
            (1, {'highway': 'track'}, [1, 2]),
            (2, {'waterway': 'canal'}, [3, 4]),
            (3, {'highway': 'residential'}, [1, 2]),
            (4, {'highway': 'primary'}, [5, 6]),
        ]:
            writer.add_way(osmium.osm.mutable.Way(id=i, tags=tags, nodes=nodes))
    return path


def test_extract_filters_and_keeps_crossings(local_pbf, tmp_path):
    import json
    from dw.reach import extract_lines
    roads, water = tmp_path / 'roads.json', tmp_path / 'water.json'
    assert extract_lines(local_pbf, roads_path=roads, water_path=water,
                         bbox=(109.5, -1.0, 110.5, 1.0)) == (1, 1)
    assert json.loads(roads.read_text()) == [[[109.0, 0.0], [111.0, 0.0]]]
    assert json.loads(water.read_text()) == [[[110.0, -0.5], [110.0, 0.5]]]


def test_failed_extract_preserves_existing_lines(local_pbf, tmp_path):
    from dw.reach import extract_lines
    roads, water = tmp_path / 'roads.json', tmp_path / 'water.json'
    roads.write_text('previous roads')
    water.write_text('previous water')
    with pytest.raises(ValueError, match='no selected'):
        extract_lines(local_pbf, roads_path=roads, water_path=water, bbox=(98, -1, 99, 1))
    assert roads.read_text() == 'previous roads'
    assert water.read_text() == 'previous water'


def test_missing_lines_raise_actionable_error(tmp_path, monkeypatch):
    from dw import reach
    monkeypatch.setattr(reach, 'ROADS_PATH', tmp_path / 'roads.json')
    with pytest.raises(FileNotFoundError, match='python -m dw.reach'):
        reach.road_km([0], [110])


def test_outside_lines_have_no_distance():
    assert distance_grid([[(0, 0), (1, 0)]]) is None


def test_road_and_water_distances_are_independent(tmp_path, monkeypatch):
    import json
    from dw import reach
    roads, water = tmp_path / 'roads.json', tmp_path / 'water.json'
    roads.write_text(json.dumps([[(109, 0), (111, 0)]]))
    water.write_text(json.dumps([[(110, -1), (110, 1)]]))
    monkeypatch.setattr(reach, 'ROADS_PATH', roads)
    monkeypatch.setattr(reach, 'WATER_PATH', water)
    reach._grid.cache_clear()
    assert reach.road_km([0.1], [110])[0] == pytest.approx(11.1, rel=0.1)
    wet = reach.water_km([0.1], [110])[0]
    assert wet < 1.2
    reach._grid.cache_clear()


def test_failed_download_leaves_no_cache(tmp_path, monkeypatch):
    from dw import reach
    def unavailable(*args, **kwargs):
        raise OSError('offline')
    monkeypatch.setattr(reach.urllib.request, 'urlopen', unavailable)
    target = tmp_path / 'cache' / 'extract.osm.pbf'
    with pytest.raises(OSError, match='offline'):
        reach.fetch_pbf(target)
    assert list(target.parent.iterdir()) == []


def test_cached_download_does_not_use_network(tmp_path, monkeypatch):
    from dw import reach
    target = tmp_path / 'extract.osm.pbf'
    target.write_bytes(b'existing extract')
    monkeypatch.setattr(reach.urllib.request, 'urlopen', lambda *a, **k: pytest.fail('network called'))
    assert reach.fetch_pbf(target) == target
