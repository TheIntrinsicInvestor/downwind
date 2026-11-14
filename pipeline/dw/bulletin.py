"""Crew bulletin: computed facts, an LLM that only phrases them, a check that every number in the text comes
from the facts, and a template fallback. The key is read from the secrets file and never printed."""
import json
import re
import time
from decimal import ROUND_HALF_UP, Decimal
import urllib.error
import urllib.request

import pandas as pd

from dw import config

BASE_URL = "https://api.tokenfactory.nebius.com/v1/"
BULLETIN_MODELS = ["deepseek-ai/DeepSeek-V4-Pro-0813", "MiniMaxAI/MiniMax-M3"]
SYSTEM_PROMPT = ("You write a morning briefing for a provincial fire task force in West Kalimantan. Use only the facts "
                 "given. Every number you write must appear in the facts exactly: write numbers as digits with no "
                 "rounding and no number words at all (no seven, million, half or twice), and put commas in numbers "
                 "of 1,000 or more (2,518,627). Call the people counted residents. "
                 "fires_that_left_top10_count counts fires, not places (do not explain this in the text). "
                 "What the facts mean: p1_count, p2_count "
                 "and p3_count are fires across West Kalimantan (no radius applies to them); share_pct and "
                 "top10_share_pct are shares of all the modelled smoke over residents from West Kalimantan fires "
                 "(not of an index or of activity); people_40km is the residents living within radius_km of that "
                 "fire's smoke path, so write 'N residents live within 40 km of its smoke path', never that the "
                 "fire affects or threatens them; first_arrival_h is the hours until its smoke reaches the place "
                 "listed first in its top_places, which is the place receiving the most of its smoke, not "
                 "necessarily the place reached earliest: name that one place with it and never call it the first "
                 "or earliest place reached (0 means its smoke is already over that place when the window opens); "
                 "heading is the direction the smoke is travelling towards (heading "
                 "NW means it drifts to the northwest, not from it); top_places share_pct is how that fire's own "
                 "smoke over residents splits between places; fires_date is when the fires were detected. "
                 "Satellites detected the fires: never say the task force logged, recorded or reported them. "
                 "Write in full sentences, not a list, as three short paragraphs separated by a blank line: first "
                 "the day's situation (the tier counts and the top-ten share), then the leading fires, then what "
                 "changed since the day before. Call the tiers Priority 1, Priority 2 and Priority 3 (never p1). "
                 "Do not name companies. About 150 words (no need to count exactly), plain English, no headings, "
                 "no em dashes. End the last paragraph with the limits sentence unchanged.")
LIMITS_SENTENCE = ("This is a ranking index, not a forecast of smoke concentration. People outside Indonesia are not "
                   "counted. The task force decides.")
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
WORD = re.compile(r"[A-Za-z]+")
# Number words count as numbers (same rule as web/lib/numbers.ts): one to twenty must match a fact;
# scale and fraction words can never be checked, so they always fail.
NUMBER_WORDS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve "
                                           "thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split())}
NEVER_WORDS = {"hundred", "hundreds", "thousand", "thousands", "million", "millions", "billion", "half", "dozen",
               "dozens", "twice", "double", "triple", "third", "thirds", "quarter", "quarters", "thirty", "forty",
               "fifty", "sixty", "seventy", "eighty", "ninety"}
DASHES = ("—", "–")                 # em and en dash
TOKENS = {"total": 0}               # running total of tokens used, for the build report


class LLMError(Exception):
    pass


def _long(ts) -> str:
    ts = pd.Timestamp(ts)
    return f"{ts.day} {ts.strftime('%B %Y')}"


def pct(x: float, digits: int = 0):
    """Percent of x as stored in the day file, rounded half up: the same convention as web/lib/replay.ts roundPct,
    so the bulletin and the fire card always show the same figure (Python's round() breaks ties to even)."""
    q = (Decimal(repr(float(x))) * 100).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
    return int(q) if digits == 0 else float(q)


def build_facts(res, prev) -> dict:
    sq = res.squares
    ranked = sq[sq["rank"].notna()].sort_values("rank") if len(sq) else sq
    top = []
    for r in ranked.head(5).itertuples(index=False):
        top.append({
            "rank": int(r.rank),
            "near": r.place,
            "share_pct": pct(round(float(r.share), 5), 1),           # rounded as stored in the day file
            "people_40km": None if pd.isna(r.people_40km) else int(r.people_40km),
            "heading": r.heading,
            "top_places": [{"name": n, "share_pct": pct(round(float(s), 4))} for n, s in (r.top_places or [])],
            "first_arrival_h": None if pd.isna(r.first_arrival_h) else int(r.first_arrival_h),
        })
    now = list(ranked.id[ranked["rank"] <= 10]) if len(ranked) else []
    new, left = [], 0
    if prev is not None and len(prev.squares):
        before = set(prev.squares.id[prev.squares["rank"] <= 10])
        place_of = dict(zip(sq.id, sq.place))
        new = [place_of[i] for i in now if i not in before]
        left = len(before - set(now))
    return {
        "date": _long(res.date),
        "fires_date": _long(res.date - pd.Timedelta(days=1)),
        "window_hours": config.WINDOW_H,
        "radius_km": int(config.R_KM),
        "p1_count": int(res.counts.get("p1", 0)),
        "p2_count": int(res.counts.get("p2", 0)),
        "p3_count": int(res.counts.get("p3", 0)),
        "top_list_size": 10,                 # "the top 10" is a fact the model may state
        "top10_share_pct": pct(round(float(res.top10_share), 4)),
        "top": top,
        "new_in_top10": new,
        "fires_that_left_top10_count": left,
        "limits": LIMITS_SENTENCE,
    }


def numbers_in(text: str) -> list[str]:
    return [m.rstrip(",") for m in NUMBER.findall(text)]


def _fact_numbers(obj, out):
    if isinstance(obj, bool) or obj is None:
        return
    if isinstance(obj, (int, float)):
        out.append(float(obj))
    elif isinstance(obj, str):
        out.extend(float(n.replace(",", "")) for n in numbers_in(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            _fact_numbers(v, out)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _fact_numbers(v, out)


def offending(text: str, facts: dict) -> list[str]:
    """Numbers in text that no fact matches at the precision the text shows (53 passes for 52.7)."""
    known = []
    _fact_numbers(facts, known)
    bad = []
    for tok in numbers_in(text):
        val = float(tok.replace(",", ""))
        dp = len(tok.split(".")[1]) if "." in tok else 0
        if not any(round(k, dp) == round(val, dp) for k in known):
            bad.append(tok)
    for w in WORD.findall(text):
        lw = w.lower()
        if lw in NEVER_WORDS or (lw in NUMBER_WORDS and NUMBER_WORDS[lw] not in known):
            bad.append(w)
    return bad


def _scrub(msg: str, key: str | None) -> str:
    return msg.replace(key, "***") if key else msg


def call_llm(messages, models, *, attempts=4, pause=3.0, max_tokens=16000, temperature=0.3, opener=None) -> tuple[str, str]:
    """Alternate models; an HTTP error, timeout or empty reply counts as a failure. Returns (text, model)."""
    opener = opener or urllib.request.urlopen
    try:
        key = config.secret("NEBIUS_API_KEY")
    except KeyError as error:
        raise LLMError(str(error.args[0])) from None
    last = "no attempt made"
    for i in range(attempts):
        model = models[i % len(models)]
        body = json.dumps({"model": model, "messages": messages, "max_tokens": max_tokens,
                           "temperature": temperature}).encode("utf-8")
        req = urllib.request.Request(BASE_URL + "chat/completions", data=body, method="POST",
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        try:
            raw = json.loads(opener(req, timeout=120).read().decode("utf-8"))
            TOKENS["total"] += int((raw.get("usage") or {}).get("total_tokens") or 0)
            text = ((raw.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
            if text.strip():
                return text.strip(), model
            last = f"{model}: empty reply"
        except urllib.error.HTTPError as e:
            last = f"{model}: HTTP {e.code}"
        except Exception as e:                      # timeout, connection or parse failure
            last = f"{model}: {type(e).__name__}"
        if i < attempts - 1:
            time.sleep(pause)
    raise LLMError(_scrub(f"all {attempts} attempts failed; last: {last}", key))


def template_bulletin(facts: dict) -> str:
    """Plain bulletin built only from the facts, so it always passes the number check."""
    head = f"Morning of {facts.get('date', 'today')}."
    if "fires_date" in facts:
        head += f" Fires detected on {facts['fires_date']}"
        head += f" put {facts['p1_count']:,} fires in Priority 1 in West Kalimantan." if "p1_count" in facts else "."
    elif "p1_count" in facts:
        head += f" {facts['p1_count']:,} fires are in Priority 1 in West Kalimantan."
    situation = [head]
    if "top10_share_pct" in facts:
        situation.append(f"The ten fires at the top of the list carry {facts['top10_share_pct']}% of the modelled smoke over residents.")
    fires = []
    for t in facts.get("top", [])[:3]:
        s = f"Fire {t['rank']}, near {t.get('near') or 'an unnamed location'}, carries {t['share_pct']}% of it"
        if t.get("people_40km") is not None:
            s += f"; {t['people_40km']:,} residents live"
            s += f" within {facts['radius_km']} km of its smoke path" if "radius_km" in facts else " near its smoke path"
        if t.get("heading"):
            s += f", and its smoke is heading {t['heading']}"
        place = (t.get("top_places") or [{}])[0].get("name")        # first_arrival_h is measured to this place
        if place and t.get("first_arrival_h") == 0:
            s += f", already over {place} as the window opens"
        elif place and t.get("first_arrival_h") is not None:
            s += f", reaching {place} after {t['first_arrival_h']} hours"
        fires.append(s + ".")
    changes = []
    if facts.get("new_in_top10"):
        names = list(dict.fromkeys(n or "an unnamed location" for n in facts["new_in_top10"]))
        changes.append("New in the top ten today: fires near " + ", ".join(names) + ".")
    changes.append(facts.get("limits", LIMITS_SENTENCE))
    return "\n\n".join(" ".join(p) for p in (situation, fires, changes) if p)


def make_bulletin(facts: dict, *, opener=None) -> dict:
    messages = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": "Facts:\n" + json.dumps(facts, ensure_ascii=False, indent=1)}]
    try:
        for _ in range(2):
            text, model = call_llm(messages, BULLETIN_MODELS, opener=opener)
            if not offending(text, facts) and not any(d in text for d in DASHES) and text.endswith(LIMITS_SENTENCE):
                return {"text": text, "source": "llm", "model": model}
    except LLMError:
        pass
    return {"text": template_bulletin(facts), "source": "template", "model": None}
