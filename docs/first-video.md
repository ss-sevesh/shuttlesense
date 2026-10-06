# First real-video feasibility experiment

Date: 2026-10-07. Desktop source and fictional results remain unchanged.

Follow-up: [white-shirt tracking experiments](white-tracking.md) add a native
tracker baseline, detector-assisted correction, and a verified same-angle edit.
The detector-only measurements below describe the earlier first run.

## Source and test scope

The user supplied local `videoplayback.mp4` and confirmed permission for analysis
of the downloaded footage. Treat the whole source as tuning material; no held-out
set exists. Do not publish or redistribute the footage as part of this experiment.

- H.264, 1280x720, 30 fps, 790.833333 seconds, 31,271,379 bytes.
- SHA-256: `1bcff860955845a3834e33d734836f6ec4463b93cc9240646b14c386f7fe193d`.
- Entire file decoded successfully: 23,725 frames. FFmpeg vfrdet reported zero
  varying frame intervals across 23,724 comparisons; stream start is 0.
- Broadcast singles play, white-shirt and blue-shirt players; side change visible
  in the full-file contact sheet. This is not the supported stationary-phone
  recording contract or a representative dataset.

## Baseline and provenance

Official [YOLOX-Tiny ONNX release](https://github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0),
416x416 input, person class only, score 0.3, NMS 0.45. The
[official ONNX demo](https://github.com/Megvii-BaseDetection/YOLOX/tree/main/demo/ONNXRuntime)
documents preprocessing and raw-head decoding. This runner uses the existing
ONNX Runtime 1.30.0 CPU provider, 4 threads, NumPy 2.5.3, OpenCV 5.0.0; no new
packages, GPU setup, training, or Ultralytics dependency.

Model SHA-256: `427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7`.
The YOLOX repository's [license](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/LICENSE)
is Apache-2.0; its license copy is saved beside the official release weights in
ignored `data/models/`. Official pretrained examples are COCO detectors; this run
uses weights only, not the training dataset. No separate weight license was found
in the checked release documentation. Retain provenance and review redistribution
terms before shipping model assets; this local experiment does not settle those
terms or source-video rights for a public product.

## Measured results

First run: source interval `[0, 180)` seconds, 1 Hz sampling using decoder times.

| Measurement | Result |
| --- | --- |
| Decoded frames in test passage | 5,400 |
| Sampled inference frames | 180 |
| CPU session initialization | 0.051 seconds |
| Decode + inference + review-image output wall time | 17.423 seconds |
| Preprocessing + inference + postprocessing total | 6.789 seconds |
| Mean preprocessing/inference/postprocessing per sampled frame | 37.7 ms |
| Peak RAM / GPU memory | Not measured / GPU not used |
| Identity accuracy, switches, tracking coverage | Not measured; no tracker yet |

The original first-run wall timer included file-hash computation at the end
(excluded in the updated runner). This small local timing is not a full-frame-rate
tracking benchmark or processing budget; repeat after adding the actual tracker.

Native detector rectangles visibly cover both players in reviewed samples at
0-11 seconds. Officials are also detected, sometimes with multiple overlapping
boxes. Raw person counts across 180 sampled frames: 1 detection in 9 frames,
3 in 1 frame, 4 in 29, 5 in 97, 6 in 32, 7 in 12. These are **not** player recall,
identity accuracy, or valid court-track coverage. Most sampled predictions still
need source-reviewed labels. No rally outcomes or coaching conclusions were inferred.

Manual initial-frame singles-court corners, in decoded pixels:
far-left `(413,241)`, far-right `(873,239)`, near-right `(987,687)`, near-left `(276,692)`.
These approximate selections map the white player's box-bottom proxy to
`(0.661,0.796)` and the blue player's proxy to `(0.454,0.282)` in near-side
normalized coordinates. This is a geometry demonstration at t=0, not a measured
position-error result. Ground-contact points and independent line intersections
still need labeling; never reuse this calibration across camera changes unreviewed.

## Recording failures and next experiment

FFmpeg scene score >0.25 proposed 78 full-file change candidates. They are not
78 verified camera cuts or rally boundaries. Source frames at 41.5 seconds show
a player close-up; at 42.6 seconds the full-court view returns. A single continuous
homography/identity trace across this span would be invalid. Full-file sampled
views also show changes in camera framing and a player side change; exact
calibration/orientation intervals remain unannotated.

Next: annotate visible player identities and ground contacts in the 0-40 second
court-view passage, confirm calibration on independent line intersections, then
evaluate an existing tracker inside each reviewed continuous camera segment.
Reset on cuts, preserve gaps, ignore officials only through reviewed court/player
selection, and verify identity after recovery and side changes. Keep edited
broadcast results separate from representative phone-video validation. A qualified
coaching reviewer and the plan's full evaluation set are still needed before
Checkpoint A passes.

## Reproduce and inspect locally

The model is at `data/models/yolox_tiny.onnx`; the video stays at the workspace
root and is ignored by Git. Use a new output directory for each run:

```sh
python analysis/test_feasibility.py
python analysis/detect.py videoplayback.mp4 --model data/models/yolox_tiny.onnx --output data/feasibility/baseline-rerun --end 180
```

Private outputs include `data/feasibility/baseline-180s/detections.json`, annotated
JPEGs, `detection-review.jpg`, `contact-sheet.jpg`, `initial-calibration.json`,
`initial-calibration.jpg`, and source cut-review frames. Nothing is wired into the
desktop dashboard or its downloads. Synthetic regression checks cover preprocessing,
raw-head decoding, thresholding, duplicate suppression, person-class filtering,
annotation validation, geometry, and side reversal; real identity evaluation remains open.
