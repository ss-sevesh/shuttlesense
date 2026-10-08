# Tracked pose and shot prototype

This local, fixed-camera singles experiment combines a person detector and
ByteTrack identities, per-player MediaPipe landmarks, existing raw TrackNet
observations, and an actual pretrained BST-0 classifier. The discarded Hugging
Face analyzer's pipeline is not used. See [player setup](player-pose.md) and
[checkpoint/input details](bst-shots.md).

`analysis/tracked_rallies.py` derives body-height-normalized motion, visibility-
gated elbow/knee angles, candidate wrist-motion peaks close to observed shuttles,
and serve-first intervals. Temporal suppression keeps only the strongest hit
candidate within 0.25s. These events are hypotheses, not verified contacts.
The suppression threshold can miss exceptionally fast successive exchanges.

Serve preparation needs diagonal positions, low floor motion and visible
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

The ready test page is currently http://127.0.0.1:8004/review.html. Restart its
server with the final-05 paths above if it has stopped. Stop that specific
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
