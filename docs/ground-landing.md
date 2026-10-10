# Pretrained floor and shuttle landing experiment

The local upload worker now runs floor segmentation over every normalized frame,
joins it with the existing TrackNet shuttle observations, and exposes possible
landings in the review page and reviewed JSON. Replay a candidate, observe actual
contact, then use the existing rally-window form to save a verified ending.
The model never changes a rally ending automatically.

## Why the original YOLOv8 plan changes

Official pretrained YOLOv8-seg checkpoints predict the 80 COCO object classes;
floor and shuttlecock are absent. Downloading that checkpoint would not supply
a ground mask. This implementation instead uses NVIDIA's pretrained
`nvidia/segformer-b0-finetuned-ade-512-512`, whose class map includes `floor`.
Revision: `489d5cd81a0b59fab9b7ea758d3548ebe99677da`.
No training or new dependencies: the existing `data/hf-racquet-env` has CUDA
PyTorch, transformers 4.57.6, Hugging Face Hub, NumPy and OpenCV.

Sources: [Ultralytics segmentation](https://docs.ultralytics.com/tasks/segment/),
[SegFormer API](https://huggingface.co/docs/transformers/v4.57.3/en/model_doc/segformer),
[model and class map](https://huggingface.co/nvidia/segformer-b0-finetuned-ade-512-512).

## Setup and run

```powershell
& data/hf-racquet-env/Scripts/python.exe analysis/ground_landing.py --download
& data/hf-racquet-env/Scripts/python.exe analysis/ground_landing.py --video <source.mp4> --shuttle <shuttle.json> --output <private-output-directory>
python analysis/test_ground_landing.py
node analysis/test_analysis_review.mjs
npx.cmd playwright test tests/ground-landing.spec.ts
```

The downloader fetches only pinned configuration, processor and safetensors files
under ignored `data/models/segformer-floor`, recording SHA-256 provenance.
Inference verifies these hashes and the source video's hash, dimensions, FPS and
observation timing. Inference is offline and selects CUDA when available, CPU
otherwise. Missing assets, worker failures or timeouts produce an unavailable
panel; the rest of analysis continues with unknown endings. Downloads contact
Hugging Face; footage and frames stay local.

## Candidate checks

- Every frame gets a semantic mask: winning class must be floor with score >=0.6.
  Low-resolution labels resize with nearest-neighbor interpolation; floor scores
  resize linearly. Model scores are not measured accuracy.
- A candidate needs continuous visible observations over an approximately 0.5s
  approach followed by a 0.2s stationary hold (at least three frames each).
- The hold must stay within 4px at 720px picture height, scaled with image height,
  and every held point must overlap that frame's floor mask. Approach displacement
  must be at least three times that radius. Missing points and stream resets
  invalidate the window; disappearance is never a landing.
- Candidates within 0.75s are suppressed. Time is the beginning of the projected
  stationary hold, not a measured first-impact time.

The approach lookback was extended from0.15s to0.5s after the Paris350_434 trial
showed a missed gradual stop. See [current selectable rally test](selectable-rally-test.md).
The older40s trial below used the earlier heuristic and was not rerun after the
user restricted testing to Paris350_434.

Private outputs include `results.json`, per-frame `observations.json`, and sampled
binary masks and overlays once per second. Upload jobs write them under `ground/`.
The UI exports the supplemental report separately as `groundLanding`. Existing
shot/rally analysis fingerprints stay unchanged so existing human corrections
remain readable. Ground candidates have no persistent human labels of their own;
the existing verified rally form remains the record of observed boundaries.
Saved analyses are not rewritten. New uploads include the pass; the completed
40s experiment has its own saved review entry.

## Real trial, 2026-10-10

Saved 40.067s stationary phone clip: 1,202 frames processed on CUDA in about 47s
(including model loading and diagnostic writes, excluding download).
Mean predicted floor area was 55.2% of the image; 43 shuttle observations overlapped
floor. Zero possible landings passed the motion/hold checks. These are availability
and runtime counts, not accuracy. Distributed overlays were visually inspected:
floor is broadly recognized and people excluded, but boundaries are coarse.
No independently labeled landing times exist, so precision/recall and timing error
cannot be reported. The conservative heuristic may miss genuine impacts, including
bounces or landings where TrackNet stops detecting the shuttle.

An airborne or held shuttle can share floor pixels. Even a projected stop can be
a false detection or held shuttle. Neither this pretrained mask nor the stop
heuristic measures shuttle height. Out-of-bounds floors are included, but walls,
net faults and other rally-ending causes are outside this detector. Camera movement,
edits and badminton-specific segmentation accuracy are unvalidated. This is an
experimental candidate tool; automatic `RALLY ENDS` is not established.
