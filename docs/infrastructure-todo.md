# Downwind infrastructure progress

Checked against `main` and open PRs on 14 November 2026. This updates the
[original live-feed proposal](https://github.com/TheIntrinsicInvestor/downwind/pull/1).

## Completed on main

- [x] Build morning snapshots from incoming FIRMS CSVs (#3).
- [x] Configurable data/cache locations, optional keys, and portable builds (#4).
- [x] Separate morning ranking from historical validation (#4).
- [x] Python/web CI and a Python-to-browser export check (#4).
- [x] Prepare public geospatial inputs and display live snapshots (#6).
- [x] Refresh complete snapshots together; retain the last successful update (#6).
- [x] Show stale/unavailable feed status and preserve September replay (#6).
- [x] Schedule daily publication at 07:12 WIB to the live-data branch (#7).
- [x] Successful manual morning-feed workflow on 14 November at 14:25 UTC.

## Implemented on this branch

- [x] Validate the manifest, observation/forecast dates, complete 48-hour
  particle data, fire references, and limits before publishing.
- [x] Regression checks for truncated data, mismatched files, bad references,
  missing limits, and successful zero-detection snapshots.

## Remaining

- [ ] Review and integrate detection-history retention (#9). This is already
  being implemented on `feature/live-feed-archive`; do not duplicate it.
- [x] Replace the failed Overpass reachability fetch with optional local OSM
  extraction and separate road/water distances (local branch; not published).
- [ ] Validate those distances against real mapped locations before any
  display-only integration. PR #5 contains proposed tasks, not implementation.
  Its scoring/model/ranking changes are excluded by the user’s instruction.
- [ ] Confirm the next scheduled morning run succeeds, beyond the manual run.
- [ ] Check the deployed `/app` against the published snapshot, including a
  failed refresh, recovery, and mobile layout.
- [ ] Decide when to move payloads to object storage. The proposal suggested
  storage outside Git; the current implementation uses immutable snapshot
  directories on `live-data`. Define retention and expected storage growth
  before changing that working publishing path.
- [ ] Enable persistence weighting for automated live builds if required.
  `dw.live` currently supplies no persistence weather; this needs the team's
  saved model and matching weather inputs, then production validation.
- [ ] Finalize the README's event statement of work after the build window.
- [ ] Run a pilot morning with a provincial task force.

Intraday updates need an agreed observation cutoff and forecast start before
increasing the schedule. The current product is one morning outlook per day.
