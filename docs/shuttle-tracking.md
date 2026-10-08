# First pretrained TrackNet experiment

2026-10-08. Raw shuttle tracking on source [48.6,53.666667), 152 frames / 30 fps.
This is one court-view segment bounded by the previous automatic edit checks.
Private latest artifacts: `data/feasibility/tracknet-clip-03/`; combined rally
suggestion: `data/feasibility/rally-tracknet-clip-03/`. No main app changes.

## Model and runtime

Official [TrackNetV3 repository](https://github.com/qaz812345/TrackNetV3), revision
`6eda442ada1740573f200f836d93edc9a541ee86`. Pretrained archive from the authors'
[Google Drive link](https://drive.google.com/file/d/1CfzE87a0f6LhBp0kniSl1-89zaLCZ8cA/view).
Model checkpoint SHA-256:
`df867641a02712b021f04548ff4b1208ddfdb47f629ab2094ceb978667e83b1a`.
Official MIT license explicitly covers pretrained checkpoints; its copy and
source/provenance are retained alongside private weights under ignored data/.

PyTorch 2.11.0+cu128 in `data/tracknet-env`, CUDA verified on NVIDIA RTX 4060 Laptop
GPU (8 GB). Existing NumPy/OpenCV/Pillow are reused; no torchvision, dashboards,
training packages, or GPU driver changes. Context7 documentation was used to verify
restricted checkpoint loading and inference APIs. Checkpoints are loaded with
`weights_only=True`, CPU mapping, then model weights move to CUDA for inference.

The runner matches the official prediction-module conventions: eight RGB frames
plus a median background, Pillow resize to 512x288, 27 channels normalized /255,
overlapping windows with uniform temporal averaging, heatmap threshold >0.5,
largest bounding rectangle and centre rounded before scaling to source pixels.
Background uses approximately 41 sampled source frames from this segment.
InpaintNet is deliberately **not run**: filled-in coordinates cannot be treated
as observed visibility or evidence of a missing shuttle. This is the raw TrackNet
prediction module of TrackNetV3, not its full rectified output.

## Run

Use new output directories for reruns. Existing analysis environment must have
the packages in `analysis/requirements.txt` and Pillow (tested version 12.3.0).
Network downloads require approved execution in the Windows managed sandbox.

```powershell
python -m venv --system-site-packages data/tracknet-env
data/tracknet-env/Scripts/python.exe -m pip install torch==2.11.0+cu128 --index-url https://download.pytorch.org/whl/cu128
data/tracknet-env/Scripts/python.exe analysis/download_tracknet.py
data/tracknet-env/Scripts/python.exe analysis/test_shuttle.py
data/tracknet-env/Scripts/python.exe analysis/shuttle.py videoplayback.mp4 --edits data/feasibility/rally-edits-100s/results.json --start 48.6 --end 53.666667 --output data/feasibility/tracknet-clip-03
python analysis/rallies.py videoplayback.mp4 --detections data/feasibility/rally-motion-100s/detections.json --corners 413 241 873 239 987 687 276 692 --view-reference 13 --landmarks 377 358 639 357 903 356 339 488 638 487 936 486 --shuttle data/feasibility/tracknet-clip-03/shuttle.json --output data/feasibility/rally-tracknet-clip-03
```

Existing person detections and edit-report commands are in `rally-detection.md`.
`shuttle.py` limits RAM use by accepting clips of at most 15 seconds, rejects
cross-edit/non-court intervals, preserves source timestamps, and exports JSON
plus H.264 overlay/replay HTML. Overlay uses native Windows Media Foundation.
The CUDA PyTorch wheel is approximately 2.8 GB; checkpoint archive is 126 MB.
GitHub API downloads worked after raw GitHub/PowerShell requests timed out.

## Measured result and interpretation

Latest run: 119/152 frames have raw position proposals, 33 have none. This is
**not measured recall or accuracy**. GPU inference took 8.900s; decode, background
and inference took 11.293s, excluding model startup and overlay writing.
An earlier rerun reproduced identical proposals before a one-pixel decoder-rounding
parity correction; all counts stayed the same in the final run.

Twelve distributed overlay frames were visually inspected. Several flight
positions and the stationary shuttle after the final lunge look plausible;
there are also misses during ongoing play. Longest missing streak: 16 frames,
approximately 0.533s at [50.5,51.033333). No independent shuttle labels exist.
Stationary proposals appear around 52.8–53.13s, then movement returns as the
player bends/retrieves the shuttle. Model motion alone cannot distinguish a hit
from retrieving a shuttle.

The optional combined rule starts only when player activity and recent shuttle
motion coincide (>=50 pixels/s across adjacent raw frames, within the past 0.2s).
It can end only after both low player motion and at least two seconds of explicit
missing shuttle detections. Inference gaps/partial clips and inpainted samples
are rejected rather than counted as missing. Edit resets still apply.

It returns [49.2,53.666667], marked unfinished at the clipped boundary. This has
the same numeric bounds as the motion candidate in this segment; **no boundary
improvement is demonstrated**. The missing-shuttle ending never fires: the
shuttle remains detectable while stationary, and the edit cuts away shortly
afterward. Next: test sustained stationary-shuttle + low-player-motion evidence
against manually observed point endings, including ongoing-play pauses and
retrieval false starts. Keep suggestions provisional and winners unknown.

## Verification

`test_shuttle.py` checks RGB channel order, largest-contour decoding, official
rounding, moving-shuttle start gating, combined endings, no missing-only ending,
visible-shuttle abstention, and rejection of inference gaps/inpainted samples.
Existing rally and shared feasibility checks pass. Chrome verified H.264 overlay
decode/duration/playback and original-source candidate seek/end pause. Browser
console had no page errors. Footage/models/results stay ignored and unpushed.
