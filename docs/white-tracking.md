# White-shirt tracking experiment

The user selected the white-shirt player. These are local tuning experiments on
permission-confirmed `videoplayback.mp4`, not held-out accuracy results. Desktop
UI, fictional demo statistics, and downloads remain unchanged.

## Method in plain language

- **Manual seed:** mark a starting rectangle around the selected person. Source
  seed at t=0: x=696, y=334, width=84, height=226 pixels.
- **MIL tracker:** an installed OpenCV algorithm that updates this rectangle as
  successive frames arrive. It does not provide a calibrated identity confidence.
- **Drift:** the rectangle moves off the target while the tracker still reports
  success. Therefore its found flag is not an accuracy measurement.
- **Detector check:** at 5 Hz (every 0.2 seconds), the existing YOLOX-Tiny detector
  proposes person rectangles. Refresh MIL using one clearly overlapping rectangle.
- **IoU:** intersection divided by union, a box-overlap score from 0 to 1.
  Here a candidate needs at least 0.15 overlap and a 0.1 lead over the runner-up.
  These are configurable tuning values, not validated identity thresholds.
- **Abstention:** return a missing proposal if matching fails or is ambiguous;
  a new manual seed is required before continuing. No interpolation across this gap.

MIL processes every source frame, 30 fps. Its input is reduced from 1280x720 to
640x360 for this CPU test; proposal coordinates and review images use original
pixels. YOLOX uses its verified 416x416 input preprocessing. No new dependencies
or model weights were installed for these tracking experiments.

The [OpenCV tracker API](https://docs.opencv.org/4.x/d0/d0a/classcv_1_1Tracker.html)
documents manual initialization and found status. OpenCV's [license page](https://opencv.org/license/)
documents Apache-2.0 for current versions; YOLOX provenance is in [first-video.md](first-video.md).
The small overlap matching helper does not perform appearance re-identification.

## Observed results

| Experiment | Frames | Wall time | Finding |
| --- | --- | --- | --- |
| Plain MIL, `[0,12)` | 360 | 24.557s | Drift onto empty court around 9s; tracker found flag remained true throughout |
| MIL + detector checks, `[0,12)` | 360 | 29.808s | Selected white player enclosed in all 12 once-per-second review images |
| MIL + detector checks, `[0,40)` | 1,200 | 36.951s | Abstained at 12.6s after a source edit; 822 subsequent frame proposals missing |

Manual visual snapshot review: plain MIL follows the selected player at 0-8s
and misses his torso at 9-11s; assisted MIL follows him in the reviewed images
at 0-11s, including the lunge at 7s. This is an assistant visual review of 12
tuning snapshots per method, not exhaustive frame-level identity accuracy or a
qualified coaching review. The t=0 frame is manually seeded and is not an
independent tracking prediction. Neither 12/12 snapshots nor a true found flag
should be advertised as 100% accuracy.

The longer run exposes an edited-source discontinuity. Adjacent source frames
at 12.433333s and 12.466667s show a jump to the next rally, a score change,
and changed player positions while the court background remains similar. The
earlier global scene-score threshold 0.25 did not identify this edit. MIL kept
a stale rectangle; the next detector check at 12.6s found no overlap and stopped
proposals. At that frame, the detector still found the actual white-shirt player
with score about 0.85; this was an association failure across an edit, not evidence
that the player had disappeared. There were four stale proposals after the edit
and before abstention; those must be excluded in any reviewed results.

The run has 378 proposals and 822 missing samples (31.5% proposal availability).
That is not valid tracking coverage: some proposals are stale, frames include
breaks, and visible/untrackable ground truth is still incomplete. After the first
failure, all later proposals intentionally remain null until a new manual seed.
No court heatmap, shot labels, rally outcomes, coaching, or full-match movement
metrics have been produced.

CPU wall timing includes decode, resize, tracking, optional detector checks, and
review output; source hashing is excluded. The tracker_s subtotal counts MIL
initialization/updates, not detector validation and reinitialization. Peak native
RAM was not measured; the attempted external sample ran after process exit.
GPU was not used. Do not derive a processing budget from these short runs.

## Run and review

### Follow-up: restart after the first edit

The next experiment manually restarts at the verified edit frame, 374/30 =
12.466667 seconds. The selected person is still the user-chosen white-shirt player;
new source-frame seed: `(465,333,83,224)` in x/y/width/height pixels. Detector-check
thresholds and tracker settings were retained.

Result for `[12.466667,40)`: 826 source frames, 73.321 seconds CPU wall time,
55.943 seconds MIL subtotal, zero missing proposals. Private H.264 review video
is `data/feasibility/white-segment-02/review-h264.mp4`.

Assistant visual review at source times 13,15,17,19,21,23,25,27,29,31,35,39 seconds
found the rectangle following the white-shirt player in all 12 images. These are
distributed exploratory snapshots chosen for review, not a predeclared held-out
evaluation sample or proof that all 826 predictions have the correct identity.
Ground-contact accuracy, verified frame-level coverage, and peak RAM remain unmeasured.

`data/feasibility/white-segments.json` now records two separately seeded intervals:
`[0,12.466667)` and `[12.466667,40)`. Both have explicit break_before flags, the
same manually selected player label, and source run references. The first run's
four stale post-edit proposals are outside its recorded interval. Neither trail
may be connected across the edit. This record does not implement automatic edit
detection, automatic re-identification, or an accepted full-match result.

```sh
python analysis/track.py videoplayback.mp4 --output data/feasibility/white-segment-02-rerun --player-id white-shirt --box 465 333 83 224 --start 12.466666666666667 --end 40 --detector data/models/yolox_tiny.onnx
```

The private inspection check `python data/feasibility/review_segment_02.py`
verifies sample count, strictly increasing source timestamps, initial frame time,
consistent player label, nonmissing proposals, and identity labels remaining
unverified. It recreates the review sheet and segment record. Full identity
annotation and camera calibration per segment remain the next validation work.

Use a new private output directory on each run:

```sh
python analysis/test_feasibility.py
python analysis/track.py videoplayback.mp4 --output data/feasibility/white-rerun --player-id white-shirt --box 696 334 84 226 --end 12 --detector data/models/yolox_tiny.onnx
```

For a later manually reviewed segment, use --start/--end and --box selected from
its first decoded frame. The tracker does not automatically detect edits or
calibration changes; the requested interval must be reviewed for continuity.
Test camera cuts, same-angle edits, and side changes separately before accepting
tracks from a full match. An unchanged numeric player_id is not proof of identity.

Private review files:

- `data/feasibility/white-assisted-12s/review-h264.mp4`: playable 12s H.264 overlay,
  verified 360 frames / 30 fps / 12 seconds.
- `data/feasibility/white-mil-review.jpg`: initial drift at 9-11s.
- `data/feasibility/white-assisted-review.jpg`: corrected 0-11s review images.
- `data/feasibility/white-assisted-40s-review.jpg`: longer run with explicit gaps.
- `data/feasibility/gap-source-sequence.jpg`: adjacent frames proving the edit.
- `tracks.json` in each run directory: source decoder timestamps, proposed boxes,
  found status, detector checks, and unverified identity labels. New runs distinguish
  native found status from proposal availability; initial 12s reports predate this distinction.

Next: annotate continuous source segments and manual reseeds, label both players
and independently checked ground-contact positions, verify calibration per
segment, and measure identity correctness and coverage. Same-angle edits require
their own detection/validation effort if this broadcast recording type is to be
supported. Stationary phone footage and coach review remain required for the
original Checkpoint A; no gate has been marked complete.
