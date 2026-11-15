#!/usr/bin/env python3
"""Build population vector PMTiles with the same verified source as the raster.

Use the Python, pip, setuptools and wheel pins in build_population_tiles.py:
    .venv-population/bin/python -m pip install --no-build-isolation -r scripts/population-points-requirements.txt
    .venv-population/bin/python scripts/build_population_points.py
"""
import argparse
import gzip
import math
from pathlib import Path
from tempfile import TemporaryDirectory

import mapbox_vector_tile
import numpy as np
import rasterio
from pmtiles.reader import MmapSource, Reader, all_tiles
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from rasterio.windows import Window

from build_population_tiles import ATTRIBUTION, BOUNDS, MAX_ZOOM, MIN_ZOOM, SOURCE, download

GRID = 12  # 12 × 3 arc seconds, approximately 1 km at the equator.
EXTENT = 4096
CLUSTERS_PER_TILE = 64
LAYER = "population"


def population_grid(source):
    if (source.crs is None or source.crs.to_epsg() != 4326 or source.count != 1
            or not np.allclose(source.res, (1 / 1200, 1 / 1200), rtol=1e-6, atol=0)):
        raise ValueError("Expected the single-band WGS 84 WorldPop raster at 3 arc seconds")
    west, south, east, north = BOUNDS
    inverse = ~source.transform
    left, top = inverse * (west, north)
    right, bottom = inverse * (east, south)
    x0, y0 = max(0, math.ceil(left - 0.5)), max(0, math.ceil(top - 0.5))
    x1, y1 = min(source.width, math.ceil(right - 0.5)), min(source.height, math.ceil(bottom - 0.5))
    columns = np.arange(x0, x1, GRID)
    rows, cols, weights = [], [], []
    source_total = discarded = 0.0
    for row in range(y0, y1, GRID * 32):
        height = min(y1 - row, GRID * 32)
        data = source.read(1, window=Window(x0, row, x1 - x0, height))
        data[~np.isfinite(data) | (data <= 0) | (data == source.nodata)] = 0
        row_starts = np.arange(0, height, GRID)
        sums = np.add.reduceat(np.add.reduceat(data, row_starts, axis=0, dtype=np.float64),
                               columns - x0, axis=1)
        source_total += sums.sum()
        discarded += sums[sums < 1].sum()
        r, c = np.nonzero(sums >= 1)
        rows.append(row + (row_starts[r] + np.minimum(row_starts[r] + GRID, height)) / 2)
        cols.append((columns[c] + np.minimum(columns[c] + GRID, x1)) / 2)
        weights.append(sums[r, c])
    lon, lat = source.transform * (np.concatenate(cols), np.concatenate(rows))
    values = np.concatenate(weights)
    rounded = np.floor(values).astype(np.int64)
    # Allocate remaining units to the largest fractional parts so rounding preserves the retained total.
    remainder = round(values.sum()) - int(rounded.sum())
    rounded[np.argsort(-(values - rounded), kind="stable")[:remainder]] += 1
    x = (lon + 180) / 360
    y = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2
    return x, y, rounded, float(source_total), float(discarded)


def clusters(x, y, pop, zoom):
    if zoom == MAX_ZOOM:
        return x, y, pop
    grid = (1 << zoom) * CLUSTERS_PER_TILE
    key = (y * grid).astype(np.int64) * grid + (x * grid).astype(np.int64)
    order = np.argsort(key, kind="stable")
    starts = np.r_[0, np.flatnonzero(np.diff(key[order])) + 1]
    totals = np.add.reduceat(pop[order], starts)
    return (np.add.reduceat((x * pop)[order], starts) / totals,
            np.add.reduceat((y * pop)[order], starts) / totals, totals)


def write_zoom(writer, x, y, pop, zoom):
    width = 1 << zoom
    x, y = x * width, y * width
    tx, ty = x.astype(int), y.astype(int)
    key = ty * width + tx
    order = np.argsort(key, kind="stable")
    edges = np.r_[0, np.flatnonzero(np.diff(key[order])) + 1, len(order)]
    for start, end in zip(edges[:-1], edges[1:]):
        indexes = order[start:end]
        i = indexes[0]
        features = []
        for j in indexes:
            px = min(EXTENT - 1, round((x[j] - tx[i]) * EXTENT))
            py = min(EXTENT - 1, round((y[j] - ty[i]) * EXTENT))
            features.append({"geometry": {"type": "Point", "coordinates": [px, py]},
                             "properties": {"pop": int(pop[j])}})
        encoded = mapbox_vector_tile.encode({"name": LAYER, "features": features},
                                            default_options={"y_coord_down": True, "extents": EXTENT})
        writer.write_tile(zxy_to_tileid(zoom, int(tx[i]), int(ty[i])), gzip.compress(encoded, mtime=0))


def verify_archive(path, expected):
    totals = dict.fromkeys(range(MIN_ZOOM, MAX_ZOOM + 1), 0)
    with path.open("rb") as stream:
        source = MmapSource(stream)
        header = Reader(source).header()
        if header["min_zoom"] != MIN_ZOOM or header["max_zoom"] != MAX_ZOOM:
            raise ValueError("Archive zoom range differs from the requested range")
        for (zoom, _, _), data in all_tiles(source):
            features = mapbox_vector_tile.decode(gzip.decompress(data))[LAYER]["features"]
            totals[zoom] += sum(feature["properties"]["pop"] for feature in features)
    for zoom, total in totals.items():
        print(f"z{zoom}: {total:,}", flush=True)
        if total != expected:
            raise ValueError(f"z{zoom} population {total} differs from retained source total {expected}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("data/population"))
    parser.add_argument("--out", type=Path, default=Path("web/public/population/points.pmtiles"))
    args = parser.parse_args()
    with rasterio.open(download(args.cache)) as source:
        x, y, pop, total, discarded = population_grid(source)
    print(f"Clipped raster: {total:,.2f}. Below 1 person per cell: {discarded:,.2f}. "
          f"Rounded retained total: {pop.sum():,}.", flush=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.out.parent) as scratch:
        path = Path(scratch) / args.out.name
        with path.open("wb") as stream:
            writer = Writer(stream)
            for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):
                write_zoom(writer, *clusters(x, y, pop, zoom), zoom)
            writer.finalize({"tile_type": TileType.MVT, "tile_compression": Compression.GZIP,
                             **{f"{key}_e7": value * 10**7 for key, value in zip(
                                 ("min_lon", "min_lat", "max_lon", "max_lat"), BOUNDS)}},
                            {"name": "WorldPop 2026 residential population", "attribution": ATTRIBUTION,
                             "source": SOURCE, "vector_layers": [{"id": LAYER, "fields": {"pop": "Number"},
                                                                  "minzoom": MIN_ZOOM, "maxzoom": MAX_ZOOM}]})
        verify_archive(path, int(pop.sum()))
        path.replace(args.out)
    print(f"{args.out}: {args.out.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
