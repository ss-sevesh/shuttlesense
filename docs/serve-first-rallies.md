# Serve-first prototype

The user chose unedited, upright, fixed-camera singles footage as the prototype
contract. The default serve experiment skips edit detection. Suggestions are
for human review; no labeled dataset or accuracy claim is required to run it.

`analysis/serve_rallies.py` reuses YOLOX detections, TrackNet proposals and the
installed RTMPose whole-body model. There are no new dependencies. RTMPose is
used instead of adding MediaPipe; this is a hand-written readiness cue, not a
trained Random Forest or a service-fault classifier.

## Rules

- Choose the highest-scoring court person in each half. These are approximate
  player proposals, not persistent identities.
- Look for diagonally opposed positions, low box-bottom movement (below 0.3
  body heights/s), visible body landmarks, and at least one low-wrist posture.
  Hold the preparation cue for at least 0.4s. Receivers may crouch; players do
  not have to return to the exact centre or baseline.
- Look for consecutive observed shuttle movement from a proposed server's box
  toward the receiver within 1.5s. Require at least 0.06s of directional movement,
  50 px/s speed and displacement of 0.2 server body heights. These are tuning
  thresholds, not measured guarantees. Record movement onset as a possible serve.
- Look backward for a completed two-second window of stationary shuttle
  (within 12 pixels of its anchor) and low player-body movement. Previous active
  player/shuttle motion must have been observed. The quiet window must finish
  before the next serve setup starts; otherwise the previous ending is unknown.
- Misses interrupt stationary evidence. Sample gaps reset state. Adjacent
  explicitly unedited TrackNet chunks can be joined, but stationarity and launch
  evidence cannot bridge their inference boundary. An already completed quiet
  interval can still be inspected retrospectively across such a boundary.

The shuttle's position is a 2D proposal, not a measured ground contact. Low wrists
do not establish legal service or racket position. A player waiting or pausing
during play may resemble service preparation. Users must review the candidates.

## Current private result

`data/feasibility/serve-first-unedited-review-01/` examines four full-court excerpts
totalling 56.5s: [0,12.466667), [12.466667,27), [27,41.5), and
[59.633333,74.633333). They are excerpts from the existing edited broadcast;
future input should satisfy the user's unedited contract. The default runner did
not inspect edits. TrackNet produced 1,338 proposals over 1,695 frames in these
excerpts; counts are not accuracy measurements.

- One provisional near-side serve at 60.266667s, with setup from 60.0–60.6s.
- Brief setup cues at 0.2–0.4s and 12.8–13.0s; insufficient hold for acceptance.
- One isolated setup cue at 61.4s without an accepted launch.
- No completed quiet/stationary ending windows. Previous ending and final rally
  end are null. The review stop at 74.633333s is an analysis bound, not a point end.

Pose snapshots were inspected, and Chrome verified original-video decoding,
candidate seek/play/replay/end pause, byte-range responses and denial of unrelated
files. The sequencing tests cover combined cues, missing observations, moving
shuttles, pose absence, resets and chunk boundaries. Human verification pending.

## Run on the existing scene without edit detection

```powershell
data/tracknet-env/Scripts/python.exe analysis/shuttle.py videoplayback.mp4 --assume-unedited --start 59.633333 --end 74.633333 --output data/feasibility/new-shuttle-run
python analysis/serve_rallies.py videoplayback.mp4 --detections data/feasibility/rally-motion-100s/detections.json --corners 413 241 873 239 987 687 276 692 --shuttle data/feasibility/new-shuttle-run/shuttle.json --output data/feasibility/new-serve-review
python analysis/serve_review.py data/feasibility/new-serve-review/review.html --video videoplayback.mp4 --port 8002
```

Use fresh output folders and the actual corners for each new video. TrackNet runs
remain bounded to 15 seconds each; pass adjacent raw reports in timestamp order
to review longer unedited footage. Person detections must cover the same interval.
Optional `--edits` supports previous experiments; it is unnecessary for the
unedited prototype. `--quiet`, `--stationary-px` and `--setup-hold` are explicit
tuning inputs.

Open http://127.0.0.1:8002/review.html while the helper runs. Avoid `file://`:
the review page uses the helper's `/source.mp4` route for reliable browser seeking.
The helper exposes only the named review HTML and source video on loopback.
Results and footage remain ignored/private. This experiment is separate from the
upload dialog; connecting it to uploaded-video results remains a later slice.

Checks: `python analysis/test_serve_rallies.py`, `python analysis/test_rallies.py`,
`python analysis/test_feasibility.py`, and
`data/tracknet-env/Scripts/python.exe analysis/test_shuttle.py`.
