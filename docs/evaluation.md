# Tracking feasibility

The user supplied `videoplayback.mp4` and confirmed permission for the downloaded
footage. An offline detector baseline and initial manual court mapping have run;
see [the first-video report](first-video.md). It is edited broadcast footage,
with follow-up [white-player tracking tests](white-tracking.md). These have exposed
drift and same-angle edit failures rather than established full-match feasibility.
It is not a representative stationary-phone evaluation set. Tracking identity accuracy,
coverage, peak memory, and coaching agreement remain unmeasured. Tasks 1-3 and
Checkpoint A remain open; the desktop UI and fictional demo results are unchanged.

## Recording contract and environment

Start with consented singles footage: stationary landscape phone behind the
baseline, full singles court and both players visible, no zoom/camera movement.
Keep originals and annotations in ignored `data/` or outside Git. Record both
players' permission for analysis/review privately. The generated one-second
`tests/fixtures/preview.webm` is only a playback fixture, not evaluation footage.

Provide several continuous rallies, movement across the court, occlusion, and a
side-change passage (or document its absence). Record camera height/angle,
lighting, codec, resolution, frame rate, variable-frame-rate status, and failures.
The proposed full set remains 10 recordings, 3 setups, and 100 annotated rallies.
Assign whole original recordings to tuning or held_out before tuning; excerpts
of the same source cannot cross splits. Keep a private inventory of setup ID,
split, permission reference, and source hash; manually check split consistency.

Observed on 2026-10-07:

| Item | Observed |
| --- | --- |
| CPU | i7-13620H, 10 cores / 16 logical processors |
| RAM | 16,890,519,552 bytes (about 15.7 GiB) |
| GPU | RTX 4060 Laptop, 8,188 MiB reported, driver 616.92 |
| Python | 3.14.7 |
| Import-tested packages | NumPy 2.5.3, OpenCV 5.0.0 (package 5.0.0.93) |
| Video tools | ffmpeg and ffprobe on PATH |
| Detector packages | torch and ultralytics absent |

`analysis/requirements.txt` records the import-tested geometry and CPU inference
dependencies, not a verified GPU stack. No packages were installed; official
YOLOX-Tiny ONNX weights were downloaded into ignored `data/models/`. Check any new model's
Python/PyTorch/CUDA compatibility and exact code/weight/dataset licenses before
installation; use an isolated environment if another Python version is needed.

## Manual annotations

Save one JSON per recording in `data/`. Times are seconds from original playback
start; intervals are half-open `[start_s, end_s)`. Outcomes refer to selected_player.
Player IDs identify people throughout side changes, not tracker IDs.

**Synthetic format illustration only**, not a consented or reviewed example:

```json
{
  "version": 1,
  "recording_id": "synthetic-format-example",
  "setup_id": "synthetic-setup",
  "consent_confirmed": true,
  "split": "tuning",
  "duration_s": 10,
  "frame_size": [640, 480],
  "players": ["p1", "p2"],
  "selected_player": "p1",
  "rallies": [{"id": "r1", "start_s": 1, "end_s": 3, "outcome": "unknown"}],
  "orientation": [
    {"start_s": 0, "end_s": 5, "side": "near"},
    {"start_s": 5, "end_s": 10, "side": "far"}
  ],
  "samples": [
    {"time_s": 2, "player_id": "p1", "visibility": "visible", "foot_px": [200, 300]},
    {"time_s": 2, "player_id": "p2", "visibility": "occluded", "foot_px": null}
  ]
}
```

Replace illustrative values from source footage; set consent true only after
permission is recorded. Uncertain outcomes/orientation remain unknown. Orientation
must cover the whole video, including breaks and unknown spans. Annotate both
players at each sample as visible, occluded, out_of_frame, or uncertain; only
visible samples have a ground-contact foot point in decoded pixels, others null.
Predeclare a regular sample rate (proposal: 1 Hz). Report dense occlusion and
side-change samples separately so oversampling does not skew headline accuracy.

```sh
python analysis/check_annotations.py data/recording-01.annotations.json
python analysis/test_feasibility.py
```

Validation checks structure, ordering, bounds, IDs, both-player coverage, and
unknown labels. It cannot verify permission, source duration, point accuracy, or
annotation truth: replay against the source separately. Regression checks use
invented geometry and labels; they do not measure tracking quality.

The separate [two-shoe review protocol](ground-contact.md#two-shoe-review-protocol)
defines a narrower movement target and a blank 27-sample packet. Its two-contact
`shoes_px` format is not the single `foot_px` format above; do not mix support-shoe
points with two-shoe midpoints when scoring. Independent labels remain pending.

## Court calibration

`analysis/court.py` uses the installed OpenCV four-point transform. Mark singles
baseline/sideline intersections in decoded pixels: far-left, far-right,
near-right, near-left. Save the corners and applicable interval privately.
Check independent service-line intersections: fitting corners is not an accuracy
measurement. `calibrate(corners, min_area_px2=100)` rejects nonfinite, crossed,
nonconvex, or degenerate geometry; the configurable area guard is not an accuracy gate.

`project(matrix, foot_px, side)` returns normalized full-court coordinates: x
increases toward the selected player's right; y runs from opponent baseline (0)
to own baseline (1). Both axes reverse for far-side play. Unknown side or invalid
projection raises an error; callers must abstain. Off-court points are retained,
never clamped. Interval selection and player identity are not inferred here.

Map ground-contact points only. A bounding-box bottom-center is a proxy to test
during jumps, lunges, and occlusion; box center is not court position. Lens
distortion or camera movement can invalidate a homography: record failures,
recalibrate by interval, or reject the input rather than hiding errors by smoothing.
Official references checked: [getPerspectiveTransform](https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html)
and [perspectiveTransform](https://docs.opencv.org/4.x/d2/de8/group__core__array.html).
The actual installed OpenCV 5 API imports and synthetic checks pass.

## First baseline experiment

Candidate only: a small pretrained person detector plus ByteTrack, supported by
[Ultralytics tracking docs](https://docs.ultralytics.com/modes/track/). Nothing is
selected or installed from Ultralytics; the first detector-only experiment uses
YOLOX-Tiny instead. Its [licensing page](https://www.ultralytics.com/license)
describes AGPL-3.0 and enterprise options; record exact adopted code and weights'
terms before selection. This candidate is not license-cleared for the project.

Select both player identities manually, calibrate, and compare predictions with
source-reviewed samples. Preserve decoder timestamps and invalid spans; frame
index / nominal FPS is insufficient for variable-frame-rate footage. Review
identity after gaps rather than trusting a stable numeric tracker ID.
Record model/weight hash, package versions, device, tracker config, thresholds,
decoded size, sampling schedule, calibration, and manual corrections. Measure
wall time, peak process and GPU memory separately, decode plus inference
throughput, and startup costs before proposing video limits. The desktop's
500 MB preview limit is not a measured processing limit.

Report per recording and aggregate:

- Identity correctness: correct selected-person predictions / visible annotated
  samples; missing predictions count as failures. Proposed gate remains 90%.
- Visible coverage: visible labels / all regularly sampled labels. Prediction
  coverage: valid predictions / visible labels. Also report identity correctness
  among emitted predictions, abstentions, identity switches, and invalid spans.
- Court error on independently labeled contact/reference points in normalized
  units, sample count, median, and high-percentile error. No mapping-error gate
  has been agreed yet.
- Runtime, memory, correction burden, occlusion/jump/side-change failures, and
  unsupported inputs. Exclude synthetic checks from all evaluation totals.

Do not declare feasibility from one clip or lower the plan's gates to pass.
Checkpoint A also needs a real qualified coach-reviewed evidence-to-drill example:
contact/context times, valid tracks, outcomes, observation, qualified interpretation,
drill setup/repetitions, and abstention rules. Record reviewer credentials and
disagreements privately. Movement alone cannot establish late arrival, clear depth,
or causation.
