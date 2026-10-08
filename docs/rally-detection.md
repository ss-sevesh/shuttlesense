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

## Longer test: motion-only baseline fails on this edited clip

The unchanged rule was run on [0,100), still at 5 Hz and with only the previously
known 12.466667s manual cut. 500 samples / 3,000 decoded frames; detector wall
time 38.463s, of which 28.796s was preprocessing/inference/postprocessing.
It returned [0.8,12.4] and [13.4,100]. The latter merges multiple visible points
and close-up shots. No low-motion ending was emitted. This is a failed baseline,
not successful automatic rally separation.

Assistant inspected source frames every two seconds over [40,180), then every
0.5s over [48,62). The latter shows white lunging at 52s, walking/bending by
53–53.5s, both players in a ready position at 54–55s, and play resuming by 56s.
These are approximate source observations, not independent timed ground truth.
The position jump between the 53.6s and 53.8s detection samples produced
6.13 body heights/s, resetting the quiet timer. At 54–55.2s motion was below
0.5, but it exceeded the threshold again at 55.4s, before two quiet seconds.
Other close-ups/edits also make one continuous court calibration invalid.

```powershell
python analysis/detect.py videoplayback.mp4 --model data/models/yolox_tiny.onnx --output data/feasibility/rally-motion-100s --end 100 --sample-hz 5
python analysis/rallies.py videoplayback.mp4 --detections data/feasibility/rally-motion-100s/detections.json --corners 413 241 873 239 987 687 276 692 --cuts 12.466667 --output data/feasibility/rally-suggestions-100s
```

Private `rally-suggestions-100s/review.html` replays the failed suggestions.
Local Chrome decoding, seeking, end pause and full replay checks pass; the
synthetic rule checks still pass. Those verify implementation, not rally accuracy.
No thresholds were changed to hide this failure. Next experiment should handle
same-angle edits and exclude close-ups before testing a shorter between-point
quiet rule on this broadcast clip. Shuttle evidence is an option if that still
merges points; no TrackNet install or app integration was done in this test.

## Edit-aware prototype, 2026-10-08

`analysis/video_edits.py` now checks consecutive source frames, reusing the six
previous floor-line landmarks. A view is usable when at least four fixed 25x25
grayscale reference patches correlate >=0.8. This excludes the close-ups without
letting missing player detections establish a point ending. A view transition
breaks the rally candidate. Within a matching court view, a cut is suggested when
at least 5.5% of court pixels change by more than 25 grayscale levels between
adjacent frames (320x180 analysis image). All settings/edits are retained in JSON.
The fixed reference and threshold are tuned for this video, not moving cameras.

```powershell
python analysis/rallies.py videoplayback.mp4 --detections data/feasibility/rally-motion-100s/detections.json --corners 413 241 873 239 987 687 276 692 --view-reference 13 --landmarks 377 358 639 357 903 356 339 488 638 487 936 486 --output data/feasibility/rally-edits-100s
python analysis/test_rallies.py
```

This run supplies **no manual cuts**, keeps the original two-second quiet rule,
and reuses saved person detections. It finds 13 edit/view transitions, including
same-angle edits at 12.466667, 53.666667 and 93.3s. Before/after source frames for
those three edits were visually inspected: players jump to different positions
and the displayed score changes. The 10 other transitions match entry/exit of
the previously observed close-ups. 18 detector samples (3.6s at 5 Hz) are excluded
as non-court views. No further edits or boundaries are claimed to be absent.

| Candidate | Start–end (seconds) |
| --- | --- |
| 1 | 0.8–12.466667 |
| 2 | 13.4–41.5 |
| 3 | 43.4–48.266667 |
| 4 | 49.2–53.666667 |
| 5 | 55.4–59.566667 |
| 6 | 60.8–80.966667 |
| 7 | 82.6–85.966667 |
| 8 | 87.2–93.3 |
| 9 | 94.8–100 (unfinished) |

These are nine reviewable spans, not nine verified complete rallies. The first
eight end at edits, not inferred shuttle landings; starts can lag a serve and
ends can include walking. There are no quiet-rule endings in this run. Boundary
precision/recall/timing accuracy remain unmeasured; this is tuning material.

Private `data/feasibility/rally-edits-100s/review.html` plays these intervals within
the original video. Native Chrome decoding, seeking/playback, end pause and full
replay pass. The runnable synthetic check includes a generated video with a
same-view edit, a close-up and a return to court; it checks detected times and
view exclusion. Existing detector/geometry checks pass. No main app changes,
new packages or TrackNet weights. Next: compare these candidates with marked
serve/point-ending times, then expose reviewed suggestions in the real-video UI.
