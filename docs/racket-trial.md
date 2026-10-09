# Offline racket detection feasibility trial

The trial processes every source frame with the official RTMDet-Ins-s COCO
instance-segmentation checkpoint, using its 640-pixel test pipeline. It saves
original-image racket masks, boxes and scores, associates detections with saved
player rectangles, and measures shuttle-to-mask distance using saved TrackNet
coordinates. Multiple near rackets, missing observations, tied minima, identity
changes and minima without adjacent observations abstain. Search is limited to
the existing swing windows. The whole mask includes the shaft; proximity does
not establish physical contact.

This is isolated from the web analysis pipeline and its saved results. It does
not invoke the LLM, train a model or generate five racket keypoints. Standard
RTMPose checkpoints do not provide a trained five-point badminton racket model.

## Reproduce on Windows

Use a separate Python 3.10 environment: the published Windows MMCV wheel is
compatible with this stack, rather than the app's newer Python environment.

```powershell
C:/Users/11SEV/miniconda3/Scripts/conda.exe create --prefix ./data/rtmdet-env python=3.10 pip -y
data/rtmdet-env/python.exe -m pip install -r analysis/requirements-racket-trial.txt
data/rtmdet-env/python.exe analysis/download_racket_trial.py
data/rtmdet-env/python.exe analysis/test_racket_trial.py
data/rtmdet-env/python.exe analysis/racket_trial.py data/analysis-jobs/<job-id> --output data/feasibility/<new-trial-directory>
python analysis/serve_review.py data/feasibility/<new-trial-directory>/review.html --video data/feasibility/<new-trial-directory>/overlay.mp4 --port 8006
```

Open `http://127.0.0.1:8006/review.html`. The existing loopback review server
serves the supplied annotated overlay at `/source.mp4`; opening the HTML directly
will not load its video. Outputs include results.json, compressed masks, the
annotated video and one image strip per window. Use a new output directory for
each run; existing output directories are rejected. Models and trial outputs
remain ignored/private.

The initial wheel download encountered a certificate-chain error. Updating
certifi and requests in this isolated environment, then using pip's
`--use-deprecated=legacy-certs` option resolved it without disabling TLS checks.
No global Python, permission or execution-policy settings were changed.

Model source: [official MMDetection RTMDet configurations](https://github.com/open-mmlab/mmdetection/tree/main/configs/rtmdet).
The download script records package versions, the source URL and full config and
checkpoint hashes in provenance.json. The tested checkpoint SHA-256 is
`fdc5d7ec327cf46dba079d664be98a853e80936098c1778edf5ffb726b084908`.

## Saved 40-second clip result

Job `dd88779c-8a2f-406e-a2a3-ebdf90038b47`, trial
`data/feasibility/racket-trial-01`, 832×464 at 30 FPS, RTX 4060 Laptop GPU:

| Measurement | Result |
| --- | --- |
| Original frames processed | 1,202 / 1,202 |
| Frames with a near-associated racket detection | 453 (37.7%) |
| Frames with usable racket and shuttle distance | 86 (7.2%) |
| Windows with a bracketed proximity minimum | 0 / 14 |
| Windows with no distance observations | 7 |
| Windows with an unbracketed minimum | 7 |
| Detector time | 58.1 seconds |
| Model setup and inference/output time | 66.3 seconds, excluding review rendering/transcoding |

These percentages measure evidence availability, **not detection or contact
accuracy**. No impact ground truth was annotated. All fourteen image strips were
visually reviewed by the assistant; the observations below are qualitative and
are not ground truth.

| Window | Visual observation |
| --- | --- |
| 1 | Preparation; visible racket missed. Prior wrist frame 160 does not establish impact. |
| 2 | Lunge/swing; racket detections disappear during movement, with a false leg region. |
| 3 | Positioning; lowered racket often missed and unrelated regions boxed. |
| 4 | Positioning/raising hands; no consistent near racket evidence. |
| 5 | Raising/swing movement; unrelated arm/body regions boxed. |
| 6 | Lowered racket intermittently detected; shuttle elsewhere in the image. |
| 7 | Waiting; no near racket evidence. |
| 8 | Serve preparation; racket initially detected then missed, held shuttle unavailable. |
| 9 | Underhand serve/swing; missing blurred racket frames and ambiguous detections. Prior wrist frame 759 does not establish impact. |
| 10 | Overhead jump/swing; sparse racket detections and unavailable shuttle proposals. |
| 11 | Watching/waiting; no near racket evidence. |
| 12 | Watching/waiting; racket only appears late. Prior wrist frame 872 does not establish impact. |
| 13 | Serve preparation; held shuttle not tracked. Prior wrist frame 1024 does not establish impact. |
| 14 | Underhand swing; fast/blurred racket frames missed. |

Four unit tests cover mask coordinates, player association, abstention and input
alignment. A private independent audit recomputed all 86 distances directly
from saved masks, checked all mask shapes and fourteen window decisions/strips,
and decoded all source/overlay frames. Browser checks verified playback, fourteen
loaded strips, mobile layout and a clean console. Independent code review passed.

The pretrained baseline is insufficient for integrating contact timing. The
next useful experiment is badminton-specific racket/head detection fine-tuning
with labeled swing and blur examples, alongside improving shuttle visibility.
Keep unavailable contacts unresolved. Evaluate against manually labeled impact
frames, with an explicit frame tolerance, before claiming accuracy. At 30 FPS,
physical contact can also occur between captured frames. Future chunked shuttle
runs must exclude chunk-boundary proposals before distance selection; this
tested continuous clip contains none.
