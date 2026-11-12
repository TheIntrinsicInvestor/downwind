# Downwind

Downwind ranks active peat fires in West Kalimantan, Indonesia, by how many residents their smoke will reach in the next 48 hours. It is an extra layer on Indonesia's official hotspot tiers (Permen LHK P.8/MENLHK/SETJEN/KUM.1/3/2018, Pasal 9), which, as we read them, put hundreds of fires in Priority 1 with no order among them. Downwind orders the fires inside Priority 1. The task force decides.

**Live demo (no login):** https://downwind-sigma.vercel.app

The site replays three real mornings, 18 to 20 September 2026. On 20 September the official rule (as we read it) put 564 fires in Priority 1; the ten fires at the top of Downwind's list carry 30% of the modelled smoke over residents.

Built for the AI for Climate Youth Climate Hackathon at COP31 (ATOX), 2026.

## What it does

- **Map:** every fire detected the day before, with a 48 hour smoke animation and the ranked list beside it. Selecting a fire shows only its smoke.
- **Official tiers / Downwind order:** switch between the official tiers and Downwind's order inside Priority 1.
- **Fire card:** residents within 40 km of the fire's modelled smoke path, its share of smoke over residents, when its smoke first reaches the main receiving place, where the smoke is heading, and how likely the fire is to be seen again tomorrow.
- **City view:** pick an Indonesian regency or city and see which fires send it smoke, with each fire's share and arrival time.
- **Bulletin:** a morning briefing written by a language model from the computed facts. Every number in it is checked against those facts; if the check fails twice, a plain template is used instead, and the page says which.
- **Limits:** what the model ignores, what we do not claim, and the measured accuracy.
- **Ask (local only):** a chat that answers questions from the day's data, for example "what if we can only reach five fires?". It needs an API key, so it is switched off on the public site.

## How it works

1. **Fires:** NASA FIRMS VIIRS detections, grouped into 0.015 degree squares (about 1.7 km).
2. **Official tiers:** our reading of Pasal 9. Priority 1 is a fire on peat, in a cluster of 3 or more detections, or seen 3 days running (confidence not low). The regulation gives no cluster size, so 3 is our own number. Its "smoke visible on imagery" input is not computed.
3. **Smoke:** each fire releases particles every hour, weighted by its fire radiative power, carried by 925 hPa winds with random spread and washed out by rain, for 48 hours. These settings were tested on the 2023 season and not tuned afterwards.
4. **Learned persistence model (the AI component):** most fires are not seen again the next day. A gradient-boosted classifier, trained on the 2019, 2023 and 2025 seasons, predicts each fire's likelihood of being seen again tomorrow from what is known that morning. Smoke is weighted by that likelihood.
5. **Ranking:** exposure is smoke times people, summed over the populated cells it reaches. Priority 1 fires are ordered by exposure.
6. **Bulletin:** the language model only phrases computed facts; a check rejects any number it did not receive.

## What was measured

- In a replay of the 2023 haze season at 7 airports, a day-ahead smoke index tracks observed visibility at 0.45 correlation (0.80 at Pontianak).
- It flags 50% of the worst-quartile haze days, against 25% by chance.
- The top ten is stable across reruns (9 to 10 of 10 kept).
- The persistence model scores AUC 0.79 on September to October 2026, a season it never saw, against 0.62 for counting days burned. It was scored on 2026 once and not tuned afterwards. On the three training-season folds it scored 0.72 to 0.84.
- We tested a learned correction of the smoke index against airport visibility. It did not beat the plain simulation, so it is not used.

## Limits

Downwind is a ranking index, not a forecast of smoke concentration. It does not account for fuel load or how deep the peat is burning, smoke rising above the surface layer, fires hidden under cloud or thick smoke, or people outside Indonesia (not counted). It does not claim any skill for Singapore or Kuala Lumpur, and the simulation does not clearly beat counting nearby fires (0.45 against 0.38, not statistically solid). Fires are shown as locations only, never as companies or concession holders.

**Next validation step:** a pilot morning with one task force.

## Run it

### Web app

```
cd web
npm install
npx vitest run
npm run dev
```

The app reads only the replay files in `web/public/replay/`. No server computation and no keys are needed.

To run the chat locally on Windows, `web/scripts/dev-chat.ps1` reads `NEBIUS_API_KEY` from a secrets file outside the repository into the dev server's memory and starts it on port 3125.

### Pipeline (Python 3.11)

```
cd pipeline
pip install -r requirements.txt
python -m pytest
python -m dw.build --learn                       # train the persistence model, score 2026 once
python -m dw.build --day 2026-09-20 --days 3     # write the replay files (about 5 minutes)
```

`pandas` is pinned to 2.2.3: pandas 3 orders tied days differently and changes a published baseline. The pipeline reads raw data (fire archives, the WorldPop raster, peat tiles, the 2023 weather grid) from folders beside this repository in the original project, and the language-model key from a local secrets file, so a fresh clone needs those inputs before `dw.build` runs. The tests do not need them.

### Replay file format

`web/public/replay/` holds `index.json` (the available days), `limits.json` (the accuracy and limits panel), and per day `YYYY-MM-DD.json` (counts, fires with tier, rank, share and card fields, places with their contributing fires, ranking stability, changes since the day before, the bulletin, and byte offsets for 48 hourly frames) plus `YYYY-MM-DD.particles.bin.gz` (particle positions, source fire and opacity per hour). The TypeScript types in `web/lib/replay.ts` are the contract; `pipeline/dw/export.py` writes it.

## Data sources and licences

| Data | Source | Licence or terms |
|---|---|---|
| Fire detections (VIIRS S-NPP, archive and near real time) | NASA FIRMS | NASA open data; acknowledge LANCE FIRMS |
| Winds, rain, humidity | Open-Meteo historical forecast API | CC BY 4.0 |
| Airport visibility (2023 validation) | Iowa State University Mesonet, METAR archive | free use with acknowledgement |
| Peat extent | Global Forest Watch peatlands map (zoom 7 tiles) | per the dataset's page on Global Forest Watch |
| Population | WorldPop 1 km Indonesia, 2020 | CC BY 4.0 |
| Province and regency boundaries | geoBoundaries (gbOpen, IDN ADM1 and ADM2) | CC BY 4.0 |
| Basemap | OpenFreeMap, OpenMapTiles, OpenStreetMap contributors | OpenStreetMap data ODbL |

## AI tools and models

- **Claude Code** (Anthropic) wrote the code under the direction of the team, which set requirements, reviewed and ran it.
- **Nebius Token Factory:** `deepseek-ai/DeepSeek-V4-Pro-0813` and `MiniMaxAI/MiniMax-M3` write the bulletins (generated in advance and stored in the replay files) and answer the local chat.
- **scikit-learn** `HistGradientBoostingClassifier` is the persistence model.

## Statement of work

The handbook allows prior work if it is disclosed. Everything in this repository committed on 12 November 2026 was built before the build window (14 to 15 November) and is prior work:

- the full pipeline and web app (plan Tasks 1 to 12 and 14), the live deploy, and the tests;
- background research, the 2023 replay accuracy test, the 2019 to 2025 model experiments (the visibility correction that was dropped and the persistence model that was adopted), the data-source check, the design spec, the build plan and the pitch deck, all kept in the wider project folder outside this repository.

On 12 November an accidental `rm -rf .git` deleted this repository's history. The files were intact; the first five tasks were recommitted as one commit (`77e4956`), so the history begins there.

Reachability (distance from each fire to the nearest road or river) was built but not switched on: the public Overpass servers failed on 12 November, including a retry over three mirrors. `pipeline/dw/reach.py` remains in the repository, unused.

**Built during the event (14 to 15 November):** to be completed at the end of the build.

## Future work

- Reachability from the Geofabrik Kalimantan OpenStreetMap extract, read locally instead of through Overpass, to grey out fires far from any road or river.
- A pilot morning with one provincial task force.

## Licence

MIT. See `LICENSE`.
