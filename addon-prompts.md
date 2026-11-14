# Downwind add-ons: Claude Code prompts

Three tasks that turn Downwind's ranking from "people reached" into **averted harm**: the smoke harm a crew can still prevent.

```
averted harm = containability × future exposure
containability = Reach × Effect
future exposure = one day of smoke × people × expected days left
```

Run the prompts **one at a time, in order** (1 → 2 → 3), in separate Claude Code sessions. Each must pass `python -m pytest` before the next starts. Commit each one separately during the build window (14 to 15 November) so the statement of work can point to clean in-event commits.

To run one, open Claude Code in the repo root and say: *"Read docs/addon-prompts.md and do Prompt 1."*

---

## Prompt 1: Containability (Reach × Effect)

Add a containability term to the Downwind pipeline. Read `pipeline/dw/reach.py`, `rank.py`, `tiers.py`, `config.py` and `export.py` first. Do not change the existing exposure calculation or the shipped persistence model.

### Data sources

- **OpenStreetMap, Geofabrik Kalimantan extract (ODbL):** <https://download.geofabrik.de/asia/indonesia/kalimantan-latest.osm.pbf>. Download once to `config.DATA / "kalimantan-latest.osm.pbf"`. This replaces the Overpass fetch, which failed on 12 Nov.
- **Existing:** Global Forest Watch peat (`dw.grids.peat_at`), FIRMS detections (fire age via `tiers.fire_age`).

### Step 1: `reach.py`, read OSM locally

- Remove the Overpass code. Add `fetch_pbf()` (urllib download, skip if the file exists) and `extract_lines()` using pyosmium (add `osmium` to `requirements.txt`). Keep ways inside the province bounding box (`_province_bbox`) and save two files:
  - `config.DATA / "osm_roads.json"`: `highway` in {trunk, primary, secondary, tertiary, unclassified, track}
  - `config.DATA / "osm_water.json"`: `waterway` in {river, canal}
  
  Same format as before: a list of `[(lon, lat), ...]` lines.
- Reuse `distance_grid()` unchanged. Expose `road_km(lat, lon)` and `water_km(lat, lon)`, each with its own cached grid. If a lines file is missing, raise a clear error naming the command to run (`python -m dw.reach`). Do not return NaN silently.

### Step 2: `config.py`, constants

Comment each one as an assumption, not a measured value.

```python
REACH_FULL_KM = 2.0      # reach 1.0 within this road distance
REACH_ZERO_KM = 10.0     # reach falls linearly to REACH_MIN at this distance
REACH_MIN = 0.2          # helicopter-only territory
WATER_KM = 1.0           # no river or canal within this distance -> water penalty
WATER_PENALTY = 0.7      # multiplier on reach when water is far
EFFECT_MINERAL = 0.8     # surface fire, not on peat
EFFECT_PEAT = [(2, 0.6), (7, 0.3), (999, 0.1)]   # (max age_days, effect) for peat fires
```

### Step 3: new module `dw/containability.py`

- `reach_score(road_km, water_km)`: 1.0 if `road_km <= REACH_FULL_KM`; linear down to `REACH_MIN` at `REACH_ZERO_KM`; `REACH_MIN` beyond. Multiply by `WATER_PENALTY` where `water_km > WATER_KM`. Vectorised numpy.
- `effect(peat, age_days)`: `EFFECT_MINERAL` where not peat; for peat, the first bin with `age_days <= max age`. Vectorised.
- `containability(reach, effect) = reach * effect`, clipped to [0, 1].

### Step 4: `rank.py`

In `run_day`, after `age_days` is set, add columns `road_km`, `water_km`, `reach`, `effect`, `containability` for every square. The ranking does not change in this task.

### Step 5: `export.py` and `web/lib/replay.ts`

Add to each fire: `road_km` (1 dp), `reach`, `effect`, `containability` (2 dp). Add matching nullable fields to the `Fire` type in `replay.ts`.

### Step 6: tests, new file `pipeline/tests/test_containability.py`

- `effect`: non-peat → 0.8; peat at age 1, 2, 3, 7, 8 → 0.6, 0.6, 0.3, 0.3, 0.1
- `reach_score` at road 0, 2, 6, 10, 20 km with water near → 1.0, 1.0, 0.6, 0.2, 0.2
- water far multiplies by 0.7
- `distance_grid` on a tiny synthetic line, same as any existing reach test

Run `python -m pytest` and make sure all existing tests still pass.

### Step 7: README

Add the Geofabrik OSM extract (ODbL) to the data sources table. Move reachability out of "Future work". Note that the Reach and Effect values are assumptions.

---

## Prompt 2: Remaining life from forecast rain

Add expected remaining life (days a fire keeps burning) using the 7-day rain forecast, chained onto the existing persistence model. Read `pipeline/dw/fetch.py` (`fetch_forecast`, `forecast_run`), `learn.py` (including `_daily_weather`) and `rank.py` first.

- Do **not** change `fetch_forecast` or its cached files: `forecast_check` and the published 2026 results depend on them.
- Do **not** retrain or alter the shipped persistence model.

### Data sources

- **Open-Meteo Single Runs API (CC BY 4.0):** <https://single-runs-api.open-meteo.com/v1/forecast>, same run as now (`forecast_run(day)`, ECMWF IFS 0.25), precipitation only.
- **Existing, for calibration:** `met_<year>.npz` for 2019, 2023, 2025 (Open-Meteo historical forecast API) and the FIRMS VIIRS archives used by `learn.load_detections`.
- **Existing, for scoring once:** 2026 FIRMS NRT and `met_2026.npz`.

### Step 1: `fetch.py`, new function `fetch_rain_forecast(day)`

Same grid, chunking and pauses as `fetch_forecast`, but `hourly=precipitation` only and `forecast_hours = 180` (12 UTC on T-1 to 00 UTC on T+7). Save to `config.DATA / f"rain_{run:%Y%m%dT%H}.npz"`.

Add `daily_rain_forecast(day)` returning an array `[lat, lon, 7]` of rain in mm for UTC days T to T+6 (T 00 UTC = 07:00 local). Fail loudly if any hour is missing.

### Step 2: new module `dw/survival.py`, daily survival factor `s(rain, peat)`

- Build a calibration table for `SEASONS` (2019, 2023, 2025), reusing `persistence_table`'s square-day keys and `look()` logic rather than duplicating them. Rows: squares seen (non-low) on day D with `days_running >= 2` (established fires).
  - Features: `rain_next` = observed rain on D+1 at the square (from met), `peat` (0/1).
  - Label: seen again on **any** of D+1, D+2, D+3. Cloud and smoke hide fires, so "not seen tomorrow" alone overstates extinction.
- Fit sklearn `LogisticRegression` on `[log1p(rain_next), peat, log1p(rain_next) * peat]`. Save to `config.DATA / "survival_model.pkl"`.
- Score once on 2026 (same rows and label) and report AUC and Brier score. Do not tune afterwards. Add a `"survival"` block to `limits.json` via `export.write_limits`: `{"auc_2026", "brier_2026", "label": "seen again within 3 days", "seasons": [2019, 2023, 2025]}`.
- `survival_factor(rain_mm, peat)` → probability, vectorised.

### Step 3: remaining life

`remaining_life(persist_p, rain7, peat)` for each fire:

```
S1 = persist_p                         # existing model: likelihood seen again on T
for d = 2..7:
    S_d = S_{d-1} * survival_factor(rain7[d-1], peat)
L = S1 + S2 + ... + S7, clipped to [0, 7]
```

`rain7` = `daily_rain_forecast(T)` at the fire's nearest grid point (same nearest-point method as `learn.py`). Fires with no `persist_p` use 1.0, matching `run_day`'s current `fillna(1.0)`.

### Step 4: `rank.py` and `build.py`

- Add a `life: pd.Series | None = None` parameter to `run_day` (and `stability`). When given, multiply `w_src` by `life` **instead of** `persist`. Exposure is linear in `w_src`, so exposure becomes one day of smoke harm × expected days left = future exposure. Keep `persist_p` as its own column for the fire card. Store `sq["life_days"]`.
- In `build.cmd_day`: compute `life` for each day from the persistence output and `daily_rain_forecast(d)`, and pass it to `run_day` and `stability`. Print how many of the top ten change compared with the current persist-weighted ranking.
- Add `--survival` to `build.py` to train and score the survival model (like `--learn`).

### Step 5: export and types

Add `life_days` (1 dp) to each fire in `export.py` and to the `Fire` type in `replay.ts`. On `FireCard`, show "Expected days left" next to the existing "likelihood seen tomorrow".

### Step 6: tests

- `remaining_life`: S1 = 0.5 with survival 1.0 on all days → L = 3.5; survival 0 from day 2 → L = 0.5
- `survival_factor` decreases with rain for both peat and non-peat (on a small fitted toy model)
- `daily_rain_forecast` sums the right 24-hour blocks (synthetic npz)

Run the full test suite.

---

## Prompt 3: The new score (averted harm)

Make averted harm the ranking inside Priority 1. Prompts 1 and 2 are done: squares now carry `containability` and an exposure that already includes expected remaining life. Read `rank.py`, `export.py`, `bulletin.py` (`build_facts`), `web/lib/replay.ts`, `FireCard.tsx`, `LimitsPanel.tsx` and the existing tests first.

### Step 1: `rank.py`

- After exposure is computed:
  - `sq["exposure_rank"]`: current behaviour, province Priority 1 sorted by exposure (desc, id asc)
  - `sq["averted"] = sq["containability"] * sq["exposure"]`
  - `sq["rank"]`: province Priority 1 sorted by averted (desc, then id asc)
- Keep `share` as each fire's share of province exposure (the protection view uses it). Add `averted_share` = averted / total province averted.
- `top10_share` stays the exposure share of the new top ten. Also return `top10_averted_share`.
- Add `top10_vs_exposure`: overlap between the new top ten and the exposure-only top ten. Print it in `build.cmd_day` and write it into the day's stability block.

### Step 2: effect sensitivity check (for the limits panel)

New function `effect_sensitivity(day, ...)`: rerun the ranking step only (**not** the particle simulation; reuse the computed exposure) with each Effect value and each Reach constant scaled by 0.5 and 1.5, one at a time. Record the top-ten overlap with the base ranking. Write the minimum and median overlap to `limits.json` as `"effect_sensitivity"`.

### Step 3: `export.py` and `replay.ts`

- Per fire: `averted` (3 significant figures), `averted_share`, `exposure_rank`.
- Per day: `top10_averted_share`, `top10_vs_exposure`.

Update the TypeScript types to match. They are the contract.

### Step 4: web app

- `FireList` and `FireCard`: Downwind order now means averted-harm order. On the card, add one line, "Crews can avert about X% of this fire's smoke harm" (containability), plus road distance and expected days left.
- `ModeToggle` and `LimitsPanel` copy: Downwind orders Priority 1 by the smoke harm a crew can still prevent: containability × future exposure.
- In `LimitsPanel`, list the Reach and Effect values under "Assumed, not measured" with the sensitivity result. Name the next validation step: Manggala Agni suppression records (SIPP Karhutla), to replace the assumed Effect values.

### Step 5: bulletin

In `build_facts`, give the language model each top fire's `containability`, `life_days` and averted rank, so it can say why a fire ranks high. The number check must still pass.

### Step 6: tests

Update `test_rank.py` deliberately:

- Existing exposure-ordering assertions move to `exposure_rank`.
- New test: two Priority 1 fires. A has higher exposure but containability 0.05; B has lower exposure and containability 0.6. B ranks above A.
- Ties broken by id.

Run the full `pytest` suite and `npx vitest run`.

### Step 7: rebuild and README

Run `python -m dw.build --day 2026-09-20 --days 3`. Then update the README:

- "What it does"
- "How it works" step 6
- the headline sentence (it currently quotes the exposure top-ten share)

Add the new work under "Built during the event (14 to 15 November)".

---

## Checks after each prompt

1. **After Prompt 1:** spot-check a few fires' `road_km` against a map. Missing rural roads in OpenStreetMap will show up as unrealistically low reach.
2. **After Prompt 2:** check the survival model's 2026 AUC. If it's no better than about 0.6, rain isn't adding much. Keep it, but say so on the limits panel.
3. **After Prompt 3:** look at `top10_vs_exposure`. At 10 of 10, containability isn't changing anything, so revisit the Effect values. At 0 to 3 of 10, check that missing OpenStreetMap roads aren't zeroing out reach across large areas.
