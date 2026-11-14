"""Build a morning snapshot from the public NOAA-21 FIRMS feed."""
import argparse
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import Request, urlopen
from uuid import uuid4

import numpy as np
import pandas as pd
from PIL import Image

from dw import config
from dw.build import build_snapshots
from dw.export import _write_json
from dw.fetch import STATIC, UA, forecast_run
from dw.grids import build_grids

FIRMS = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/viirs-j2-noaa21/csv/J2_VIIRS_C2_SouthEast_Asia_7d.csv"
POPULATION = ("https://data.worldpop.org/GIS/Population/Global_2000_2020_1km_UNadj/2020/IDN/"
              "idn_ppp_2020_1km_Aggregated_UNadj.tif")
PEAT = "https://tiles.globalforestwatch.org/gfw_peatlands/v20230315/dynamic"


def download(url: str) -> bytes:
    with urlopen(Request(url, headers=UA), timeout=45) as response:
        return response.read()


def cache_file(path: Path, url: str) -> None:
    if not path.exists():
        with NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
            temporary_path = Path(temporary.name)
        try:
            temporary_path.write_bytes(download(url))
            temporary_path.replace(path)
        finally:
            temporary_path.unlink(missing_ok=True)


def build_peat(path: Path) -> None:
    z = 7
    n = 2 ** z
    west, south, east, north = config.BOX

    def tile_x(lon):
        return math.floor((lon + 180) / 360 * n)

    def tile_y(lat):
        return math.floor((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)

    x0, y0 = tile_x(west), tile_y(north)
    tiles = [(x, y) for x in range(x0, tile_x(east) + 1) for y in range(y0, tile_y(south) + 1)]
    alpha = np.zeros(((tile_y(south) - y0 + 1) * 256, (tile_x(east) - x0 + 1) * 256), dtype=np.uint8)

    def tile(coordinates):
        x, y = coordinates
        with Image.open(BytesIO(download(f"{PEAT}/{z}/{x}/{y}.png"))) as image:
            return x, y, np.asarray(image.convert("RGBA").getchannel("A"))

    with ThreadPoolExecutor(max_workers=6) as pool:
        for x, y, pixels in pool.map(tile, tiles):
            row, col = (y - y0) * 256, (x - x0) * 256
            alpha[row:row + 256, col:col + 256] = pixels
    np.savez_compressed(path, alpha=alpha, z=z, x0=x0, y0=y0)


def prepare_grids() -> None:
    config.DATA.mkdir(parents=True, exist_ok=True)
    if not all((config.DATA / name).is_file() for name in ("grids.npz", "adm2_names.json")):
        config.CHECK_DATA.mkdir(parents=True, exist_ok=True)
        cache_file(config.CHECK_DATA / "idn_pop_2020_1km.tif", POPULATION)
        for name in ("adm1.geojson", "adm2.geojson"):
            cache_file(config.DATA / name, STATIC[name])
        build_grids()
    peat = config.DATA / "peat_z7.npz"
    if not peat.exists() and not (config.REPLAY_DATA / peat.name).exists():
        build_peat(peat)


def build_live(day: pd.Timestamp, out: Path) -> None:
    with NamedTemporaryFile(suffix=".csv", delete=False) as fires:
        fires_path = Path(fires.name)
    try:
        fires_path.write_bytes(download(FIRMS))
        # The public regional download provides a freshness signal outside the
        # app's bounding box. An empty local day is still a valid snapshot.
        regional = pd.read_csv(fires_path, usecols=["acq_date", "satellite"])
        previous = (day - pd.Timedelta(days=1)).date().isoformat()
        if not ((regional.acq_date == previous) & (regional.satellite == "N21")).any():
            raise ValueError(f"FIRMS regional feed has no NOAA-21 observations for {previous} UTC")
        prepare_grids()
        build_snapshots(day, 1, fires_path, out, persistence_weather=None)
    finally:
        fires_path.unlink(missing_ok=True)

    name = day.date().isoformat()
    _write_json({
        "id": f"{name}-{uuid4().hex}",
        "date": name,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "observation_cutoff": f"{name}T00:00:00Z",
        "forecast_run": forecast_run(day).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "VIIRS_NOAA21_NRT",
    }, out / "manifest.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--day", type=datetime.fromisoformat, help="brief date in YYYY-MM-DD")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    today = datetime.now(timezone.utc).date()
    day = pd.Timestamp(args.day.date() if args.day else today)
    if day > pd.Timestamp(today):
        parser.error("--day must be today or earlier in UTC")
    build_live(day, args.out)


if __name__ == "__main__":
    main()
