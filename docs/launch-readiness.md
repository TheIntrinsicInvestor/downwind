# Launch readiness — 14 November 2026

One app, with the demo using the existing September replay. The public site is
already deployed at https://downwind-sigma.vercel.app. New local changes are
not published because both Git push and the connected GitHub write API returned
403. Restoring repository write access is the immediate blocker.

## Required before calling the daily live app ready

- [ ] Publish and review the local snapshot-validation and browser-validation
  changes. Publication must reject incomplete payloads; refresh failures must
  retain the last good snapshot.
- [ ] Publish and visually check the coastline/border update on desktop and
  mobile. This environment cannot load the basemap service (HTTP 403), so
  browser visual verification remains outstanding.
- [ ] Confirm the deployed app reads the latest manifest and matching files.
  Check Live, all replay dates, a selected fire, playback, Protect, and Limits.
- [ ] Exercise feed outage and recovery in the deployed preview: preserve the
  previous update, show unavailable/stale status, and recover on the next poll.
  For a first-load outage, clearly identify replay fallback as replay.
- [ ] Observe an unattended scheduled morning publication. The latest successful
  run found was the manual 14 November run at 14:25 UTC; that does not prove the
  next scheduled run will succeed.
- [ ] Review detection-history PR #9 for the consecutive-day and fire-age inputs.
  It is a separate open change; do not claim complete 14-day history until it
  has been integrated and accumulated enough observations.
- [ ] Assign someone to check failed/stale morning updates and establish the
  manual workflow rerun procedure. Verify upstream access/quota behavior.

## Evidence and limits

- Existing publication commits payloads and manifest together on `live-data`.
  A failed build cannot advance that manifest.
- Browser polling has a 25-second timeout and retains the last successful
  snapshot; stale status begins after the following morning's publishing window.
- Local tests exercise invalid manifests, malformed panel inputs, missing HTTP
  payloads, invalid fire references, partial frames, rollback prevention, and
  recovery. They do not prove long-term upstream availability or substitute for
  a deployed browser check.
- The optional local OSM reader has fixture tests; full Kalimantan extraction
  and map spot-checks are still required before app integration. It is not
  connected to rankings and is not a launch dependency.
- Current automated live builds do not apply persistence weighting. Keep this
  explicit. Enabling it is a separate decision involving saved model inputs;
  no model, training, simulation, or ranking changes are authorized here.

## Health context and optional AQI track

PR #5's `addon-prompts (1).md` proposes relative smoke burden, arrival/peak,
expected duration, and protection information. It contains instructions, not
an implemented feature. Several proposals depend on model/ranking changes
that are excluded by the user's instruction.

Today Protect shows contributing fires, relative shares and first arrival.
These shares cannot be compared as absolute smoke density between places.
The current smoke index is not concentration, AQI, or a prediction of health
outcomes. No verified AQI provider or station coverage has been established.

A separate observed-AQI layer can be built without changing the model:

1. Verify a provider's West Kalimantan station coverage, update frequency,
   access terms, licence, and available pollutants.
2. Choose and label the index standard (e.g. Indonesian ISPU versus US AQI).
   Do not mix index values or convert raw PM2.5 without the required averaging
   period and specified breakpoints.
3. Fetch readings server-side; cache them and preserve source, station,
   pollutant, observation timestamp, and index standard.
4. Show observed readings separately from the modelled smoke overlay. Mark
   missing/stale readings; never turn absent data into a good-air reading or
   assign a station's reading to an entire province.
5. Verify failure recovery and check any health wording against the selected
   standard's published guidance.

A first observed-data integration may take one or two development days **after**
a usable feed and access are confirmed. Predicting AQI from the existing smoke
simulation requires concentration estimation and independent validation and is
outside the no-model-change scope. Neither AQI nor the larger add-on proposal
needs to block a limited launch of the existing product.
