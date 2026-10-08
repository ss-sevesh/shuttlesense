# Tracked pose and shot prototype

## Upload and review in the app

Open `http://127.0.0.1:3000`, choose **Upload Match**, select a recording under
100 MB, mark four court corners and select **Analyze Shots & Rallies**. The
separate **Show boxes & heatmap** button retains the short CPU preview.

Full analysis runs locally in a persisted job, normalizes the entire recording
to 30 FPS, then runs ByteTrack/MediaPipe, continuous TrackNet and pretrained BST
sequentially. The review shows synchronized boxes, landmarks and shuttle
proposals; player IDs, joint angles and wrist speed; heatmaps; candidate shot
types, scores and rejection reasons; and possible rally windows. Missing values
remain unavailable. Scores are not accuracy, and unknown endings stay unknown.

Each contact has bounded replay and a manual label, including **Not a playing
shot / shuttle toss**. Rally windows accept manually observed start/end times.
**Save** keeps corrections in this browser without overwriting model evidence;
**Download reviewed JSON** exports both. Reviews are scoped to the analysis
fingerprint, including the original recording, calibration and model reports.
Jobs reopen at `/review/<id>`; uploaded and normalized copies remain in ignored
`data/analysis-jobs/`. This local prototype has no automatic retention cleanup.

`POST /api/analysis` accepts multipart `video` and `corners` (eight normalized
numbers), returning a job ID. `GET /api/analysis/<id>` returns progress and the
completed report; `/video` serves only that job's normalized recording with byte
ranges. Loopback and same-origin guards restrict access; one full analysis runs
at a time. Use upright, unedited singles footage. Maximum input is 4K/120 FPS;
analysis still takes minutes for a full match. Matching the existing full phone
recording and calibration within two pixels reuses its real saved inference.

Fresh six-second browser upload exercised all pipeline stages on CUDA and
produced 90 player samples and 180 shuttle rows. It contained no accepted hit
or rally starts; the UI displays zeros rather than fabricated labels. The full
320.5-second recording review uses the prior complete inference described below.

This local, fixed-camera singles experiment combines a person detector and
ByteTrack identities, per-player MediaPipe landmarks, existing raw TrackNet
observations, and an actual pretrained BST-0 classifier. The discarded Hugging
Face analyzer's pipeline is not used. See [player setup](player-pose.md) and
[checkpoint/input details](bst-shots.md).

Latest user rule: start only when the near-side player's serve posture is
observed and followed by shuttle launch. Opponent readiness and obscured wrists
cannot substitute. Motion/BST predictions without that start stay outside play;
they are retained for inspection and do not create activity-window rallies.
A completed quiet/stationary ending closes an interval even without a next
serve. Later pickup/toss/walking candidates are excluded until another accepted
near-side serve. A physical ground contact is not measured by 2D TrackNet;
undetected endings remain uncertain. Casual tracked footage now permits
opposing court halves including baseline positions (0.1 court margin), rather
than requiring formal diagonal service boxes. Both visible bodies, low floor
motion and the near player's observed readiness/launch remain required. The
shared older serve runner retains diagonal positions by default.

The user supplied `WhatsApp Video 2026-10-08 at 7.09.26 PM.mp4` locally. Its
variable frame timing was normalized to a complete 320.5s, 30fps analysis copy
(9615 frames, 832x464). Original footage is untouched; analysis audio is omitted.
Private artifacts and original/CFR hashes are under
`data/feasibility/whatsapp-rallies-01/`. Manual corner coordinates approximate
the floor lines; slight handheld motion remains a limitation.

The entire TrackNet pass uses `analysis/shuttle_stream.py`, official eight-frame
checkpoint and continuous stride-one overlap averaging. Heatmaps are finalized
only after every contributing window, including the tail. Frame decoding and
CFR timestamps are checked; no chunks, omitted rows or inpainting are used.
Background sampling uses 41 resized frames to bound memory, which differs from
the original short-clip preprocessing. Actual run: 9615 frames, 2403 visible
proposals, 667.76s wall time; 25% proposal availability is not accuracy. Visual
spot checks include real yellow shuttle detections, but misses remain frequent.

Full-video player command (weights/environment already prepared):

```powershell
data/player-pose-env/Scripts/python.exe analysis/player_pose.py data/feasibility/whatsapp-rallies-01/input.mp4 --end 320.5 --imgsz 640 --far-roi 220 35 430 240 --allow-reacquisition --tracker analysis/bytetrack-phone.yaml --corners 327 178 530 178 798 388 61 388 --output data/feasibility/whatsapp-rallies-01/players.json
data/tracknet-env/Scripts/python.exe analysis/shuttle_stream.py data/feasibility/whatsapp-rallies-01/input.mp4 --assume-unedited --output data/feasibility/whatsapp-rallies-01/shuttle.json
```

Provisional reacquisitions are explicit. Missing/changed IDs reset rally cues;
BST windows spanning a side's ID change abstain, including changes where pose
landmarks are missing. A following serve from another identity epoch cannot
supply the previous interval's ending.

Full phone result: 4808 pose samples, near boxes4808/4808 and poses4807;
far boxes4394/4808 (91.4%) and poses4254. Runtime936.391s. Sixteen provisional
far-ID recoveries are explicitly recorded. These figures measure availability.
There are111 candidate contacts. Actual BST inference ran85 windows in2.02s:
23 experimental labels and88 unknowns (10 ID-switch abstentions,16 insufficient
tracking,62 classifier results requiring review).

Seven near-side starts remain after enforcing completion of the0.4s posture
hold before launch:34.433,62.867,165.167,207.933,279.667,290.667,312.800s. None has
a qualifying ending. Therefore there are zero complete rally cuts. The97
contacts inside unknown-ending windows are `end_uncertain_review` and excluded
from playing-hit counts;14 contacts remain outside play. These windows can
still contain walking or tossing. The prototype cannot yet reliably split this
recording into complete rallies.

Review http://127.0.0.1:8005/review.html, private final folder
`data/feasibility/whatsapp-rallies-01/final-v2/`. Its ZIP contains seven explicitly
labelled review windows, a clip manifest with original/CFR provenance and the
actual report. MP4 durations and archive CRCs were checked. The page shows the
entire overlay, boxes/skeletons/shuttle proposals, angles, occupancy maps and
bounded event replay. HTTP serves only the supplied page, video and optional ZIP.

```powershell
python analysis/serve_review.py data/feasibility/whatsapp-rallies-01/final-v2/review.html --video data/feasibility/whatsapp-rallies-01/final-v2/overlay.mp4 --archive data/feasibility/whatsapp-rallies-01/final-v2/rallies.zip --port 8005
node analysis/test_full_tracked_review.cjs http://127.0.0.1:8005/review.html data/feasibility/whatsapp-rallies-01/final-v2/results.json
```

Chrome verified320.5s duration, seeks near start/middle/end, bounded event pause,
pose measurements, both maps, MP4/ZIP byte ranges, unrelated-file denial and no
page errors. Both replay and map screenshots were visually inspected.

Previous strict demo is `data/feasibility/tracked-rallies-near-serve-01/`, served
at http://127.0.0.1:8004/review.html. On this older clip it reports zero starts
and all 15 motion candidates outside play, since near-player wrists are
obscured during preparation. The results below describe the earlier fallback
experiment and are retained as a comparison, not the current rule.

`analysis/tracked_rallies.py` derives body-height-normalized motion, visibility-
gated elbow/knee angles, candidate wrist-motion peaks close to observed shuttles,
and serve-first intervals. Temporal suppression keeps only the strongest hit
candidate within 0.25s. These events are hypotheses, not verified contacts.
The suppression threshold can miss exceptionally fast successive exchanges.

The earlier fallback experiment's serve preparation needed diagonal positions, low floor motion and visible
torsos/legs for both players. If one player's wrists are obscured, a proposed
launch may be supported by opponent readiness plus shuttle movement from that
player's box. This opt-in fallback is recorded as `wrist_occluded_launch_proxy`;
the older serve runner retains its default wrist requirement. It does not
establish that the obscured player used a legal service posture.

Endings need completed two-second stationary-shuttle and quiet-player evidence,
followed by another serve. Where available, the boundary is suggested near the
last candidate hit before the quiet interval. Otherwise the end stays null.
Clip limits are replay stops, not point endings. Activity without an observed
serve has null start/end and is explicitly an activity review window.

Missing poses, identity changes and observation gaps interrupt cues. Both new
consumers reuse the existing raw-shuttle validator: inpainted coordinates and
omitted inference rows are rejected. All input video hashes must agree. BST
reports must match the exact pose/shuttle files and candidate-hit sequence.
Classification does not confirm a hit or override an uncertain rally boundary.

## Actual test

Source `videoplayback.mp4`, 59.633333–74.633333s, 450 frames. Player tracking
processes 30fps on CUDA; MediaPipe samples 15fps on CPU. IDs 1 and 2 were present
in all 225 sampled records. Near poses were available in 225; far poses in 223.
Tracking/pose runtime was 51.063s including shutdown timeouts. Cached TrackNet
observations were reused, not rerun. BST inference took approximately 0.56s.

Actual output: one provisional near-side serve at 60.266667s; 15 hit candidates;
six experimental shot labels and nine unknown/review results. The six labels
are lift, smash, net shot, smash, defensive net shot, defensive net shot.
No next serve or qualifying end was observed, so the rally end is unknown.
No full-match segmentation or classification accuracy has been measured.

Private final output: `data/feasibility/tracked-rallies-final-05/` contains
`results.json`, browser-playable `overlay.mp4` and `review.html`. The page shows
boxes, skeletons, observed shuttle points, sampled movement maps, current pose
angles, wrist motion and bounded event replay. Source times appear on event
buttons; the video controls use excerpt-relative times.

## Run with the prepared local inputs

Use fresh folders for each fusion output. The first run generates candidate
hits; BST classifies their windows; the final fusion attaches its predictions.

```powershell
python analysis/tracked_rallies.py videoplayback.mp4 --poses data/feasibility/player-pose-01/players.json --shuttle data/feasibility/serve-tracknet-unedited-01/shuttle.json --output data/feasibility/new-tracked-candidates
data/hf-racquet-env/Scripts/python.exe analysis/bst_shots.py --poses data/feasibility/player-pose-01/players.json --shuttle data/feasibility/serve-tracknet-unedited-01/shuttle.json --hits data/feasibility/new-tracked-candidates/results.json --output data/feasibility/new-tracked-candidates/shots.json
python analysis/tracked_rallies.py videoplayback.mp4 --poses data/feasibility/player-pose-01/players.json --shuttle data/feasibility/serve-tracknet-unedited-01/shuttle.json --shots data/feasibility/new-tracked-candidates/shots.json --output data/feasibility/new-tracked-final
python analysis/serve_review.py data/feasibility/new-tracked-final/review.html --video data/feasibility/new-tracked-final/overlay.mp4 --port 8004
```

The older strict test page is http://127.0.0.1:8004/review.html. Restart its
server with the tracked-rallies-near-serve-01 paths if it has stopped. Stop that specific
server before reusing the port. The existing upload UI is not connected to
this new experiment yet.

Checks: player selection/locked identities, BST normalization/order/padding,
hit suppression/missing data, occluded-wrist cue sequencing, raw gap/inpainting
rejection, existing shuttle/feasibility checks and Python compilation passed.
`node analysis/test_tracked_review.cjs` checks the prepared final demo in Chrome:
15s decode, event seek/play/end pause, rally replay, current pose measurements,
two movement maps, byte ranges, unrelated-file denial and no page errors.
The screenshot `artifacts/tracked-pose-rally-review.png` was visually inspected.

The main remaining risks are MediaPipe's difference from BST's training poses,
incorrect hit candidates and tracker identity loss on other footage. Scores
are uncalibrated; pose angles are image-plane estimates. No real-world speed,
service-fault, winner or coaching-quality claim is made.
