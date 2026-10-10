# Near-side court markings and hit poses

Requested scope: highlight the near-side white court markings on video, and
show pretrained body pose at near-side hit candidate timestamps. Retain far-side
observations for rally timing. No LLM, training, or automatic in/out calls.

Implementation order:
1. Reuse calibration and accepted court-view segments to fit observed markings.
2. Reuse pretrained MediaPipe Pose Landmarker Full with near-side inference only.
3. Join existing wrist-motion/shuttle-distance contact estimates to same-frame poses.
4. Add overlay controls, timestamp seeking, bounded replay and JSON export.
5. Verify only the Paris `350_434` clip, preserve earlier saved results, and test
   geometry, missing evidence, frame joins and actual browser behavior.

## White markings

`analysis/near_evidence.py` rectifies the four approximately marked singles
corners to a top-down image using OpenCV. In each accepted court-view segment,
11 distributed frames contribute low-saturation bright pixels. Pixels observed
in at least 45% of those frames form a persistent white mask. Narrow search
corridors based on singles-court geometry locate both pairs of sidelines,
centre service line, short service line, doubles long service line and baseline.
Robust straight-line fits require spatial coverage and reject isolated clutter.
Absent evidence produces no line, rather than a template-only highlight.

The fitted endpoints are mapped back into video coordinates. Cyan near-side
highlights are enabled initially, can be hidden independently, and disappear
outside accepted court-view segments. These are line-centre estimates guided
by manual calibration, not exact line edges or verified legal boundaries.
The method currently assumes a fixed camera and approximately correct singles
corners. Camera motion, bad calibration and different court colours can fail.

## Pose and timestamps

The existing official pretrained MediaPipe Pose Landmarker Full checkpoint
(`data/models/mediapipe/pose_landmarker_full.task`) supplies 33 body landmarks.
YOLO/ByteTrack still tracks both player boxes; focused analysis passes
`--near-pose`, so far-player poses are not inferred. Only near-player evidence
is shown in the saved review. The Body pose generation switch now defaults ON;
shot classification and LLM remain OFF. Existing explicit saved switches retain
their values. Court-line fitting is part of court setup; its display has a toggle.

Existing `contact_frames.py` finds near-player wrist-motion peaks near shuttle
observations and refines their +/-0.2-second windows with a bracketed wrist-to-
shuttle distance minimum. Accepted minima are `estimated_contact`; unresolved
peaks are `swing_candidate`. Neither proves racket impact or identifies the
racket-holding hand. Arm-position descriptions compare the candidate wrist with
its shoulder/hip when landmark confidence is >=0.5; they do not classify shots.
Elbow and body-lean angles come from the selected frame. Missing evidence stays
unknown. Close-ups are excluded from both line overlays and pose events.

The timestamp list displays seconds to three decimals and the source frame
number on the normalized 30 FPS timeline. Selecting a timestamp pauses at that
frame; replay provides surrounding movement. Precision is not measured contact
accuracy: a 30 FPS frame spans about 33ms, and the contact proxy can be wrong.
Pickup/tossing and opposite-arm peaks can produce false hit candidates.
Exports include `courtLines` and `hitPoses`, separately from classifier shots.

Timestamp and bounded replay buttons scroll the video into view. Smooth scrolling
respects the browser's reduced-motion preference. The movement heatmap now uses
only positions elapsed at the current playback time, including between points:
playing adds heat, seeking back rebuilds it, and a yellow dot marks the current
approximate player position. It uses saved tracking, not new live inference.

Sources: [OpenCV geometric transformations](https://docs.opencv.org/4.x/da/d6e/tutorial_py_geometric_transformations.html),
[Google Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker).

## Verification

Synthetic checks cover all eight markings, missing white pixels, isolated
clutter, partial occlusion, pose confidence, exact-frame joins and exclusion
of far-player / non-court evidence. Report validation checks line endpoints,
time bounds, pose-event frame/timestamp identity and angle ranges. Browser
checks cover the actual Paris report, overlay toggling/cut hiding, pause-at-
timestamp, near-only boxes, replay, exports, absence of LLM and accessibility.
No independently labelled court edges, poses or racket contacts are available;
visual checks and these tests cannot establish model accuracy.

Actual full run: job `463e4a85-6672-4c80-8c47-5ba25b21da38`, exact Paris
`350_434` source hash `8a1220a5b75f746bbf9efbf3bdbae32676b5b51e7a7b78cc1fdeecf1767c957d`.
All 2520 normalized frames processed. Eight fitted markings in each of three
court segments. 2004 near-player pose frames after excluding close-ups; no
far-player pose inference. 35 pose/contact candidates: 20 refined distance
minima and 15 unresolved swing seeds. This is availability, not hit accuracy.
Visual contact-sheet inspection shows opposite-arm and pickup false candidates.
Five rally windows and ground-stop candidates at 40.20/81.50s remain unchanged.
YOLO/near pose took 145.9s and the floor pass 111.5s; no new weights, packages,
training or LLM invocation. The earlier rally-only job remains intact.

Open [local review](http://127.0.0.1:3000/review/463e4a85-6672-4c80-8c47-5ba25b21da38).
Private visual audits under `artifacts/`: `paris434-lines-{0,1,2}.png`,
`paris434-hit-poses.jpg`, and `paris434-near-review.png`.
