import io
import json
import urllib.error

import pandas as pd
import pytest

from dw import config
from dw.bulletin import BULLETIN_MODELS, LIMITS_SENTENCE, LLMError, build_facts, call_llm, make_bulletin, offending, template_bulletin
from dw.rank import run_day
from tests.conftest import T0, flat_met, one_fire, peat_everywhere, toy_grids

_on_peat = pytest.fixture(scope="module", autouse=True)(peat_everywhere)

FACTS = {"date": "22 October 2026", "p1_count": 1412, "top10_share_pct": 53, "top_list_size": 10,
         "top": [{"rank": 1, "near": "Ketapang", "share_pct": 12, "people_40km": 680000, "first_arrival_h": 7}]}
MSGS = [{"role": "user", "content": "hello"}]
HTTPError503 = object()


class fake_opener:
    """Stands in for urllib.request.urlopen: records each request and replays scripted replies."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.models_called, self.bodies = [], []

    def __call__(self, req, timeout=None):
        body = json.loads(req.data.decode("utf-8"))
        self.bodies.append(body)
        self.models_called.append(body["model"])
        r = self.replies.pop(0)
        if r is HTTPError503:
            raise urllib.error.HTTPError(req.full_url, 503, "Service Unavailable", {}, None)
        payload = {"choices": [{"message": {"content": r}}], "usage": {"total_tokens": 100}}
        return io.BytesIO(json.dumps(payload).encode("utf-8"))


@pytest.fixture(autouse=True)
def fake_key(monkeypatch):
    monkeypatch.setattr(config, "secret", lambda n: "SECRETVALUE")


def test_bulletin_uses_template_when_key_is_missing(monkeypatch):
    def missing_key(name):
        raise KeyError(name)

    monkeypatch.setattr(config, "secret", missing_key)
    assert make_bulletin(FACTS) == {"text": template_bulletin(FACTS), "source": "template", "model": None}


@pytest.mark.parametrize("text,bad", [
    ("Fire 1 near Ketapang puts 680,000 people under smoke.", []),
    ("The top ten carry 53% of exposure.", []),
    ("About 700,000 people are affected.", ["700,000"]),
    ("Roughly 0.7 million people.", ["0.7", "million"]),
    ("Seven hours until smoke arrives; the top ten matter most.", []),     # 7 and 10 are facts
    ("Three fires left the list.", ["Three"]),
    ("About two million people, half of them in towns.", ["two", "million", "half"]),
    ("Thirty fires carry a third, sixty percent or a quarter.", ["Thirty", "third", "sixty", "quarter"]),
    ("Smoke arrives in 7 hours, on 22 October 2026.", []),
    ("There are 1,412 Priority 1 fires and 12 crews.", []),      # 12 is share_pct: passes by value; documented limit
    ("There are 1,413 Priority 1 fires.", ["1,413"]),
])
def test_number_check(text, bad):
    assert offending(text, FACTS) == bad


def test_rounded_value_passes_at_shown_precision():
    assert offending("about 53% of smoke", {"x": 52.7}) == []
    assert offending("about 52.6% of smoke", {"x": 52.7}) == ["52.6"]


def test_invented_figure_falls_back_to_template():
    fake = fake_opener(["About 900,000 people.", "Still 900,000 people."])
    out = make_bulletin(FACTS, opener=fake)
    assert out["source"] == "template" and offending(out["text"], FACTS) == [] and out["model"] is None


def test_clean_llm_text_is_used():
    text = "Fire 1 near Ketapang carries 12% of the smoke over 680,000 people. " + LIMITS_SENTENCE
    out = make_bulletin(FACTS, opener=fake_opener([text]))
    assert out == {"text": text, "source": "llm", "model": BULLETIN_MODELS[0]}


def test_cut_off_limits_sentence_falls_back_to_template():
    cut = "Fire 1 near Ketapang carries 12% of the smoke. " + LIMITS_SENTENCE[:-30]
    out = make_bulletin(FACTS, opener=fake_opener([cut, cut]))
    assert out["source"] == "template" and out["text"].endswith(LIMITS_SENTENCE)


def test_models_alternate_and_empty_reply_is_failure():
    fake = fake_opener([HTTPError503, "", "Fire 1 near Ketapang."])
    text, model = call_llm(MSGS, BULLETIN_MODELS, pause=0, opener=fake)
    assert fake.models_called == BULLETIN_MODELS + BULLETIN_MODELS[:1] and model == BULLETIN_MODELS[0]
    assert text == "Fire 1 near Ketapang."


def test_four_failures_raise_without_leaking_key():
    with pytest.raises(LLMError) as e:
        call_llm(MSGS, BULLETIN_MODELS, pause=0, opener=fake_opener([HTTPError503] * 4))
    assert "SECRETVALUE" not in str(e.value)


def test_llm_error_falls_back_to_template():
    out = make_bulletin(FACTS, opener=fake_opener([HTTPError503] * 8))
    assert out["source"] == "template"


def test_max_tokens_is_16000():
    fake = fake_opener(["ok"])
    call_llm(MSGS, BULLETIN_MODELS, pause=0, opener=fake)
    assert fake.bodies[0]["max_tokens"] == 16000 and fake.bodies[0]["messages"] == MSGS


def test_template_has_no_em_dash_and_passes_own_check():
    for facts in (FACTS, _real_facts()):
        text = template_bulletin(facts)
        assert "—" not in text and offending(text, facts) == [] and len(text) > 50


def test_template_arrival_names_the_place_it_is_measured_to():
    # first_arrival_h is measured to the fire's first top place (rank.py), not to the first residents
    top = {"rank": 1, "near": "Kayong Utara", "share_pct": 7.1, "people_40km": 2667610, "heading": "NW",
           "top_places": [{"name": "Kubu Raya", "share_pct": 58}]}
    later = template_bulletin({"top": [dict(top, first_arrival_h=2)]})
    now = template_bulletin({"top": [dict(top, first_arrival_h=0)]})
    assert "reaching Kubu Raya after 2 hours" in later and "already over Kubu Raya as the window opens" in now
    assert "reaching residents" not in later and "over residents as the window" not in now


def _real_facts():
    y = T0 - pd.Timedelta(days=1)
    fires = pd.concat([one_fire(y, la, 109.0) for la in (-0.2, 0.0, 0.2)], ignore_index=True)
    res = run_day(T0, fires, flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 100_000))
    return build_facts(res, None)


def test_build_facts_shape():
    f = _real_facts()
    assert f["date"] == "22 October 2026" and f["fires_date"] == "21 October 2026"
    assert f["window_hours"] == 48 and f["radius_km"] == 40 and f["p1_count"] == 3
    assert len(f["top"]) == 3 and f["top"][0]["rank"] == 1 and f["top"][0]["near"] == "Kota Toy"
    assert f["new_in_top10"] == [] and f["fires_that_left_top10_count"] == 0
    assert f["limits"].startswith("This is a ranking index")


def test_top_ten_is_a_fact():
    # the model naturally writes "top 10"; the facts must carry 10 so that phrase passes the check
    f = _real_facts()
    assert offending("The top 10 carry the most smoke.", f) == []


@pytest.mark.parametrize("x,digits,want", [
    (0.0675, 1, 6.8),       # 18 Sep rank 3: stored 0.0675 (true 6.749%); the card shows 6.8
    (0.0625, 1, 6.3),       # exact tie rounds up, as the browser does (Python's round gives 6.2)
    (0.0645, 1, 6.5),
    (0.0115, 1, 1.2),       # the browser's toFixed alone gives 1.1
    (0.0095, 1, 1.0),
    (0.125, 0, 13),         # Python's round gives 12
    (0.3008, 0, 30),
])
def test_pct_uses_the_card_rounding(x, digits, want):
    from dw.bulletin import pct
    assert pct(x, digits) == want


def test_facts_round_the_stored_share_like_the_card():
    f = _real_facts()
    from dw.bulletin import pct
    res = run_day(T0, pd.concat([one_fire(T0 - pd.Timedelta(days=1), la, 109.0) for la in (-0.2, 0.0, 0.2)],
                                ignore_index=True), flat_met(5.0, 0.0, 0.0), toy_grids(0.0, 109.34, 100_000))
    r = res.squares[res.squares["rank"] == 1].iloc[0]
    assert f["top"][0]["share_pct"] == pct(round(float(r.share), 5), 1)


def test_template_is_three_paragraphs():
    paras = template_bulletin(_real_facts()).split("\n\n")
    assert len(paras) == 3 and paras[0].startswith("Morning of") and paras[-1].endswith(LIMITS_SENTENCE)
