"""Simulation settings, data locations and the secret reader."""
import os
from pathlib import Path

BOX = (95.0, -8.0, 120.0, 6.0)          # lon min, lat min, lon max, lat max
FIRE_CELL = 0.015                       # a fire is a 0.015 degree square; kept after Task 4: T=2026-09-20 seed overlap 9/10 (bar 8), 10 m vs 925 hPa 7/10
GRID_RES = 0.05                         # population and regency grids
R_KM = 40.0                             # smoke score radius
SIGMA = 1.5                             # random spread, m/s
RAIN_K = 0.3                            # rain removal exp(-RAIN_K * mm/h)
LIFE_H = 48                             # particle lifetime
RELEASE_H = 24                          # hours of release on day T
WINDOW_H = 48                           # exposure window from T 00:00 UTC
K = 4.0                                 # particles per source per hour (pre-build check 12 Nov: seed overlap 9, 9, 9 of 10 at k=4; Task 4 on T=2026-09-20: 9)
SEED = 0
PEAT_RATIO = 5.87 / 0.96                # smoke per unit of fire heat, peat vs tropical forest: GFAS conversion factors,
                                        # Kaiser et al. 2012 Table 2 (adopted 13 Nov; 2023 test barely moves, see evaluate)
HOURLY_REF = 114.0                      # reference level for the hourly smoke chart (100 = this): the highest per-resident
                                        # hourly value any place had on the replay days 18 to 20 Sep 2026 (113.554, forecast
                                        # weather, shipped persistence weighting; python -m dw.hourly_ref). The 99th percentile
                                        # (24.1) was rejected: trace places dominate it, so busy places peaked at 350 to 470.
LOCAL_OFFSET_H = 7                      # local day = UTC+7
PROVINCE = "West Kalimantan"

ROOT = Path(__file__).resolve().parents[2]


def _directory(variable: str, default: Path) -> Path:
    return Path(os.environ.get(variable) or default).expanduser().resolve()


DATA = _directory("DOWNWIND_DATA_DIR", ROOT / "data")
REPLAY_DATA = _directory("DOWNWIND_REPLAY_DATA_DIR", ROOT.parent / "validation-2023-replay" / "data")
CHECK_DATA = _directory("DOWNWIND_CHECK_DATA_DIR", ROOT.parent / "data-check" / "data")
MODEL_DIR = _directory("DOWNWIND_MODEL_DIR", ROOT / "pipeline" / "model")     # committed model for live runs


def forecast_cache() -> Path:
    return _directory("DOWNWIND_FORECAST_CACHE_DIR", DATA)

MET_RANGE = {
    2023: ("2023-08-31", "2023-11-03"),
    2025: ("2025-07-31", "2025-11-03"),
    2026: ("2026-08-31", "2026-11-03"),
}

def secret(name: str) -> str:
    """Read a key from the environment or an explicitly configured secrets file."""
    value = os.environ.get(name, "").strip()
    if value:
        return value
    secrets_file = os.environ.get("DOWNWIND_SECRETS_FILE")
    if not secrets_file:
        raise KeyError(f"{name} is missing from the environment")
    try:
        text = Path(secrets_file).expanduser().read_text(encoding="utf-8-sig")
    except OSError:
        raise KeyError(f"secrets file not readable, needed for {name}") from None
    for line in text.splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() == name and value.strip():
            return value.strip()
    raise KeyError(f"{name} is missing or empty in the secrets file")
