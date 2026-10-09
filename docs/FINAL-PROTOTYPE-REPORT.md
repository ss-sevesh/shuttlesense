# ShuttleSense — Final Prototype Report

**Date:** 9 October 2026

**Project status:** Functional local prototype with experimental badminton analysis

**Conclusion:** The prototype demonstrates video upload, analysis, playback and evidence-based review. Reliable automatic racket–shuttle contact detection and coaching accuracy have not been established.

## 1. Objective

Develop a video-based badminton analysis prototype that helps a player inspect
movement, body pose and possible stroke events. The intended final system would
identify a hit, show the player's pose around that hit, classify the stroke and
provide useful coaching. This prototype implements the analysis and review
foundation and tests the feasibility of that intended system.

## 2. Delivered functionality

| Component | Delivered prototype behavior | Qualification |
| --- | --- | --- |
| Web application | Local Next.js interface with upload, progress, saved recordings and replay | Tested application flow; local setup required |
| Player analysis | Tracked players, pose observations and movement review | Tracking and pose correctness require visual validation |
| Court mapping | User-marked court corners and homography-based position mapping | Calibration quality affects the result |
| Shuttle tracking | TrackNet trajectory proposals aligned with source frames | Proposals can be missing or incorrect |
| Pose measurements | Joint-angle values linked to video observations | Image-space estimates; not validated 3D biomechanics |
| Candidate events | Near-player wrist-motion and shuttle-proximity windows | Possible events, not confirmed hits |
| Stroke classification | Actual official pretrained BST-0 inference with abstention | Experimental labels; no measured project accuracy |
| Local coaching | Qwen3-VL receives selected five-frame evidence windows | Experimental generated interpretation; human review required |
| Racket feasibility trial | Offline RTMDet-Ins-s detections, masks, distances and annotated replay | Separate experiment; insufficient for reliable contact timing |

The homepage error caused by unfinished job folders was corrected. Missing
status metadata is skipped while other errors remain diagnosable. Saved video
and analysis data were preserved.

## 3. Implemented analysis flow

```text
Uploaded video + court calibration
    → player tracking and pose observations
    → shuttle trajectory proposals
    → possible near-player swing windows
    → estimated wrist–shuttle contact evidence or unresolved result
    → linked pose measurements and experimental BST classification
    → selected image windows for local LLM interpretation
    → saved review with replay, measurements and uncertainty
```

The application uses MediaPipe pose observations. Its BST adapter maps 33
landmarks to the checkpoint's 17-joint layout and adds bone features. It does
not currently use ViTPose or HRNet. The selected BST-0 checkpoint consumes pose
and shuttle sequences; court-position features are prepared but are not consumed
by this variant. Its adapter produces a 100-frame sequence with valid-length
masking, rather than a generic 10–15-frame input.

The original [ShuttleSet dataset](https://arxiv.org/abs/2306.04948) contains
36,492 strokes from 44 matches. Those dataset statistics do not establish this
prototype's accuracy. The [official BST implementation](https://github.com/Va6lue/BST-Badminton-Stroke-type-Transformer)
requires matching input preparation. Our MediaPipe adapter introduces an
unvalidated difference from its training pose pipeline.

## 4. Basis for the swing windows

The implemented heuristic checks the near player, requiring wrist confidence
of at least 0.5 across three observations, incoming wrist speed of at least
0.8 player-heights/second and incoming speed at least equal to outgoing speed.
A nearby shuttle proposal must be within 0.6 player heights of the wrist.
Candidate scores combine motion and proximity; candidates within 0.25 seconds
are suppressed in favor of the strongest. Each retained seed receives a
±0.2-second search window: 13 frames at 30 FPS.

These thresholds are engineering heuristics. Visual review found preparation
and waiting among the selected windows, and missed swings have not been
measured. The LLM is invoked for selected usable evidence windows, not for every
video frame. A wrist-distance minimum does not prove racket contact.

## 5. Evaluation on the supplied recording

The saved recording contains **1,202 frames**, approximately **40 seconds**, at
**30 FPS** and **832 × 464** resolution. Its private analysis job is
`dd88779c-8a2f-406e-a2a3-ebdf90038b47`.

The existing application produced 14 near-player candidate windows. Four had
estimated wrist-distance frames: 160, 759, 872 and 1024; ten remained unresolved.
Four complete five-frame windows received local Qwen responses. Visual audit
did not establish those four estimates as physical impact frames, and the
suggested shot labels remained unknown.

A separate RTMDet-Ins-s COCO tennis-racket experiment processed every source
frame, then searched the same 14 windows for racket-mask distance minima:

| Trial measurement | Observed result |
| --- | --- |
| Source frames processed | 1,202 / 1,202 |
| Frames with a near-associated racket detection | 453 (37.7%) |
| Frames with usable racket–shuttle distance | 86 (7.2%) |
| Windows with a unique bracketed proximity minimum | 0 / 14 |
| Windows without distance observations | 7 |
| Windows with an unbracketed minimum | 7 |
| Detector time on RTX 4060 Laptop GPU | 58.1 seconds |
| Setup, inference and output time | 66.3 seconds, excluding rendering/transcoding |

**The percentages above measure evidence availability, not accuracy.** The
racket model missed visible and blurred rackets and sometimes boxed unrelated
body regions. Shuttle evidence was also unavailable during some relevant
movements. This baseline was therefore not integrated as a confirmed-contact
detector. The timing above is for the isolated racket experiment, not a measured
end-to-end upload processing time.

## 6. Verification completed

- Application typecheck and production build passed in the completed web-fix session.
- Fifteen distinct browser tests passed across batches, including actual upload/analysis flows; focused production checks also passed.
- Contact evidence and saved images were independently checked against source frames.
- Four racket-trial unit tests passed, covering mask distance, association, minimum selection and input alignment.
- An independent audit verified all saved mask shapes, recomputed all 86 distances, checked all 14 windows/strips and decoded the complete source and annotated videos.
- A mutation check verified that removing adjacent-frame evidence is caught by the tests.
- All fourteen racket image strips were visually reviewed. Playback, mobile layout and a clean review-page console were verified.
- Independent code review found no blocking defect for the saved-clip experiment.

These checks establish software behavior and output consistency. They do not
establish pose, stroke-classification, contact-timing or coaching accuracy.

## 7. Demonstration and deliverables

With the local servers running:

- Application: `http://127.0.0.1:3000`
- Saved recording: `http://127.0.0.1:3000/review/dd88779c-8a2f-406e-a2a3-ebdf90038b47`
- Racket experiment: `http://127.0.0.1:8006/review.html`

The saved recording demonstrates replay, pose measurements and experimental
contact/coaching evidence. The racket experiment demonstrates annotated video,
fourteen frame strips and conservative unresolved results.

Code is saved in the repository. Source footage, downloaded models, generated
analysis and audit artifacts remain ignored/private under `data/` and
`artifacts/`; cloning the repository alone does not reproduce these private
outputs. Reproduction and model setup are documented in
[racket-trial.md](racket-trial.md), [contact-frames.md](contact-frames.md) and
[bst-shots.md](bst-shots.md). The session history is in
[tasks/HANDOFF.md](../tasks/HANDOFF.md).

## 8. Limitations and future work

Exact contact is not always captured at 30 FPS: consecutive frames are about
33 milliseconds apart. Racket proximity in a single camera view can also be
misleading. Joint angles depend on pose quality, and court positions depend on
calibration. Model confidence scores are not calibrated correctness probabilities.
An 85–90% shot-classification or 90–95% contact-detection claim is not supported
by project evaluation.

The manual contact reviewer discussed with the user was not implemented before
project wrap. The recommended next phase is frame stepping, contact/unresolved
labels and adding missed swings. These labels should support evaluation on
separate recordings and subsequent badminton-specific racket/head fine-tuning.
Automatic hit detection should combine racket approach, outgoing shuttle motion
and the relevant player's swing, with explicit abstention when evidence is weak.
Pose snapshots should then come from the same player and aligned event frames.

## 9. Final project conclusion

**ShuttleSense is a functional feasibility prototype for badminton video
analysis.** It demonstrates the complete software path from uploaded footage
to inspectable replay, movement/pose observations and experimental event and
coaching outputs. It also documents an unsuccessful pretrained racket baseline
with reproducible evidence, defining the main remaining technical bottleneck.

**The prototype phase is wrapped at this scope.** The delivered work supports
a software demonstration and further research; it does not constitute a
validated automatic hit-confirmation system or a production coaching product.
Reliable contact labels, badminton-specific detection and independent accuracy
evaluation remain future work.
