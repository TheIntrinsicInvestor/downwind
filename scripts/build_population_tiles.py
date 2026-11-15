#!/usr/bin/env python3
"""Build Downwind's WorldPop raster PMTiles archive from the official GeoTIFF.

From the repository root, with CPython 3.11.18 and pip 25.2:
    python3.11 -m venv .venv-population
    .venv-population/bin/python -m pip install pip==25.2 setuptools==80.9.0 wheel==0.45.1
    .venv-population/bin/python -m pip install --no-build-isolation -r scripts/population-requirements.txt
    .venv-population/bin/python scripts/build_population_tiles.py
"""
import argparse
import hashlib
import io
import math
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlopen

import numpy as np
import rasterio
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from rasterio.windows import Window

SOURCE = "https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2026/IDN/v1/100m/constrained/idn_pop_2026_CN_100m_R2025A_v1.tif"
SOURCE_SIZE = 169_761_231
SOURCE_SHA256 = "444f70196f96cc2ddd91480a0d12267104f85dd2a9d985a5077e8b9cc5dd9df7"
BOUNDS = (95, -8, 120, 6)  # Match MAP_BOUNDS and the simulation BOX.
ATTRIBUTION = "Population: WorldPop (2025), R2025A, CC BY 4.0"
MIN_ZOOM, MAX_ZOOM = 4, 11
TILE = 256
HALF_WORLD = math.pi * 6_378_137
BREAKS = (1, 5, 20, 50)
# Keep in sync with web/lib/population.ts. Palette index 0 is transparent.
COLORS = [(0, 0, 0), (36, 89, 117), (52, 126, 152), (68, 166, 181), (112, 206, 204), (198, 245, 222)]


def verify(path):
    with path.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    if path.stat().st_size != SOURCE_SIZE or checksum != SOURCE_SHA256:
        raise ValueError(f"Source size or SHA-256 differs from the pinned WorldPop GeoTIFF: {path}")


def download(cache):
    path = cache / SOURCE.rsplit("/", 1)[1]
    if path.exists():
        verify(path)
        return path
    cache.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=cache) as scratch:
        temporary = Path(scratch) / path.name
        with urlopen(SOURCE, timeout=120) as response, temporary.open("wb") as out:
            shutil.copyfileobj(response, out)
        verify(temporary)
        temporary.replace(path)
    return path


def mercator(lon, lat):
    return HALF_WORLD * lon / 180, HALF_WORLD * math.asinh(math.tan(math.radians(lat))) / math.pi


def encode(classes):
    image = Image.fromarray(classes).convert("P")
    image.putpalette([component for color in COLORS for component in color])
    out = io.BytesIO()
    image.save(out, format="PNG", transparency=0, bits=4)
    return out.getvalue()


def tiles(source, writer):
    west, south = mercator(*BOUNDS[:2])
    east, north = mercator(*BOUNDS[2:])
    empty = encode(np.zeros((TILE, TILE), dtype=np.uint8))
    for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):
        span = 2 * HALF_WORLD / (1 << zoom)
        pixel = span / TILE
        left = math.floor((west + HALF_WORLD) / span)
        right = math.ceil((east + HALF_WORLD) / span)
        top = math.floor((HALF_WORLD - north) / span)
        bottom = math.ceil((HALF_WORLD - south) / span)
        x0 = -HALF_WORLD + left * span
        y0 = HALF_WORLD - top * span
        resampling = rasterio.enums.Resampling.nearest if zoom == MAX_ZOOM else rasterio.enums.Resampling.average
        with WarpedVRT(source, crs="EPSG:3857", transform=from_origin(x0, y0, pixel, pixel),
                       width=(right - left) * TILE, height=(bottom - top) * TILE,
                       resampling=resampling, warp_mem_limit=64) as vrt:
            for y in range(top, bottom):
                row = (y - top) * TILE
                ys = y0 - (row + np.arange(TILE) + 0.5) * pixel
                for x in range(left, right):
                    col = (x - left) * TILE
                    xs = x0 + (col + np.arange(TILE) + 0.5) * pixel
                    data = vrt.read(1, window=Window(col, row, TILE, TILE))
                    populated = ((data > 0) & np.isfinite(data) &
                                 ((ys >= south) & (ys <= north))[:, None] &
                                 ((xs >= west) & (xs <= east))[None, :])
                    png = empty
                    if populated.any():
                        classes = np.zeros(data.shape, dtype=np.uint8)
                        classes[populated] = np.searchsorted(BREAKS, data[populated], side="right") + 1
                        png = encode(classes)
                    writer.write_tile(zxy_to_tileid(zoom, x, y), png)
        print(f"z{zoom}: {(right - left) * (bottom - top):,} tiles", flush=True)


def build(source_path, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(source_path) as source, TemporaryDirectory(dir=output.parent) as scratch:
        if (source.crs.to_epsg() != 4326 or source.count != 1 or source.nodata is None
                or not np.allclose(source.res, (1 / 1200, 1 / 1200), rtol=1e-6, atol=0)):
            raise ValueError("Expected a single-band WGS 84 GeoTIFF on a 3 arc-second grid with nodata")
        temporary = Path(scratch) / output.name
        with temporary.open("wb") as out:
            writer = Writer(out)
            tiles(source, writer)
            writer.finalize({
                "tile_type": TileType.PNG, "tile_compression": Compression.NONE,
                **{f"{key}_e7": value * 10**7 for key, value in zip(
                    ("min_lon", "min_lat", "max_lon", "max_lat"), BOUNDS)},
            }, {"name": "WorldPop 2026 population density", "attribution": ATTRIBUTION,
                "source": SOURCE, "licence": "CC BY 4.0"})
        temporary.replace(output)
    print(f"{output}: {output.stat().st_size:,} bytes")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("data/population"))
    parser.add_argument("--out", type=Path, default=Path("web/public/population/tiles.pmtiles"))
    args = parser.parse_args()
    build(download(args.cache), args.out)


if __name__ == "__main__":
    main()
