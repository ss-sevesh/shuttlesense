# Near-player contact evidence and local coaching

New uploads normalize to 30 FPS and collect MediaPipe observations on every
frame. Both players remain tracked for BST/rally context; contact selection,
contact-angle evidence and coaching focus only on the near player. New review
data contains only near-player landmarks/overlays, with no far-player selector
or far-player availability panel. Saved legacy reviews remain readable.

Two independent passes consume those observations. `contacts.json` finds swing
cues with the existing wrist-motion detector, then selects the minimum observed
wrist–shuttle pixel distance within +/-0.2 seconds of each cue. Both observations
must belong to the same decoded frame. A visible wrist (score >=0.5), distance
within 0.6 box heights, a unique minimum bracketed by adjacent observed frames,
and a consistent player ID are required. Candidates within 0.25 seconds suppress
duplicates. Unresolved candidates retain their original cue for inspection;
their contact frame and measurements remain unavailable and BST abstains.

`angles.json` independently calculates the near player's angles at every frame.
Video hash, pipeline version, frame number, side and track ID join the reports.
Elbow/arm extension uses shoulder–elbow–wrist (180 degrees means straight).
Body lean uses the shoulder-midpoint to hip-midpoint torso vector relative to
upward image vertical. Upper-arm elevation measures shoulder-to-elbow against
the downward torso direction. Landmark visibility >=0.5 and nonzero geometry
are required. These are 2D camera measurements, not calibrated body angles.
MediaPipe does not measure a racket tip or racket face; racket-face angle is null.

The selected contact time feeds BST and existing near-serve/rally logic. Five
actual decoded frames (f-2 through f+2) are saved as JPEGs under ignored job data.
Clip-edge frames are missing rather than duplicated. The local review displays
these images and exact-frame measurements, and its JSON export retains the
original model evidence separately from existing human shot/rally annotations.
No manual contact-timing correction is added. Old saved analyses remain readable
and are explicitly labeled as lacking frame-distance evidence; old cached
15 Hz contacts/BST outputs are not reused for the new pipeline.

## Local Hugging Face model

[Official Qwen3-VL-2B model](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct),
Apache 2.0, revision `89644892e4d85e24eaac8bacfd4f463576704203`.
Download processor assets and safetensors only; do not execute repository code.
The download manifest records SHA-256 for each local file; inference checks it.

```powershell
data/hf-racquet-env/Scripts/python.exe -m pip install -r analysis/requirements-shot-coach.txt
data/hf-racquet-env/Scripts/python.exe analysis/download_shot_coach.py
```

The worker runs after TrackNet/BST exit, using CUDA bfloat16 and SDPA. It receives
five chronological images (resized to fit 512 pixels for inference) and JSON containing the supplied measurements, frame
numbers, side, contact uncertainty, BST output and play status. No video is
uploaded to Hugging Face or another inference API. Model downloads require
network access; ordinary inference uses only local files.

Responses must parse into `shotType`, `visibleEvidence`, `uncertainty`, and
`coaching`, with an allowed shot label and bounded nonempty strings. Uncertain
or outside-play windows force the suggested label to unknown. Numeric angles
remain the deterministic measurements; model text cannot overwrite them.
Responses remain experimental, separate from BST and human annotations.
Cache keys include image bytes, evidence, model revision and prompt version.
Malformed answers receive at most two format retries; further failures mark coaching unavailable without losing
analysis. Generation is limited to 300 tokens/60 seconds; a parent-worker timeout
also bounds the whole coaching subprocess. Private worker logs record errors.

At 30 FPS five frames span only 133 ms. A wrist-distance minimum is a contact
proxy and may miss racket impact, fast motion or obscured shuttles. Neither
timing accuracy nor coaching quality is established by the implementation tests.

## Checks

Run `python analysis/test_contact_frames.py`, the existing tracked/BST/review
checks, `python analysis/test_shot_coach.py`, `node analysis/test_analysis_review.mjs`, typecheck/build, and the browser
review tests. The real-clip test reads the ignored `artifacts/contact-test-job.json`
manifest, then verifies saved evidence, protected image delivery and review/export.

## Independent saved-clip audit (2026-10-09)

Reran eight contact tests, the coaching retry/cache/failure test, report adaptation,
Node validation, typecheck and three focused browser tests; all passed. Independently
recomputed each of the four selected minima from saved raw landmarks/proposals and
compared all twenty JPEGs with exact decoded source frames; all matched.

Selected frames were 160, 759, 872 and 1024, with wrist distances 105.05, 25.42,
38.62 and 33.35 pixels respectively. Visual inspection did not establish four
actual racket impacts: the first uses the left wrist with the shuttle far away,
and several windows show preparation/positioning. The algorithm chooses a wrist
from the motion cue, without identifying the racket-holding hand. Two selected
left-elbow measurements were approximately 5.7 and 2.3 degrees, so frame alignment
and landmark visibility checks do not establish anatomical accuracy either.
All four local model answers returned unknown shot types. These checks establish
software correctness and evidence alignment, not reliable shot/contact accuracy.
