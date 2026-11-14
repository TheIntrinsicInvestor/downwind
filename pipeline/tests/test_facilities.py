import json

import osmium
import pytest

from dw.facilities import Districts, category, export_facilities

SQUARE = {"type": "Feature", "properties": {"shapeName": "Kota Test"},
          "geometry": {"type": "Polygon", "coordinates": [[[110, 0], [110.1, 0], [110.1, 0.1], [110, 0.1], [110, 0]]]}}


@pytest.mark.parametrize("tags, expected", [
    ({"amenity": "school"}, "school"), ({"amenity": "hospital"}, "health"), ({"amenity": "clinic"}, "health"),
    ({"healthcare": "centre"}, "health"), ({"healthcare": "clinic"}, "health"),
    ({"amenity": "kindergarten"}, None), ({"amenity": "pharmacy"}, None), ({}, None),
])
def test_categories(tags, expected):
    assert category(tags) == expected


def test_district_lookup_respects_holes():
    holed = {"type": "Feature", "properties": {"shapeName": "Ring"},
             "geometry": {"type": "Polygon", "coordinates": [
                 [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]}}
    d = Districts([holed, SQUARE])
    assert d.name_at(1, 1) == "Ring" and d.name_at(5, 5) is None
    assert d.name_at(110.05, 0.05) == "Kota Test" and d.name_at(111, 0.05) is None


def test_real_pbf_export(tmp_path):
    path = tmp_path / "test.osm.pbf"
    with osmium.SimpleWriter(str(path)) as writer:
        writer.add_node(osmium.osm.mutable.Node(id=1, location=(110.02, 0.02), tags={"amenity": "school", "name": "SD 1"}))
        writer.add_node(osmium.osm.mutable.Node(id=2, location=(110.05, 0.05), tags={"healthcare": "centre"}))
        writer.add_node(osmium.osm.mutable.Node(id=3, location=(111.5, 0.5), tags={"amenity": "school"}))  # no district
        writer.add_node(osmium.osm.mutable.Node(id=4, location=(110.06, 0.06), tags={"amenity": "cafe"}))
        for i, pt in enumerate([(110.07, 0.07), (110.08, 0.07), (110.08, 0.08), (110.07, 0.08)], 10):
            writer.add_node(osmium.osm.mutable.Node(id=i, location=pt))
        writer.add_way(osmium.osm.mutable.Way(id=1, tags={"amenity": "hospital", "name": "RSUD"}, nodes=[10, 11, 12, 13, 10]))
    out = tmp_path / "facilities.geojson"
    assert export_facilities(path, out, Districts([SQUARE])) == 3
    data = json.loads(out.read_text())
    by_id = {f["id"]: f for f in data["features"]}
    assert by_id["node/1"]["properties"] == {"kind": "school", "name": "SD 1", "district": "Kota Test",
                                            "osm_url": "https://www.openstreetmap.org/node/1"}
    assert by_id["node/2"]["properties"]["kind"] == "health"
    hospital = by_id["way/1"]
    assert hospital["geometry"]["type"] == "Point" and hospital["properties"]["name"] == "RSUD"
    assert abs(hospital["geometry"]["coordinates"][0] - 110.075) < 0.002
    assert data["metadata"]["licence"] == "ODbL-1.0"
    previous = out.read_bytes()
    with pytest.raises(ValueError, match="No mapped"):
        export_facilities(path, out, Districts([SQUARE]), bbox=(98, -1, 99, 1))
    assert out.read_bytes() == previous
