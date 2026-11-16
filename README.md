# Downwind

Downwind ranks active peat fires in West Kalimantan, Indonesia, by how many residents their smoke will reach in the next 48 hours. It is an extra layer on Indonesia's official hotspot tiers (Permen LHK P.8/MENLHK/SETJEN/KUM.1/3/2018, Pasal 9), which put hundreds of fires in Priority 1 with no order among them. Downwind orders the fires inside Priority 1. The task force decides.

**Live demo (no login):** https://downwind-sigma.vercel.app

The site replays three real mornings, 18 to 20 September 2026. On 20 September the official rule put 349 fires in Priority 1; the ten fires at the top of Downwind's list carry 28% of the modelled smoke over residents.

Built for the AI for Climate Youth Climate Hackathon at COP31 (ATOX), 2026.

## What it does

- **Map:** every fire detected the day before, with a 48 hour smoke animation and the ranked list beside it. Selecting a fire shows only its smoke.
- **Official tiers / Downwind order:** switch between the official tiers and Downwind's order inside Priority 1.
- **Fire card:** residents within 40 km of the fire's modelled smoke path, its share of smoke over residents, when its smoke first reaches the main receiving place, where the smoke is heading, how likely the fire is to be seen again tomorrow, and how many days running it has been seen in the area.
- **Protection view:** for district health and education offices. Pick an Indonesian regency or city and see which fires send it smoke, with each fire's share and arrival time.
- **Bulletin:** a morning briefing written by a language model from the computed facts. Every number in it is checked against those facts; if the check fails twice, a plain template is used instead, and the page says which.
- **Limits:** what the model ignores, what we do not claim, and the measured accuracy, in the Measured results section of the landing page.
- **Ask (local only):** a chat that answers questions from the day's data, for example "what if we can only reach five fires?". It needs an API key, so it is switched off on the public site.

## How it works

1. **Fires:** NASA FIRMS VIIRS detections, grouped into 0.015 degree squares (about 1.7 km).
2. **Official tiers:** Pasal 9(3), read strictly. Priority 1 is a fire on peat (confidence not low) that is also in a cluster of 3 or more detections or seen 3 days running. The regulation gives no cluster size, so 3 is our own number. Its "smoke visible on imagery" input and its listed land uses (Pasal 7a) are not computed, so the true Priority 1 count can only be higher.
3. **Smoke:** each fire releases particles every hour, weighted by its fire radiative power, carried by 925 hPa winds with random spread and washed out by rain, for 48 hours. Peat fires count about 6 times more smoke per unit of heat (GFAS conversion factors, 5.87 against 0.96 kg per MJ, Kaiser et al. 2012). The other settings were tested on the 2023 season and not tuned afterwards.
4. **Weather:** each replay morning uses the ECMWF forecast a task force would have had at 07:00 local (the 12:00 UTC run of the day before, from the Open-Meteo Single Runs API), not the weather that actually followed. The landing page's Measured results section reports how many of the top ten would change with hindsight weather.
5. **Learned persistence model (the AI component):** most fires are not seen again the next day. A gradient-boosted classifier, trained on the 2019, 2023 and 2025 seasons, predicts each fire's likelihood of being seen again tomorrow from what is known that morning. Smoke is weighted by that likelihood.
6. **Ranking:** exposure is smoke times people, summed over the populated cells it reaches. Priority 1 fires are ordered by exposure.
7. **Bulletin:** the language model only phrases computed facts; a check rejects any number it did not receive.
8. **Distance to access (information only):** The fire card shows the map distance from a fire to the nearest mapped road (OpenStreetMap roads, including tracks), as information only: it is not used in the ranking. The distances come from a small grid built offline from the OpenStreetMap extract (`python -m dw.reach build`, which needs pyosmium; the grid is committed as `pipeline/model/reach_road_0.005.npz`). Rivers and canals are left out, because they are mainly water sources for pumps, not access routes. Grid error against exact road distances was a median 0.15 km, at most 0.40 km. OpenStreetMap misses many plantation and logging tracks, so a large distance does not mean a fire is hard to reach.

## What was measured

- In a replay of the 2023 haze season at 7 airports, a smoke index built from the previous day's fires tracks observed visibility at 0.45 correlation (0.81 at Pontianak). That test used archived weather close to what actually happened, because no archive of past forecasts reaches back to 2023.
- It flags 48% of the worst-quartile haze days, against 25% by chance.
- **With the forecast available each morning (September to October 2026, 5 airports, 300 airport-days):** the smoke index tracks visibility at 0.59 correlation (0.75 at Pontianak), against 0.61 with the weather that actually followed and 0.45 for a count of nearby fires. The gain over the fire count is 0.08 to 0.28 (95% range, bootstrap over 7-day blocks of days). Reproduce with `python -m dw.forecast_check` (download the forecasts first with `--fetch`).
- The top ten is stable across reruns (9 to 10 of 10 kept).
- The persistence model scores AUC 0.79 on September to October 2026, a season it never saw, against 0.62 for counting days burned. It was scored on 2026 once and not tuned afterwards. On the three training-season folds it scored 0.72 to 0.84.
- We tested a learned correction of the smoke index against airport visibility. It did not beat the plain simulation, so it is not used.

## Limits

Downwind is a ranking index, not a forecast of smoke concentration. It does not account for fuel load or how deep the peat is burning, smoke rising above the surface layer, fires hidden under cloud or thick smoke, or people outside Indonesia (not counted). It does not claim any skill for Singapore or Kuala Lumpur, and the simulation did not clearly beat counting nearby fires in 2023 (0.45 against 0.38, not statistically solid), although it did in 2026 (0.59 against 0.45). Fires are shown as locations only, never as companies or concession holders.

**Next validation step:** a pilot morning with one task force.

## Run it

### Web app

The web app uses Node.js 24 for local development and CI.

```bash
cd web
npm ci
npm test
npm run dev
```

The app reads the replay files in `web/public/replay/`. Set `NEBIUS_API_KEY` in the dev server's environment or `web/.env.local` to enable local chat. On Windows, `web/scripts/dev-chat.ps1` also accepts a secrets file via `DOWNWIND_SECRETS_FILE`.

### Pipeline (Python 3.11)

From the repository root:

```bash
cd pipeline
python -m pip install -r requirements.txt
python -m pytest -m "not research"
```

For a morning snapshot, ask the team for the prepared `grids.npz`, `adm2_names.json`, and `peat_z7.npz`. Put them in `data/` at the repo root or set `DOWNWIND_DATA_DIR` to their directory. Download a NASA FIRMS Area API CSV, such as `VIIRS_NOAA21_NRT`, then run:

```bash
python -m dw.build --day 2026-11-14 --fires-csv /tmp/downwind-fires.csv --out /tmp/downwind-snapshot
```

The example uses detections from 13 November UTC and fetches the 12:00 UTC ECMWF forecast from that day. Include earlier detections for the consecutive-day tier rule and up to 14 UTC dates for the fire-age display. The forecast cache defaults to the data directory and can be set with `DOWNWIND_FORECAST_CACHE_DIR`. Omitting `--out` writes to `snapshots/` inside the data directory. The bulletin uses a local template when the Nebius key is absent. Set `NEBIUS_API_KEY` in the environment or set `DOWNWIND_SECRETS_FILE` to an external file containing `NEBIUS_API_KEY=…`.

To enable persistence weighting for a CSV build (`dw.build`), put the team's `persist_model.pkl` and `learn.json` in the data directory and pass `--persistence-weather /path/to/weather.npz`. Use scikit-learn 1.9.1, the version that produced the saved model (pinned in `requirements.txt`). The live feed does this automatically, see below. The CSV needs its `daynight` column and up to seven UTC dates of detections for the model's history features. Supply all 24 hours of the previous UTC day in the weather file. It needs `lats`, `lons`, hourly UTC `times`, `precipitation` in mm/h, and `relative_humidity_2m` in percent. Use a regular grid with weather arrays shaped latitude × longitude × time. Each snapshot reports whether it applied persistence weighting.

### Optional road and water distance preparation

After installing the pipeline requirements and preparing the population/province
grids, run from `pipeline/`:

```bash
python -m dw.reach
# Or use an extract already downloaded:
python -m dw.reach --pbf /path/to/kalimantan-latest.osm.pbf
```

The command streams the [Geofabrik Kalimantan extract](https://download.geofabrik.de/asia/indonesia/kalimantan.html)
to the data directory on first use, then reads it locally using pyosmium.
It writes `osm_roads.json` (trunk, primary, secondary, tertiary, unclassified,
and track) and `osm_water.json` (river and canal), retaining ways whose bounding
boxes overlap the province bounding box. Downloads are cached; to refresh the
extract, remove the cached PBF explicitly and rerun the command. Extraction
rebuilds both line files each time. It uses a disk-backed node index, so allow
local disk space for the extract and its index.

`dw.reach.road_km` and `water_km` report approximate straight-line distances
on a 0.01-degree raster (about 1.1 km). Missing/empty datasets raise an error.
These are distances to mapped features, not driving routes, navigability,
water availability, or verified crew access. OSM coverage may be incomplete.
This optional command does not run during snapshot builds and does not change
model weights, training, smoke calculations, or rankings.

### Reproduce the research replay

The research commands also use the original archive CSVs, weather grids, and airport observations. Set `DOWNWIND_REPLAY_DATA_DIR` and `DOWNWIND_CHECK_DATA_DIR` to the team's data directories. Their defaults are `../validation-2023-replay/data` and `../data-check/data` relative to the checkout. See the archive filenames in `pipeline/dw/fetch.py` and the weather and METAR paths in `pipeline/dw/evaluate.py`. The fetch command retrieves boundaries, the 2025 Malaysia CSV, and the listed historical weather grids. The remaining inputs come from the team's research files. The `pandas` pin preserves the published handling of tied visibility days.

From `pipeline/`:

```bash
python -m pytest
python -m dw.build --learn
python -m dw.build --day 2026-09-20 --days 3
```

For the Python-to-browser export check, run `DOWNWIND_TEST_PYTHON=/path/to/pipeline-venv/bin/python npm test` from `web/`. CI runs this check with generated data.

### Replay file format

For a fresh morning snapshot using the public NOAA-21 FIRMS download and ECMWF, run this from `pipeline/`:

```bash
python -m dw.live --out /tmp/downwind-morning
```

The command rebuilds missing grids from WorldPop's 2020 Indonesia raster adjusted to UN totals, geoBoundaries, and Global Forest Watch peat tiles. It uses the previous UTC date's detections and the previous day's 12:00 UTC model run. The regional feed provides a freshness check for the requested date, including when the Downwind area has zero detections.

The Live view on `/app` checks the feed manifest every minute. It displays a new snapshot once the matching ranking, particles, and limits have loaded. If the refresh fails, the open app keeps the last successful snapshot and shows its timestamp. September replay dates are available in the same picker. For local testing, `NEXT_PUBLIC_DOWNWIND_FEED_URL` can point the web build at a compatible feed.

The [Morning feed workflow](https://github.com/TheIntrinsicInvestor/downwind/actions/workflows/morning-feed.yml) runs daily at 07:12 West Kalimantan time. It publishes one complete snapshot to the `live-data` branch and retains earlier snapshots. Use **Run workflow** on `main` for a manual refresh. If a run fails, the published manifest continues to point to the previous snapshot.

**Persistence weighting on the live feed.** The model and its `learn.json` are committed in `pipeline/model/` (override the folder with `DOWNWIND_MODEL_DIR`). The live feed uses NOAA-21 detections and the model was trained on S-NPP, so it was checked on NOAA-21 for September to October 2026: AUC 0.793 against 0.622 for counting days burned, with the mean predicted likelihood (0.337) close to the observed rate (0.332). That check is recorded in `learn.json` under `live_check`, together with `months`, the calendar months of the snapshot day in which weighting applies (currently 8 to 11: November was checked separately on 1 to 13 Nov 2026 NOAA-21 detections, AUC 0.829 against 0.653, and on November 2019, 2023 and 2025 S-NPP detections, AUC 0.834 against 0.644; other months are untested). In those months `dw.live` fetches the previous UTC day's hourly rain and humidity on the 1 degree grid from Open-Meteo's forecast API (all 24 hours), and the snapshot is weighted: its day file reports `persistence_weighted: true` and `limits.json` carries the model details including `live_check`. In any other month, or if the model files fail to load, the weather download fails or has gaps, or the prediction raises, the run logs one line starting `persistence weighting off, building unweighted:` with the reason and publishes an unweighted snapshot as before. Successful builds publish after snapshot validation. A failed build or validation leaves the last published snapshot available. To test a month outside the list, point `DOWNWIND_MODEL_DIR` at a copy of the folder whose `learn.json` lists that month.

Each run also keeps a detection archive at `detections/archive.csv` on the `live-data` branch: the new FIRMS download is merged with earlier mornings' detections (inside the map's bounding box, last 21 days), so fire age and the "seen 3 days running" tier rule can look past the feed's 7 days. Locally, pass `--archive path/to/archive.csv` to `python -m dw.live`.

`web/public/replay/` holds `index.json` (the available days), `limits.json` (the accuracy and limits panel), and per day `YYYY-MM-DD.json` (counts, fires with tier, rank, share and card fields, places with their contributing fires, ranking stability, changes since the day before, the bulletin, and byte offsets for 48 hourly frames) plus `YYYY-MM-DD.particles.bin.gz` (particle positions, source fire and opacity per hour). The TypeScript types in `web/lib/replay.ts` are the contract; `pipeline/dw/export.py` writes it.

## Data sources and licences

| Data | Source | Licence or terms |
|---|---|---|
| Fire detections (VIIRS S-NPP archives and NOAA-21 near real time) | NASA FIRMS | NASA open data; acknowledge LANCE FIRMS |
| Winds, rain, humidity | Open-Meteo historical forecast API | CC BY 4.0 |
| Airport visibility (2023 validation) | Iowa State University Mesonet, METAR archive | free use with acknowledgement |
| Peat extent | Global Forest Watch peatlands map (zoom 7 tiles) | per the dataset's page on Global Forest Watch |
| Population | WorldPop 1 km Indonesia, 2020 | CC BY 4.0 |
| Province and regency boundaries | geoBoundaries (gbOpen, IDN ADM1 and ADM2) | CC BY 4.0 |
| Road and water distance inputs (optional) | Geofabrik Kalimantan OpenStreetMap extract | OpenStreetMap data ODbL; © OpenStreetMap contributors |
| Basemap | OpenFreeMap, OpenMapTiles, OpenStreetMap contributors | OpenStreetMap data ODbL |
| Roads including tracks (distance on the fire card) | OpenStreetMap, Geofabrik Kalimantan extract of 13 November 2026 | ODbL, © OpenStreetMap contributors |

## AI tools and models

- **Claude Code** (Anthropic) and **OpenAI Codex** wrote the code under the direction of the team, which set requirements, reviewed and ran it.
- **Nebius Token Factory:** `deepseek-ai/DeepSeek-V4-Pro-0813` and `MiniMaxAI/MiniMax-M3` write the bulletins (generated in advance and stored in the replay files) and answer the local chat.
- **scikit-learn** `HistGradientBoostingClassifier` is the persistence model.
- **ElevenLabs** voiced the demo video narration (free tier). The video was recorded and edited with Claude Code agents using Playwright and Remotion; its music was synthesised in code.
- **Google Gemini** generated the image the logo was traced from.

## Statement of work

The handbook allows prior work if it is disclosed. Everything in this repository committed on 12 and 13 November 2026 was built before the build window (14 to 15 November) and is prior work:

- the full pipeline and web app (plan Tasks 1 to 12 and 14), the live deploy, and the tests;
- on 13 November, after a teammate's review: the peat emission weighting, replay weather from the forecast available each morning, fire age on the card, the protection view, and the corrected wording of the 2023 result;
- background research, the 2023 replay accuracy test, the 2019 to 2025 model experiments (the visibility correction that was dropped and the persistence model that was adopted), the data-source check, the design spec, the build plan and the pitch deck, all kept in the wider project folder outside this repository.

On 12 November an accidental `rm -rf .git` deleted this repository's history. The files were intact; the first five tasks were recommitted as one commit (`77e4956`), so the history begins there.

The original Overpass download failed across three mirrors on 12 November. The fire card now uses a bundled road-only grid built from the Geofabrik extract. The optional extraction command also prepares a separate waterway lookup for offline use.

**Built during the event (14 to 15 November)**, in pull requests #3 to #38:

- the live daily feed: a morning snapshot from NASA FIRMS published by GitHub Actions, with a 21-day detection archive, snapshot validation and reliability fixes;
- persistence weighting on the live feed (August to November), tested on NOAA-21 without retraining;
- the 2026 forecast test (0.59 against 0.45 for counting nearby fires) and a check of 13 model-improvement ideas, none adopted (kept outside this repository);
- on the fire card, the distance to the nearest mapped road and per-place smoke arrival and peak times;
- the Protect tab: arrival and peak times, a 48-hour smoke chart per place, a dropdown of affected places, the chosen place outlined on the map, and an origin-of-smoke table;
- the landing page: the scroll story, stakes figures with updated sources, how Downwind differs, what it adds, and its limits;
- the paper theme with Newsreader and Public Sans, and phone layout fixes.

On 16 November, the morning set aside for recording and documentation, the team made the narrated demo video and the final deck.

**Submission materials:** the [release `demo-video`](https://github.com/TheIntrinsicInvestor/downwind/releases/tag/demo-video) holds the pitch deck (.pptx, with the demo embedded), its PDF and the 2:59 demo video.

## Future work

See the [infrastructure checklist](docs/infrastructure-todo.md) for remaining operational checks.

- Extend to Indonesia's other peat provinces (Central Kalimantan, South Sumatra, Riau, Jambi), which use the same P.8/2018 rule.
- Then other smoke seasons: Sarawak's peat fires, the February to April burning season in northern Thailand, Laos and Myanmar, and the Amazon fire season in Brazil and Bolivia.
- Each region is tested against local haze (airport visibility or air-quality records) before use, as West Kalimantan was. The inputs (NASA fire detections, ECMWF winds, WorldPop) are already global.

## Licence

MIT. See `LICENSE`.
