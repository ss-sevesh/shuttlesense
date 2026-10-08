# Simple rally detection prototype

The first baseline uses existing YOLOX-Tiny detections at 5 Hz on the first
40 seconds of `videoplayback.mp4`. No new model, packages, or frontend changes.
It selects the highest-score person on each court half using the existing
manual court corners. Maximum player-centre displacement, normalized by box
height and elapsed time, is the motion signal. This is not floor-contact speed.

Motion >=0.5 body heights/s starts a candidate. Two seconds of consecutive
low motion end it at the last active sample. Missing detections do not count
as inactivity. Candidates shorter than two seconds are discarded. A manual
camera cut at 12.466667s or a sampling gap resets the rule. The fixed court
corners are reused only for this court-view experiment, not arbitrary footage.
Thresholds are configurable. Walking and box jitter can trigger starts; quiet
rallies can split. No shuttle tracking, automatic cuts, outcomes, or accuracy
claim is included. The clip may start mid-rally, so a detected start is not a
verified serve.

## Run and review

Use new output directories for reruns; existing results are never overwritten.

```powershell
python analysis/detect.py videoplayback.mp4 --model data/models/yolox_tiny.onnx --output data/feasibility/rally-motion-40s --end 40 --sample-hz 5
python analysis/rallies.py videoplayback.mp4 --detections data/feasibility/rally-motion-40s/detections.json --corners 413 241 873 239 987 687 276 692 --cuts 12.466667 --output data/feasibility/rally-suggestions-40s
python analysis/test_rallies.py
```

Open `data/feasibility/rally-suggestions-40s/review.html` locally. Buttons seek
within the original video and pause at the candidate end; full-clip replay is
also available. `results.json` contains the signals, settings, source hashes,
provisional intervals, and unknown outcomes. Video and results stay ignored.

## First run, 2026-10-08

200 samples, 1,200 decoded frames; detector pass took 8.882s wall time, including
6.561s preprocessing/inference/postprocessing on the local CPU.

| Suggested interval | Ending |
| --- | --- |
| 0.8–12.4s | Known camera edit; not an inferred point ending |
| 13.4–40.0s | Clip ends; unfinished |

Source frames were inspected at one-second spacing. They show continued play
through the second candidate; no sustained inactivity ending was observed by
the rule in this excerpt. These are candidate spans, not two confirmed complete
rallies. No manually timed reference intervals or boundary accuracy were measured.

Synthetic checks cover quiet endings, missing detections, short bursts,
brief pauses, cuts/gaps, unfinished clips, and invalid motion values. Existing
shared detector/geometry checks pass. A local Chrome check verified video decoding,
candidate seeking/playback, end-boundary pause, full replay, and no page errors.

Next: try a longer excerpt containing a visible between-point pause and compare
manual start/end marks. Add TrackNet shuttle evidence if player motion merges
separate rallies or misses quiet play. Keep manual cuts until automatic cuts are
tested; do not call cut-driven separation automatic rally-end detection.
