"""Replay files: the one interface between the pipeline and the web app (format in the plan, Task 5).
<date>.json, <date>.particles.bin.gz, index.json, limits.json."""
import gzip
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from dw.rank import FRAME_CAP, DayResult

REC = np.dtype([("lon_q", "<i2"), ("lat_q", "<i2"), ("fire", "<u2"), ("alpha", "u1"), ("pad", "u1")])
PLACE_TOP = 15

IGNORES = [
    "Fuel load and how deep the peat is burning",
    "Smoke rising above the surface layer",
    "Fires hidden under cloud or thick smoke",
    "People outside Indonesia (not counted)",
    "Whether a fire is still burning tomorrow (assumed yes)",
    "The official rule's visible-smoke input (not computable)",
]
NOT_CLAIMED = [
    "An accurate forecast of haze",
    "Any smoke concentration",
    "Any skill for Singapore or Kuala Lumpur",
    "That the simulation clearly beats counting nearby fires (0.45 against 0.38, not statistically solid)",
]


def _num(x, nd=None):
    """float or None; never NaN."""
    if x is None:
        return None
    x = float(x)
    if math.isnan(x) or math.isinf(x):
        return None
    return round(x, nd) if nd is not None else x


def _int(x):
    v = _num(x)
    return None if v is None else int(round(v))


def _write_json(obj, path: Path):
    path.write_text(json.dumps(obj, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")


def _top10_ids(res: DayResult) -> list:
    sq = res.squares
    if not len(sq) or "rank" not in sq:
        return []
    return list(sq.sort_values("rank").id[sq["rank"] <= 10])


def _fires(sq: pd.DataFrame) -> list:
    out = []
    for r in sq.itertuples(index=False):
        ranked = not pd.isna(r.rank)
        tp = r.top_places if isinstance(r.top_places, list) else None
        out.append({
            "id": r.id, "lat": round(float(r.lat), 5), "lon": round(float(r.lon), 5), "tier": int(r.tier),
            "in_province": bool(r.in_province), "frp": round(float(r.frp), 1), "n_detect": int(r.n_detect),
            "place": r.place if isinstance(r.place, str) else None,
            "rank": int(r.rank) if ranked else None,
            "share": _num(r.share, 5) if ranked else None,
            "people_40km": _int(r.people_40km),
            "top_places": [{"name": n, "share": round(float(s), 4)} for n, s in tp] if tp else None,
            "first_arrival_h": _num(r.first_arrival_h),
            "heading": r.heading if isinstance(r.heading, str) else None,
            "reach_km": _num(getattr(r, "reach_km", None), 1),
            "persist_p": _num(getattr(r, "persist_p", None), 3),
        })
    return out


def _places(res: DayResult, index_of: dict) -> list:
    pf = res.place_fire
    if pf is None or not len(pf):
        return []
    out = []
    for name, g in pf.groupby("place", sort=True):
        tot = g.exposure.sum()
        if tot <= 0:
            continue
        g = g.sort_values(["exposure", "fire_id"], ascending=[False, True]).head(PLACE_TOP)
        out.append({"name": name, "contributions": [
            {"fire": index_of[f], "share": round(float(e / tot), 4), "first_arrival_h": _num(h)}
            for f, e, h in zip(g.fire_id, g.exposure, g.first_arrival_h)]})
    # biggest smoke burden first, so the default city is the most affected
    burden = pf.groupby("place").exposure.sum()
    out.sort(key=lambda p: (-burden[p["name"]], p["name"]))
    return out


def _frames(res: DayResult):
    frames = res.frames or [(np.empty(0), np.empty(0), np.empty(0), np.empty(0, int))] * 48
    allw = np.concatenate([f[2][:FRAME_CAP] for f in frames]) if frames else np.empty(0)
    w95 = float(np.percentile(allw, 95)) if len(allw) else 1.0
    w95 = w95 if w95 > 0 else 1.0
    chunks, meta, offset = [], [], 0
    for la, lo, w, src in frames:
        la, lo, w, src = la[:FRAME_CAP], lo[:FRAME_CAP], w[:FRAME_CAP], src[:FRAME_CAP]
        rec = np.zeros(len(la), dtype=REC)
        rec["lon_q"] = np.clip(np.round((lo - 95.0) / 25.0 * 65535 - 32768), -32768, 32767)
        rec["lat_q"] = np.clip(np.round((la + 8.0) / 14.0 * 65535 - 32768), -32768, 32767)
        rec["fire"] = np.asarray(src, int)
        rec["alpha"] = np.round(255 * np.minimum(1.0, w / w95))
        chunks.append(rec.tobytes())
        meta.append({"offset": offset, "count": len(rec)})
        offset += rec.nbytes
    return b"".join(chunks), meta


def export_day(res: DayResult, prev: DayResult | None, stab: dict, bulletin: dict, out: Path) -> None:
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    date = res.date.strftime("%Y-%m-%d")
    sq = res.squares
    fires = _fires(sq) if len(sq) else []
    index_of = {f["id"]: i for i, f in enumerate(fires)}
    changes = None
    if prev is not None:
        now, before = _top10_ids(res), set(_top10_ids(prev))
        changes = {"new_in_top10": [index_of[i] for i in now if i not in before],
                   "left_top10": len(before - set(now))}
    binary, frames = _frames(res)
    day = {
        "date": date,
        "fires_date": (res.date - pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
        "window_start_utc": f"{date}T00:00Z",
        "hours": 48,
        "counts": {k: int(res.counts.get(k, 0)) for k in ("p1", "p2", "p3")},
        "top10_share": round(float(res.top10_share), 4),
        "fires": fires,
        "places": _places(res, index_of),
        "stability": stab,
        "changes": changes,
        "bulletin": bulletin,
        "frames": frames,
    }
    _write_json(day, out / f"{date}.json")
    (out / f"{date}.particles.bin.gz").write_bytes(gzip.compress(binary, compresslevel=9, mtime=0))


def write_index(days: list, default: str, out: Path) -> None:
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    _write_json({"days": list(days), "default": default}, out / "index.json")


def write_limits(learn: dict | None, out: Path) -> None:
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    _write_json({
        "replay2023": {"pooled": 0.45, "pontianak": 0.80, "worst_quartile_hit": 0.50, "chance": 0.25,
                       "airports": 7, "days": 421},
        "learn": learn,
        "ignores": IGNORES,
        "not_claimed": NOT_CLAIMED,
    }, out / "limits.json")
