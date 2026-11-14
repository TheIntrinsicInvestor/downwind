"""Check a complete morning snapshot before publishing it."""
import argparse
import gzip
import json
import re
import struct
from datetime import date, datetime, timedelta
from pathlib import Path


def _check(condition, message):
    if not condition:
        raise ValueError(message)


def validate_snapshot(root: Path) -> str:
    """Return the snapshot ID, or fail before any publication is attempted."""
    def read(name):
        return json.loads((root / name).read_text(encoding="utf-8"))

    manifest = read("manifest.json")
    name = manifest["date"]
    day_date = date.fromisoformat(name)
    snapshot_id = manifest["id"]
    _check(re.fullmatch(re.escape(name) + r"-[a-f0-9]{32}", snapshot_id), "Invalid snapshot ID")
    _check(manifest["source"] == "VIIRS_NOAA21_NRT", "Invalid detection source")
    for field in ("generated_at", "observation_cutoff", "forecast_run"):
        stamp = datetime.fromisoformat(manifest[field].replace("Z", "+00:00"))
        _check(stamp.utcoffset() == timedelta(0), f"{field} must be UTC")
    _check(manifest["observation_cutoff"] == f"{name}T00:00:00Z", "Invalid observation cutoff")
    expected_run = f"{day_date - timedelta(days=1)}T12:00:00Z"
    _check(manifest["forecast_run"] == expected_run, "Invalid morning forecast run")

    day = read(f"{name}.json")
    _check(day["date"] == name and day["fires_date"] == str(day_date - timedelta(days=1)),
           "Snapshot dates do not match")
    _check(day["window_start_utc"] == f"{name}T00:00Z" and day["hours"] == 48,
           "Invalid forecast window")
    fires, places, frames = day["fires"], day["places"], day["frames"]
    _check(isinstance(fires, list) and isinstance(places, list) and len(frames) == 48,
           "Invalid snapshot collections")
    _check(len({f["id"] for f in fires}) == len(fires), "Duplicate fire IDs")
    for place in places:
        for contribution in place["contributions"]:
            index = contribution["fire"]
            _check(type(index) is int and 0 <= index < len(fires), "Invalid place fire reference")

    binary = gzip.decompress((root / f"{name}.particles.bin.gz").read_bytes())
    offset = 0
    for frame in frames:
        count = frame["count"]
        _check(type(count) is int and 0 <= count <= 12_000 and
               type(frame["offset"]) is int and frame["offset"] == offset,
               "Invalid particle frame")
        offset += count * 8
    _check(offset == len(binary), "Particle length does not match frame metadata")
    for _, _, fire, _, _ in struct.iter_unpack("<hhHBB", binary):
        _check(fire < len(fires), "Invalid particle fire reference")
    limits = read("limits.json")
    _check(isinstance(limits["ignores"], list) and isinstance(limits["not_claimed"], list),
           "Invalid limits")
    return snapshot_id


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    print(f"Validated {validate_snapshot(args.snapshot)}")


if __name__ == "__main__":
    main()
