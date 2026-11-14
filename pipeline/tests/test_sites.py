import json
import osmium
import pytest

from dw.sites import category, export_sites


@pytest.mark.parametrize('tags, expected', [
    ({'landuse': 'industrial'}, 'industrial'), ({'man_made': 'works'}, 'industrial'),
    ({'landuse': 'orchard', 'trees': 'oil_palm'}, 'plantation'),
    ({'landuse': 'farmland', 'crop': 'rubber'}, 'plantation'),
    ({'landuse': 'orchard', 'trees': 'oil_palms'}, 'plantation'),
    ({'landuse': 'farmland', 'produce': 'palm_oil'}, 'plantation'),
    ({'landuse': 'farmland'}, None), ({'landuse': 'forest'}, None),
])
def test_only_explicit_mapped_categories(tags, expected):
    assert category(tags) == expected


def test_real_pbf_polygon_extraction(tmp_path):
    path = tmp_path / 'test.osm.pbf'
    with osmium.SimpleWriter(str(path)) as writer:
        for i, pt in enumerate([(110, 0), (110.02, 0), (110.02, 0.02), (110, 0.02)], 1):
            writer.add_node(osmium.osm.mutable.Node(id=i, location=pt))
        for i, tags in [(1, {'landuse': 'industrial', 'name': 'Test area'}),
                        (2, {'landuse': 'orchard', 'trees': 'oil_palm'}),
                        (3, {'landuse': 'farmland'})]:
            writer.add_way(osmium.osm.mutable.Way(id=i, tags=tags, nodes=[1, 2, 3, 4, 1]))
    out = tmp_path / 'sites.geojson'
    assert export_sites(path, out) == 2
    data = json.loads(out.read_text())
    assert {f['properties']['kind'] for f in data['features']} == {'industrial', 'plantation'}
    assert all(f['geometry']['type'] == 'MultiPolygon' for f in data['features'])
    assert data['metadata']['licence'] == 'ODbL-1.0'
    assert data['features'][0]['properties']['osm_url'].startswith('https://www.openstreetmap.org/way/')
    previous = out.read_bytes()
    with pytest.raises(ValueError, match='No mapped'):
        export_sites(path, out, bbox=(98, -1, 99, 1))
    assert out.read_bytes() == previous
