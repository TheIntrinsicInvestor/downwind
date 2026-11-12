"""Constants, paths and the secret reader. Simulation settings come from the 2023 replay; do not tune."""
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
LOCAL_OFFSET_H = 7                      # local day = UTC+7
PROVINCE = "West Kalimantan"

ROOT = Path(__file__).resolve().parents[3]     # the COP31 project folder
DATA = ROOT / "downwind" / "data"
REPLAY_DATA = ROOT / "validation-2023-replay" / "data"
CHECK_DATA = ROOT / "data-check" / "data"

MET_RANGE = {
    2023: ("2023-08-31", "2023-11-03"),
    2025: ("2025-07-31", "2025-11-03"),
    2026: ("2026-08-31", "2026-11-03"),
}

SECRETS_FILE = Path(r"C:\Users\Brian\.secrets\downwind.env")


def secret(name: str) -> str:
    """Value of `name` from the secrets file. Errors name the variable only, never a value."""
    try:
        text = SECRETS_FILE.read_text(encoding="utf-8-sig")
    except OSError:
        raise KeyError(f"secrets file not readable, needed for {name}") from None
    for line in text.splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() == name and value.strip():
            return value.strip()
    raise KeyError(f"{name} is missing or empty in the secrets file")
