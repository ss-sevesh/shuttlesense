# Bounded pretrained shots and near-player ending review

Requested implementation: pretrained shot names with no LLM/training, classification
frames after the preceding hit, and visible near-player behaviour/separation before
rally endings. User clarified: include preparation after the previous hit, current
hit and follow-through. End review must account for lateral separation and lack of
a visible attempt, without claiming to know intent.

## Implementation

Existing official pretrained BST-0 checkpoint is reused with its SHA-256 check,
strict state loading, eval and inference mode. MediaPipe33 maps to COCO17 joints
plus19bone vectors; both players are internal context and only near-side predictions
are displayed. TrackNet supplies raw observed shuttle positions. The installed
BST-0 consumes joints/bones and shuttle trajectory, not court position.

`shot_window` begins at least one frame after the preceding detected contact and
ends before the following detected contact, camera-segment boundary or provisional
rally end. The current hit must be inside it. Pose matching is confined to that
same interval. Windows are bounded to 1.5s preparation and 1.75s follow-through;
the last contact gets up to0.5s follow-through. Unresolved contacts, outside-play
candidates, identity switches, too-short windows, insufficient two-player/pose/
shuttle coverage and scores below0.5 abstain. Missed true contacts and false hit
candidates still affect windows. Model score is not measured accuracy. Shot replay
now uses the exact classifier interval rather than a fixed surrounding clip.

`shot_hits` retains far contacts as boundaries/context; near-only hit-pose evidence
remains separate. The existing broadcast-aware focused pipeline now supports
shots whenever LLM is off, preserving line fitting, scene cuts, rally division and
ground observations. Shots request both-player MediaPipe and the existing zoomed
far detection ROI. The legacy LLM path remains explicit opt-in.

The new independent `ending` switch requires ground, pose, shuttle and YOLO
dependencies. It defaults off and old six-switch saved reports remain readable.
Each known possible ending examines at most the last2s strictly before the stop.
Unknown endings get no failed-return judgment. Gaps, cuts, off-screen observations,
unreliable landmarks, identity changes and an insufficient continuous final tail
produce Unknown. Closest observed wrist-to-shuttle separation is reported in pixels
and player-box heights, with torso-relative camera-left/right offset and simple
arm posture. Threshold-based visible wrist movement near the shuttle indicates a
possible reach/swing; projected torso movement toward it indicates approach.
Large lateral separation without a clear attempt is explicitly distinguished from
a visible reach. This is observable evidence, not an intended shot, physical reach,
metres, legal in/out, confirmed racket contact or a proven decision to let it pass.
Ground stops can occur after bouncing/rolling and include pickup movements.

Ending evidence timestamps pause with a dashed wrist-to-shuttle overlay; replay
shows the inspected interval and uses existing auto-scroll. Exports include
`classificationWindow` and `endingReview`. API review validation covers new timing,
identity references, numeric ranges, geometry and labels while preserving legacy
reports. Prior saved analysis is preserved.

## Approved Paris434 verification

Only original84s Paris350_434 used, SHA-256
`8a1220a5b75f746bbf9efbf3bdbae32676b5b51e7a7b78cc1fdeecf1767c957d`.
New saved job `c278680c-fb33-4b1c-91d1-8daa17db95f6` reuses normalized video,
TrackNet/ground observations and court markings from463e4a85. Near poses and all
35hit-pose timestamps, five rally windows and ground stops are asserted unchanged.
An actual YOLO/ByteTrack/MediaPipe two-player far-ROI context pass took318.1s.
Its far observations are merged into the preserved near samples, with a separate
ID namespace. Closed-up frames remain excluded. Pretrained CUDA BST took0.97s:
74candidates,44scored,25near candidates with12accepted and13Unknown. Accepted
near labels:5lift,3net shot,2smash,1drive,1defensive net shot. These counts are not
accuracy or independently confirmed strokes; pickup/false contacts remain possible.

Three unknown endings abstain. Both known possible stops have reach/swing evidence:
window3 closest frame1184/39.466667s,48.1px/0.268boxheights; window5 frame2416/
80.533333s,130.6px/0.722boxheights. Visual temporal sheets inspected around both
endings. Opposite-side/no-attempt is covered by synthetic regression, not a labelled
real instance in this clip. Original analysis and private footage/models stay local.

Build/typecheck and6focused Playwright checks pass: source/options, dependencies,
old saved434reviews, boundaries, labels, pause/distance overlay, bounded replay,
auto-scroll, heatmap/rewind, JSON export, My Matches, noLLM, a11y and clean JS errors.
Python tests cover9BST adapter/window cases,4ending cases,8contact cases, scene/rally
logic and line/pose joins. Node option and report trust-boundary checks pass. No
unapproved footage tests, full TrackNet/ground rerun, training or LLM invocation.

Sources: [official BST repository](https://github.com/Va6lue/BST-Badminton-Stroke-type-Transformer),
[pinned inference example](https://github.com/Va6lue/BST-Badminton-Stroke-type-Transformer/blob/fb9b310bf4c8a8e3d89c75e61bc06a7ac3de62df/stroke_classification/main_on_shuttleset/bst_infer.py).
