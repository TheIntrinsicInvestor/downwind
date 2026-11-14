# Launch readiness

The [public app](https://downwind-sigma.vercel.app) offers a daily Live outlook and September replay. Use the replay for a repeatable demo.

## Already on main

- Daily publication at 07:12 WIB, append-only snapshots and last-good fallback.
- NOAA-21 detection history, season-gated persistence weighting, and forecast request timeouts.
- Road-only distance on fire cards, updated bulletin copy, and district-specific Protect arrival and peak fields. Historical snapshots may lack peak times.

## Review with this pull request

- Validate a complete snapshot before publishing. Check browser refresh failure, recovery, and rollback protection.
- Check coastline and borders on desktop and mobile using real tiles. Verify fire selection.
- Verify that model, smoke simulation and ranking code match main.

## Before operational launch

- Exercise Live, replay, Protect, fire cards and playback on the deployed release. Simulate a feed outage and verify the last-good view and recovery.
- Confirm unattended scheduled runs and assign ownership for stale or failed morning updates. Use the Morning feed workflow on main for a manual rerun.
- Monitor branch growth and upstream availability before changing the publishing cadence or storage.
- Pilot with a provincial task force. Validate district timing and compare weighted and unweighted smoke outputs against observations.

Protect shows relative modeled impact. Coverage is incomplete. It does not provide AQI or predict ground-fire spread.
