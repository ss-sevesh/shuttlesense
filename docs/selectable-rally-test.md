# Selectable analysis and the Paris 350_434 test

Use only the workspace `Men's Singles Badminton FULL FINAL🏸 _ Paris Replays_350_434.mp4`
for real-video testing from 2026-10-10 onward. This is the 84-second, 60 FPS clip.
Do not substitute the 75-second `_350_425` clip or previous phone footage.

Before generating analysis, the upload panel now offers six switches:

| Feature | Default | Required features |
| --- | --- | --- |
| YOLO player tracking | On | None |
| Shuttle tracking (TrackNet) | On | None |
| Ground segmentation / possible touch | On | Shuttle |
| Body pose (MediaPipe) | Off | YOLO |
| Shot classification (BST) | Off | Body pose, shuttle |
| LLM coaching and contact-image extraction | Off | Shot classification |

Turning on a dependent feature enables its requirements; turning off a requirement
disables dependent features. The upload API and Python worker also validate these
dependencies. At least player or shuttle tracking must remain enabled. Options are
saved with the job, displayed in review and included in JSON export.

The default focused worker performs no contact analysis, BST classification,
contact-image extraction or Qwen/LLM call. It opens the Rally windows tab. The
before-landing LLM panel is hidden, and its POST endpoint rejects disabled jobs
with HTTP409. Existing saved legacy jobs retain their original review behavior;
new requests default to the focused configuration. Full shot/LLM analysis remains
available through explicit switches; these optional models were not rerun for
this test. Ground diagnostics are local segmentation masks/overlays, not LLM input.

## Broadcast handling

The video is normalized to30FPS. Six floor-line patches derived from marked court
corners identify the initial fixed court view (existing `video_edits.court_view`,
correlation threshold0.7, at least4matching patches). View changes and abrupt
pixel changes reset temporal context. Closeups receive no shuttle coordinates.
TrackNet runs independently on each accepted court segment, with separate
backgrounds and temporal ensembles. No TrackNet window crosses a broadcast cut.
YOLO/ByteTrack runs over the video; its player observations outside accepted court
views are excluded from review. With body pose off, no MediaPipe inference runs.
The existing YOLO11n-pose checkpoint supplies player boxes; its keypoint output is
unused. No new YOLO model, fine-tuning, dependency or plugin was installed.

Rally review windows group sustained observed shuttle motion (>=100px/s between
adjacent observed frames, at least0.3s worth of moving observations spanning>=0.5s).
After1.2s without accepted motion, replay is bounded at the last accepted movement
plus0.5s. Cuts also bound windows. These bounds are not ground-impact timestamps.
A possible ground stop within a window provides an estimated, unconfirmed ending.
The existing human window form remains the way to save observed boundaries.

## Measured result

Private job `60993f74-19c4-42d9-a80f-373c257952a5`:
[local review](http://127.0.0.1:3000/review/60993f74-19c4-42d9-a80f-373c257952a5).

- Source5040frames at60FPS ->2520normalized frames at30FPS.
- Court segments:0–20.900s,27.700–43.867s,52.233–83.100s.
- Excluded482frames/16.067s; shuttle proposals1496/2520frames, or73.4%of accepted
  court-view frames. Availability is not measured detection accuracy.
- YOLO pass79.7s; TrackNet segment passes51.4/40.6/74.0s (including loading,
  background decoding and inference); ground pass112.6s. Segmentation processed
  all2520frames, including closeups, but no shuttle is accepted there.
- Floor overlap512frames; mean predicted floor fraction37.1%. Two possible stops
  at40.200s/frame1206 and81.500s/frame2445. First rally has no qualifying ground stop.

| Window | Proposed start | Estimated end | Replay stop | Visual inspection |
| --- | --- | --- | --- | --- |
| 1 | 5.233s | Unknown | 17.100s | Main exchange |
| 2 | 19.833s | Unknown | 20.900s | Post-point activity; false rally candidate |
| 3 | 29.433s | 40.200s, unconfirmed stop | 40.733s | Main exchange |
| 4 | 41.800s | Unknown | 43.867s | Pickup/post-point activity; false rally candidate |
| 5 | 58.233s | 81.500s, unconfirmed stop | 81.933s | Main exchange |

Initial0.15s approach lookback missed gradual slowing on the floor. The
`floor_overlap_and_stop_v2` heuristic uses0.5s continuous approach history, keeping
the0.2s stationary floor-supported hold and4px stationary radius at720px height.
A new gradual-slowing regression fails with the old lookback and passes with0.5s.
The two stop candidates were recomputed from saved per-frame observations; the
segmentation and shuttle models were not rerun for this adjustment. Saved report
records `candidateRecomputedFromSavedObservations`. These are stop times after
deceleration/rolling, not exact first-touch times. This is development on this
one clip; no held-out evaluation or independent timing labels exist.

Distributed frames, candidate context strips and floor overlays were visually
inspected. The two short false windows demonstrate that automatic rally division
is not reliable yet. Pretrained segmentation has coarse boundaries and some
incorrect floor regions. Tracking misses and jitter remain. Camera movement,
view-patch errors, player identity changes, held shuttles and net/outside-floor
endings need further work. No accuracy percentage is claimed.

## Checks

```powershell
node analysis/test_analysis_options.mjs
python analysis/test_focused_rallies.py
python analysis/test_ground_landing.py
python analysis/test_player_pose.py
node analysis/test_analysis_review.mjs
node analysis/test_analysis_jobs.mjs
npm.cmd run typecheck
npm.cmd run build
npx.cmd playwright test tests/paris-rallies.spec.ts
```

The two focused browser tests use only350_434: switch defaults/dependencies,
submitted configuration, invalid-option rejection, saved real rally replay,
positive candidate display, disabled LLM API/panel, JSON export and accessibility.
The exact clip's model run also confirms zero poses/shots and no contact, angle,
image-extraction or coaching artifacts. Broader old real-video tests were not run
because their fixtures violate the new testing-footage restriction.

Initial dev-server tests were interrupted by rapid Fast Refresh reloads while job
files changed. Production-build reruns passed. Keep the production app running for
the review; this work does not claim the development reload issue was repaired.
Original footage, model weights, job outputs and screenshots remain ignored/private.
