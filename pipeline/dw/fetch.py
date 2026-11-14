"""Downloads and loaders: fires, winds and rain, boundaries.
usage: python -m dw.fetch      (fetches static files and the wind grids for every year in MET_RANGE)"""
import json
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from dw import config

MET_VARS = ["wind_speed_10m", "wind_direction_10m", "wind_speed_925hPa", "wind_direction_925hPa",
            "precipitation", "relative_humidity_2m"]
REQUIRED = MET_VARS[:5]                 # winds and rain must be complete; RH is only used by the persistence model

GB = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IDN"
STATIC = {
    "adm1.geojson": f"{GB}/ADM1/geoBoundaries-IDN-ADM1_simplified.geojson",
    "adm2.geojson": f"{GB}/ADM2/geoBoundaries-IDN-ADM2_simplified.geojson",
    "viirs-snpp_2025_Malaysia.csv": "https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/2025/viirs-snpp_2025_Malaysia.csv",
}
UA = {"User-Agent": "downwind-pipeline/0.1"}


def _fire_files(year: int) -> list[Path]:
    if year == 2019:                    # copied from validation-2019-comparison/data (persistence model training only)
        return [config.DATA / "viirs-snpp_2019_Indonesia.csv", config.DATA / "viirs-snpp_2019_Malaysia.csv"]
    if year == 2023:
        return [config.REPLAY_DATA / "viirs-snpp_2023_Indonesia.csv", config.REPLAY_DATA / "viirs-snpp_2023_Malaysia.csv"]
    if year == 2025:
        return [config.REPLAY_DATA / "viirs-snpp_2025_Indonesia.csv", config.DATA / "viirs-snpp_2025_Malaysia.csv"]
    if year == 2026:
        return [config.CHECK_DATA / "fires_2026_VIIRS_SNPP_NRT.csv"]
    raise ValueError(f"no fire files for {year}")


def load_fires(year: int) -> pd.DataFrame:
    """VIIRS S-NPP detections in BOX: lat, lon, date (UTC acquisition date), frp, conf. Low confidence is kept."""
    frames = []
    for p in _fire_files(year):
        if not p.exists():
            raise FileNotFoundError(f"{p} missing; see the pipeline setup in README.md for archive inputs")
        frames.append(_read_fire_csv(p))
    f = pd.concat(frames, ignore_index=True)
    return _fire_detections(f)


def load_fires_csv(path: Path, *, include_daynight: bool = False) -> pd.DataFrame:
    """Read a downloaded FIRMS CSV into the ranking pipeline's detection format."""
    raw = _read_fire_csv(path)
    raw["confidence"] = raw.confidence.replace({"low": "l", "nominal": "n", "high": "h"})
    if include_daynight and ("daynight" not in raw or not raw.daynight.isin(["D", "N"]).all()):
        raise ValueError(f"{path}: persistence weighting requires D/N daynight values")
    return _fire_detections(raw, include_daynight=include_daynight)


def _read_fire_csv(path: Path) -> pd.DataFrame:
    fires = pd.read_csv(path, encoding="utf-8-sig")
    required = {"latitude", "longitude", "acq_date", "frp", "confidence"}
    missing = required.difference(fires.columns)
    if missing:
        raise ValueError(f"{path}: missing FIRMS columns: {', '.join(sorted(missing))}")
    if "type" in fires.columns:                     # archive files: vegetation fires only
        fires = fires[fires["type"] == 0]
    return fires


def _fire_detections(f: pd.DataFrame, *, include_daynight: bool = False, sort: bool = True) -> pd.DataFrame:
    lon0, lat0, lon1, lat1 = config.BOX
    f = f[f.latitude.between(lat0, lat1) & f.longitude.between(lon0, lon1)]
    out = pd.DataFrame({
        "lat": f.latitude.to_numpy(float),
        "lon": f.longitude.to_numpy(float),
        "date": pd.to_datetime(f.acq_date).to_numpy(),
        "frp": f.frp.to_numpy(float),
        "conf": f.confidence.astype(str).to_numpy(),
    })
    if include_daynight:
        out["daynight"] = f.daynight.astype(str).to_numpy()
    if sort:
        out = out.sort_values(["date", "lat", "lon"], kind="stable")
    return out.reset_index(drop=True)


@dataclass
class Met:
    lats: np.ndarray                    # 1 degree spacing, south to north
    lons: np.ndarray
    times: pd.DatetimeIndex             # hourly UTC
    u: dict                             # "925", "10m": (lat, lon, time), m/s, eastward
    v: dict                             # northward
    precip: np.ndarray                  # mm/h
    rh: np.ndarray | None               # %, None when the file has no RH


def _uv(speed, direction):
    """Meteorological direction (where the wind comes from) to u, v."""
    rad = np.radians(direction)
    return -speed * np.sin(rad), -speed * np.cos(rad)


def _get_json(url: str, timeout: int = 300):
    for k in range(6):
        try:
            req = urllib.request.Request(url, headers=UA)
            return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8"))
        except Exception as e:                      # network or HTTP error: back off and retry
            print("retry", k, type(e).__name__, flush=True)
            time.sleep(20 * (k + 1))
    raise RuntimeError(f"request failed after 6 attempts: {url[:80]}")


def fetch_met(year: int) -> Path:
    """Open-Meteo historical-forecast hourly fields on a 1 degree grid over BOX, saved as DATA/met_<year>.npz."""
    out_path = config.DATA / f"met_{year}.npz"
    if out_path.exists():
        return out_path
    start, end = config.MET_RANGE[year]
    lon0, lat0, lon1, lat1 = config.BOX
    lats = np.arange(lat0, lat1 + 0.01, 1.0)
    lons = np.arange(lon0, lon1 + 0.01, 1.0)
    la, lo = np.meshgrid(lats, lons, indexing="ij")
    pts = list(zip(la.ravel(), lo.ravel()))
    cols = {v: [] for v in MET_VARS}
    times = None
    for c in range(0, len(pts), 60):
        chunk = pts[c:c + 60]
        url = ("https://historical-forecast-api.open-meteo.com/v1/forecast?latitude="
               + ",".join(f"{a:.1f}" for a, _ in chunk)
               + "&longitude=" + ",".join(f"{b:.1f}" for _, b in chunk)
               + "&hourly=" + ",".join(MET_VARS)
               + f"&wind_speed_unit=ms&start_date={start}&end_date={end}")
        raw = _get_json(url)
        raw = raw if isinstance(raw, list) else [raw]
        times = raw[0]["hourly"]["time"]
        for r in raw:
            for v in MET_VARS:
                cols[v].append([np.nan if x is None else x for x in r["hourly"][v]])
        print(f"{year} chunk {c // 60 + 1}/{(len(pts) + 59) // 60}", flush=True)
        time.sleep(3)
    arr = {v: np.array(cols[v], float).reshape(len(lats), len(lons), -1) for v in MET_VARS}
    config.DATA.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_path, lats=lats, lons=lons, times=np.array(times), **arr)
    return out_path


# ---- the forecast a task force actually had (replay window only). The historical-forecast API above stitches the
# first hours of every model run, so it is close to what happened, not what was forecast that morning.

SINGLE_RUNS = "https://single-runs-api.open-meteo.com/v1/forecast"
FORECAST_MODEL = "ecmwf_ifs025"
FORECAST_TIMEOUT = 60                  # healthy chunks answer in 1 to 4 s; a hung one should fail fast and retry, not wait 300 s
FORECAST_HOURS = 64                     # 12 UTC on T-1 to 03 UTC on T+2: covers the 48 h window from T 00 UTC


def forecast_run(day) -> pd.Timestamp:
    """The latest ECMWF run in hand at a 07:00 local (00 UTC) meeting on `day`: 12 UTC the day before. Runs are
    published about 7 hours after they start, so the 00 UTC run of `day` is not out yet."""
    return pd.Timestamp(day).normalize() - pd.Timedelta(hours=12)


def fetch_forecast(day, step: int = 1) -> Path:
    """Winds and rain from the forecast_run(day) ECMWF IFS 0.25 degree run, on fetch_met's 1 degree grid, or every
    `step`-th point of it (the free API counts each point as a call; forecast_check uses step 2)."""
    run = forecast_run(day)
    out_path = config.forecast_cache() / (f"forecast_{run:%Y%m%dT%H}.npz" if step == 1
                                         else f"forecast_{run:%Y%m%dT%H}_{step}deg.npz")
    if out_path.exists():
        return out_path
    lon0, lat0, lon1, lat1 = config.BOX
    lats = np.arange(lat0, lat1 + 0.01, 1.0)[::step]
    lons = np.arange(lon0, lon1 + 0.01, 1.0)[::step]
    la, lo = np.meshgrid(lats, lons, indexing="ij")
    pts = list(zip(la.ravel(), lo.ravel()))
    cols = {v: [] for v in REQUIRED}
    times = None
    for c in range(0, len(pts), 60):
        chunk = pts[c:c + 60]
        url = (f"{SINGLE_RUNS}?latitude=" + ",".join(f"{a:.1f}" for a, _ in chunk)
               + "&longitude=" + ",".join(f"{b:.1f}" for _, b in chunk)
               + "&hourly=" + ",".join(REQUIRED)
               + f"&models={FORECAST_MODEL}&run={run:%Y-%m-%dT%H:%M}&forecast_hours={FORECAST_HOURS}&wind_speed_unit=ms")
        raw = _get_json(url, timeout=FORECAST_TIMEOUT)
        raw = raw if isinstance(raw, list) else [raw]
        times = raw[0]["hourly"]["time"]
        for r in raw:
            for v in REQUIRED:
                cols[v].append([np.nan if x is None else x for x in r["hourly"][v]])
        print(f"forecast {run:%Y-%m-%d %H} UTC chunk {c // 60 + 1}/{(len(pts) + 59) // 60}", flush=True)
        time.sleep(3)
    arr = {v: np.array(cols[v], float).reshape(len(lats), len(lons), -1) for v in REQUIRED}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_path, lats=lats, lons=lons, times=np.array(times), **arr)
    return out_path


def load_forecast(day) -> Met:
    """Load the 48-hour simulation window directly from the morning's forecast."""
    with np.load(fetch_forecast(day)) as raw:
        return _forecast_window(day, raw)


def load_persistence_weather(path: Path) -> Met:
    """Read precipitation and relative humidity on a regular hourly weather grid."""
    with np.load(path) as raw:
        times = pd.to_datetime(raw["times"], utc=True).tz_localize(None)
        return Met(raw["lats"], raw["lons"], times, {}, {},
                   raw["precipitation"], raw["relative_humidity_2m"])


def _forecast_window(day, raw) -> Met:
    t0 = pd.Timestamp(day).normalize()
    want = pd.date_range(t0, periods=config.WINDOW_H + 1, freq="h")
    ft = pd.to_datetime(raw["times"])
    pos = {t: i for i, t in enumerate(ft)}
    if any(t not in pos for t in want):
        raise ValueError(f"forecast run {forecast_run(day)} does not cover {want[0]} to {want[-1]}")
    fi = [pos[t] for t in want]
    g = {v: np.asarray(raw[v], float)[:, :, fi] for v in REQUIRED}
    bad = [v for v, a in g.items() if np.isnan(a).any()]
    if bad:
        raise ValueError(f"forecast has missing values in the window: {', '.join(bad)}")
    u925, v925 = _uv(g["wind_speed_925hPa"], g["wind_direction_925hPa"])
    u10, v10 = _uv(g["wind_speed_10m"], g["wind_direction_10m"])
    return Met(lats=raw["lats"], lons=raw["lons"], times=want,
               u={"925": u925, "10m": u10}, v={"925": v925, "10m": v10},
               precip=g["precipitation"], rh=None)


def with_forecast(met: Met, day, raw=None) -> Met:
    """Replace the morning's simulation window in the historical weather grid."""
    forecast = load_forecast(day) if raw is None else _forecast_window(day, raw)
    mi = [met.times.get_loc(t) for t in forecast.times]
    out = Met(lats=met.lats, lons=met.lons, times=met.times,
              u={k: a.copy() for k, a in met.u.items()}, v={k: a.copy() for k, a in met.v.items()},
              precip=met.precip.copy(), rh=met.rh)
    for level in forecast.u:
        out.u[level][:, :, mi] = forecast.u[level]
        out.v[level][:, :, mi] = forecast.v[level]
    out.precip[:, :, mi] = forecast.precip
    return out


def _met_file(year: int) -> Path:
    p = config.DATA / f"met_{year}.npz"
    if not p.exists() and year == 2023:
        p = config.REPLAY_DATA / "met_grid.npz"
    if not p.exists():
        raise FileNotFoundError(f"{p} missing; run python -m dw.fetch first")
    return p


def null_fractions(year: int) -> dict:
    raw = np.load(_met_file(year))
    return {v: float(np.isnan(raw[v]).mean()) for v in MET_VARS if v in raw.files}


def load_met(year: int, require_winds: bool = True) -> Met:
    """Hourly winds, rain and RH. Fails loudly if any wind or rain field is more than 1% null.
    require_winds=False checks rain only (2019 has no 925 hPa winds; the persistence model uses rain and RH)."""
    raw = np.load(_met_file(year))
    bad = {v: float(np.isnan(raw[v]).mean()) for v in (REQUIRED if require_winds else ["precipitation"])}
    bad = {v: f for v, f in bad.items() if f > 0.01}
    if bad:
        raise ValueError("winds missing: " + ", ".join(f"{v} {f:.1%} null" for v, f in bad.items()))
    g = {v: np.nan_to_num(raw[v], nan=0.0) for v in REQUIRED}
    u925, v925 = _uv(g["wind_speed_925hPa"], g["wind_direction_925hPa"])
    u10, v10 = _uv(g["wind_speed_10m"], g["wind_direction_10m"])
    rh = np.nan_to_num(raw["relative_humidity_2m"], nan=0.0) if "relative_humidity_2m" in raw.files else None
    return Met(lats=raw["lats"], lons=raw["lons"], times=pd.to_datetime(raw["times"]),
               u={"925": u925, "10m": u10}, v={"925": v925, "10m": v10},
               precip=g["precipitation"], rh=rh)


def fetch_static() -> None:
    config.DATA.mkdir(parents=True, exist_ok=True)
    for name, url in STATIC.items():
        p = config.DATA / name
        if p.exists():
            continue
        req = urllib.request.Request(url, headers=UA)
        p.write_bytes(urllib.request.urlopen(req, timeout=300).read())
        print(f"downloaded {name}: {p.stat().st_size / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    fetch_static()
    for y in config.MET_RANGE:
        fetch_met(y)
    for y in config.MET_RANGE:
        print(y, {v: round(f, 4) for v, f in null_fractions(y).items()})
