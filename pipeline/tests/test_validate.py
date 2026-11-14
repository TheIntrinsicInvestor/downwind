import gzip
import json
import shutil
import struct
from pathlib import Path

import pytest

from dw.validate import validate_snapshot

DATE = "2026-09-20"
ID = DATE + "-" + "a" * 32


@pytest.fixture
def snapshot(tmp_path):
    replay = Path(__file__).resolve().parents[2] / "web/public/replay"
    for name in (f"{DATE}.json", f"{DATE}.particles.bin.gz", "limits.json"):
        shutil.copyfile(replay / name, tmp_path / name)
    (tmp_path / "manifest.json").write_text(json.dumps({
        "id": ID, "date": DATE, "source": "VIIRS_NOAA21_NRT",
        "generated_at": DATE + "T00:20:00+00:00",
        "observation_cutoff": DATE + "T00:00:00Z", "forecast_run": "2026-09-19T12:00:00Z",
    }))
    return tmp_path


def edit(root, name, change):
    path = root / name
    value = json.loads(path.read_text())
    change(value)
    path.write_text(json.dumps(value))


def test_real_replay_payload_passes(snapshot):
    assert validate_snapshot(snapshot) == ID


@pytest.mark.parametrize("field,value", [
    ("id", "../../outside"), ("date", "2026-09-21"),
    ("forecast_run", "2026-09-20T12:00:00Z"),
    ("observation_cutoff", "2026-09-19T00:00:00Z"),
    ("generated_at", "2026-09-20T07:20:00"),
])
def test_bad_manifest_rejected(snapshot, field, value):
    edit(snapshot, "manifest.json", lambda m: m.update({field: value}))
    with pytest.raises(ValueError):
        validate_snapshot(snapshot)


@pytest.mark.parametrize("change", [
    lambda d: d.update(date="2026-09-19"),
    lambda d: d.update(hours=47),
    lambda d: d["frames"].pop(),
    lambda d: d["frames"][1].update(offset=1),
    lambda d: d["frames"][0].update(count=-1),
    lambda d: d["places"][0]["contributions"][0].update(fire=65535),
])
def test_bad_day_rejected(snapshot, change):
    edit(snapshot, f"{DATE}.json", change)
    with pytest.raises(ValueError):
        validate_snapshot(snapshot)


def test_truncated_particles_rejected(snapshot):
    path = snapshot / f"{DATE}.particles.bin.gz"
    path.write_bytes(gzip.compress(gzip.decompress(path.read_bytes())[:-8]))
    with pytest.raises(ValueError, match="length"):
        validate_snapshot(snapshot)


def test_particle_from_unknown_fire_rejected(snapshot):
    path = snapshot / f"{DATE}.particles.bin.gz"
    raw = bytearray(gzip.decompress(path.read_bytes()))
    struct.pack_into("<H", raw, 4, 65535)
    path.write_bytes(gzip.compress(raw))
    with pytest.raises(ValueError, match="fire reference"):
        validate_snapshot(snapshot)


def test_missing_limits_rejected(snapshot):
    (snapshot / "limits.json").unlink()
    with pytest.raises(FileNotFoundError):
        validate_snapshot(snapshot)


def test_zero_detections_is_valid(snapshot):
    edit(snapshot, f"{DATE}.json", lambda d: d.update(
        fires=[], places=[], counts={"p1": 0, "p2": 0, "p3": 0},
        frames=[{"offset": 0, "count": 0} for _ in range(48)]))
    (snapshot / f"{DATE}.particles.bin.gz").write_bytes(gzip.compress(b""))
    assert validate_snapshot(snapshot) == ID
