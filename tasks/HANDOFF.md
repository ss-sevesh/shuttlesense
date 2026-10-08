# ShuttleSense session handoff

## Latest continuation: real upload review UI (2026-10-08)

User asked to upload and verify actual camera, shot and rally values, applying
both `taste_skill.md` and `web_deisgn_guidelines.md`. Preserved green workspace;
added replay-first real analysis, rather than replacing the fictional demo stats.
Upload Match -> recording under100MB -> mark four court corners -> Analyze Shots
& Rallies. Old Show boxes & heatmap still runs its separate short CPU preview.

New components analysis-job/review/camera and lib analysis-review display actual
boxes, MediaPipe bones, raw shuttle proposals, IDs, joint angles, relative wrist
speed, player heatmaps, model shot labels/scores/rejection reasons and rally
candidates. Missing values stay unavailable; null ends are explicitly Unknown.
Contact/window replay is bounded. Human labels and observed intervals save in
browser localStorage keyed by analysis fingerprint (source+corners+model reports),
and Download reviewed JSON preserves model evidence separately from corrections.
Rally input defaults round to0.001s to match native step validation.

POST /api/analysis persists ignored data/analysis-jobs/<uuid>, launches
analysis/review_job.py, exposes atomic stage progress and final result via GET,
and serves only source.mp4 with HTTP ranges. Same-origin writes and loopback
Host/URL guards handle Next's canonical localhost request.url with127.0.0.1 Host.
An on-disk process lock prevents parallel full-model jobs across hot reloads.
Full new clips normalize30FPS, sequentially run ByteTrack/MediaPipe (GPU detector,
CPU pose), continuous CUDA TrackNet and real CUDA BST. 4K/120FPS limits; no edited
or rotated/doubles footage support. Local copies remain; no retention cleanup.
Exact prior original phone hash plus corners within2px reuse real complete
inference. Stable fingerprint prevents saved labels crossing changed evidence.

Ready full-phone page: http://127.0.0.1:3000/review/b5af3dc2-a4a0-42d0-838a-c84c6a6adae6
Existing cached job refreshed with accurate unknown reasons/fingerprint. Browser
upload of the actual full original succeeded;111 contacts/23 labels/7 starts,
no asserted endings. A fresh uncached6s upload ran all models and returned90 pose
samples,180 shuttle rows,zero contacts/starts (early non-play); no fake outputs.
It is data/analysis-jobs/9f08a0e4-988b-4ab4-8cbd-c6cb5f21fbaa (another repeated
fresh fixture job also succeeded). No new whole320s GPU rerun was needed.

Checks: review_job assertions, Node API guard/range assertions and UI helper
assertions; actual browser uploads, native video/overlay toggles, manual review
save/reopen/export, bounded replay, invalid rally bounds, light/dark axe and
320/768/1440 widths. Existing frontend/CPU upload regressions retained. See
tests/shot-review.spec.ts and docs/tracked-rallies.md. Screenshots ignored under
artifacts. All12 distinct UI tests passed (fresh GPU test separately), with two
full-upload/security tests repeated successfully against production. Typecheck
and optimized build passed; local spawn tracing explicitly opts out to keep
Python environments out of the Next bundle. Production app is running on
127.0.0.1:3000, terminal session53319. Required movement screenshot also saved.

Prototype risks remain: inaccurate hit times, missed shuttle/poses, player ID
switches, domain-shifted BST, handheld calibration and unobserved rally endings.
User review is intentionally required. Server/job artifacts stay private.

## Latest continuation: entire WhatsApp phone video (2026-10-08)

User supplied root `WhatsApp Video 2026-10-08 at 7.09.26 PM.mp4`; processed
the entire 320.5s clip, not a short sample. Original is untouched and ignored.
FFmpeg normalized variable timing to 30fps, 9615 frames, 832x464, audio omitted
from the analysis copy. Private input/provenance/results are under
`data/feasibility/whatsapp-rallies-01/`. Original/CFR hashes and manual corners
are recorded; slight handheld camera motion remains unvalidated.

New shuttle_stream.py performs bounded-memory continuous official TrackNet
eight-frame overlap averaging, checks CFR timestamps/frame count, no chunks or
inpainting. Full CUDA run: 9615 rows, 2403 visible proposals (25% availability,
not accuracy), 667.76s wall time. Spot checks confirm some real yellow shuttles.

Full player_pose.py run: 4808 samples at15Hz, every frame tracked at30Hz;
936.391s runtime. Near tracked4808, posed4807; far tracked4394 (91.4%), posed4254.
Far-half ROI detection1280 plus full-frame640; small crops upscale256 high.
Strict IDs fragmented: explicit optional unique-half reacquisition recorded16
far changes, gaps remain. Full report stores tracker YAML values/hash, IDs and
segments. Tracked config analysis/bytetrack-phone.yaml matches actual run.
Independent review and selection/ROI/NMS/recovery checks passed.

Tracked casual footage now permits opposing halves/baseline positions; old
shared serve runner retains diagonal positions by default. Near observed pose
and0.4s hold must finish BEFORE launch. Final timing regression removed one
early-launch candidate. Missing/changed IDs reset cues; next-epoch endings
cannot close an earlier rally. BST windows crossing IDs abstain even if pose
is missing. Unknown-ending events are end_uncertain_review, excluded from
playing-hit counts, since those windows can still contain walking/tossing.

Actual final:111 contact candidates; real BST classified85 windows in2.02s,
23 experimental labels,88 unknown (10 identity-switch abstentions,16 missing
tracking,62 model review). Seven near serve starts at34.433,62.867,165.167,
207.933,279.667,290.667,312.800s; ALL endings unknown, zero completed rally cuts.
Fourteen contacts outside_play,97 end_uncertain_review. This is NOT reliable
full rally segmentation or walking/toss rejection. User will verify results.

Private final output `.../whatsapp-rallies-01/final-v2/`: results.json,
compressed26MB overlay.mp4, review.html, clip_manifest.json, seven explicitly
labelled review-window MP4s and25MB rallies.zip. The one-off export helpers live
in ignored data, with clip-duration and closed-ZIP CRC checks. Old final/ is a
superseded debugging output. Main app/upload UI is unchanged.

Ready http://127.0.0.1:8005/review.html; server session33096. Restart:
python analysis/serve_review.py data/feasibility/whatsapp-rallies-01/final-v2/review.html --video data/feasibility/whatsapp-rallies-01/final-v2/overlay.mp4 --archive data/feasibility/whatsapp-rallies-01/final-v2/rallies.zip --port 8005
Optional ZIP is explicitly whitelisted; no broad directory exposure.
node analysis/test_full_tracked_review.cjs http://127.0.0.1:8005/review.html data/feasibility/whatsapp-rallies-01/final-v2/results.json
Chrome passed320.5s decode metadata, start/middle/end seeks, bounded replay,
joint measurements,2 maps, MP4/ZIP byte ranges, unrelated-file404, no page
errors. Screenshots artifacts/full-tracked-review.png and
artifacts/full-tracked-heatmaps.png visually inspected. Stream4/BST8/player3,
serve/tracked/old shuttle/feasibility checks and Python compilation passed.
No ground truth or accuracy assessment; do not call seven windows seven rallies.

## Latest continuation: strict near-side serve start (2026-10-08)

User clarified post-point walking/pickup/tossing is not play; start only when
our/near-side player gives the serve posture. Tracked runner now requires
observed near posture held0.4s plus launch; no opponent/hidden-wrist fallback.
Shared boundaries gains optional server_side preserving old default behavior.
Motion alone no longer creates activity-window rallies. Completed observed
2squiet/stationary intervals can close the final rally without a following
serve; subsequent motion candidates are outside_play and excluded from its
hit count. No physical shuttle landing detector is claimed: unknown endings
stay unknown. User mentioned a new clip but has not attached it.

Cached older15sclip rerun: zero strict near serves/rallies, all15motion candidates
outside_play because nearwrists are obscured. Six experimentalBSTlabels remain
inspectable but cannot start play. New artifact tracked-rallies-near-serve-01/.
Server session71403 http://127.0.0.1:8004/review.html, restart with:
python analysis/serve_review.py data/feasibility/tracked-rallies-near-serve-01/review.html --video data/feasibility/tracked-rallies-near-serve-01/overlay.mp4 --port 8004
Near-only/far-only/occluded/toss-without-nearposture, completed finalend and
postendhitexclusion regressions passed; Chrome replay/pose/maps/range checks
updated and passed. Main upload UI remains separate. Need user's actual new
post-point clip to verify the rule on real walking/tossing footage.

## Latest continuation: ByteTrack + MediaPipe + pretrained BST (2026-10-08)

User dropped the HF pipeline, authorized implementation, and explicitly asked
for parallel agents. Separate agents built player tracking/poses and pretrained
BST, then an independent review caught raw-observation validation gaps. Root
fixed both consumers by reusing shuttle_evidence; regressions passed.

New analysis/player_pose.py uses official YOLO11n-pose person boxes + ByteTrack
30Hz GPU and per-ID MediaPipe0.10.35 full VIDEO task15Hz CPU, isolated
data/player-pose-env. Largest initially on-court person per side is locked;
no silent replacement ID. Follow locked players off court. conf0.1,imgsz960 and
full-frame-rate tracking resolved far-player fragmentation in this clip.
data/feasibility/player-pose-01/players.json: source59.633333–74.633333s,
225samples, both IDs tracked225/225, nearpose225,farpose223. Runtime51.063s
including MediaPipe shutdown timeouts. Four pose snapshots inspected.

New analysis/bst_shots.py loads actual official BST-0 JnB_bone seq10025-class
checkpoint, pinned sourcefb9b310bf4c8a8e3d89c75e61bc06a7ac3de62df,
weightSHA c4d41bb8248f0f79f7a7182ac2b38ec021ef51edd4978dfa31d17291b530afc8.
Maps MediaPipe33->COCO17, matches bbox diagonal/center normalization, bone
vectors and padding. This available variant uses poses and shuttle only;
court coordinates are not consumed by BST-0. MediaPipe differs from MMPose
training inputs; scores remain experimental. Original downloaded sources and
weight under ignored data/bst-official. Strict safe weight loading. See
docs/bst-shots.md for provenance and source URLs. Existing HF-named CUDA env
is reused for dependencies only, not the rejected analyzer code.

Root analysis/tracked_rallies.py combines proximity + wrist peaks with0.25s
suppression and serve-first boundaries. Hidden server wrists use explicit
opt-in opponent-readiness + shuttle-launch fallback; default old runner intact.
Source video/report hashes match; raw inference rows must cover the declared
clip with no inpainting/gaps. Shared boundary tests now cover occluded wrists.
Final result: near serve60.266667s, 15hit candidates; actual BST GPU inferred
all15windows in~0.56s,6accepted experimentallabels,9unknown/review. Next serve/
stationary end not observed; end=null. No measured accuracy or full match run.

Final private result data/feasibility/tracked-rallies-final-05/{results.json,
overlay.mp4,review.html}; input shots at tracked-rallies-02/shots.json. Browser
server running session89249 http://127.0.0.1:8004/review.html. Restart:
python analysis/serve_review.py data/feasibility/tracked-rallies-final-05/review.html --video data/feasibility/tracked-rallies-final-05/overlay.mp4 --port 8004
Chrome test analysis/test_tracked_review.cjs passed decode, event/rally replay,
bounded pause, live pose angles,2maps,206ranges,404filedenial, no page errors.
Screenshot artifacts/tracked-pose-rally-review.png inspected. Seven BST adapter
tests, player lock test, tracked cues/missing/gap/inpainting tests, shared serve,
shuttle, feasibility and compilation all passed. Reviewed consumers against
pinned BST normalization. Actual validated BST rerun reproduced all15outputs.
Docs docs/player-pose.md,docs/bst-shots.md,docs/tracked-rallies.md.

User review is next. Upload UI is still separate; no main app changes in this
slice. Remaining issues: false/missed hit events, image-plane pose estimates,
MediaPipe domain shift, identity loss on other footage and uncertain endings.

## Latest continuation: Hugging Face pipeline result (2026-10-08)

User requested an actual Bot-Derpy/racquet-sports-analyzer result before deciding
whether to use it, then asked for PySceneDetect edit splitting. Downloaded pinned
HF revision 7cfe0f49afae14fb5361e578fc1fe07f887bc45b into ignored
data/hf-racquet-baseline; separate data/hf-racquet-env shares existing CUDA torch
read-only via .pth. YOLO11n-pose + ByteTrack, upstream classical shuttle tracker
and rally logic ran on source frames [374,1245), 12.466667–41.5s (871 frames).
One compatibility fix reshapes OpenCV 5 Hough lines to (-1,1,4). Explicitly
disabled lazy shot classification because upstream CLI flag does not disable it.
No TrackNet substitution or rally logic tuning.

Actual result: 37.4s CUDA processing; 1 rally at clip-relative 0.70–28.87s;
359 reported hits, 261 ball reversal events, 756 ball proposals (86.8% proposal
rate, NOT accuracy), 15 tracked-ID profiles/heatmaps. Visual review detects an
official as P3 and fragmented far-player IDs; hit counts clearly overcount.
Upstream winner, playstyle and coaching statements are heuristics, unverified.
PySceneDetect 0.7.1 AdaptiveDetector scanned all 790.833s: 79 cuts / 80 scenes.
Selected test clip lies in detected scene [0,41.5); detector missed the known
12.466667s boundary, so scene detection is not complete replay/edit removal.

Private results: data/feasibility/hf-racquet-test/{analysis_report.json,
editing_scenes.json,test_provenance.json,analyzed_output.mp4,review-h264.mp4,
review.html,heatmap_player_*.png}. Local helper scripts data/{prepare-hf-test,
run-hf-test,detect-hf-edits,build-hf-review}.py retain setup. Review server left
running at http://127.0.0.1:8003/review.html (session 47902). Restart with:
python analysis/serve_review.py data/feasibility/hf-racquet-test/review.html
--video data/feasibility/hf-racquet-test/review-h264.mp4 --port 8003
Chrome test data/check-hf-review.cjs passed playback, seeking, 15 heatmaps,
206 byte range, file exposure 404, and no page errors; screenshot inspected at
artifacts/hf-racquet-review.png. Only short excerpt analyzed by HF; no measured
accuracy, full-match rally count, production integration or shot classification.

## Latest continuation: serve-first rally prototype (2026-10-08)

User authorized serve-first lookback and will verify results; then explicitly
chose unedited prototype input and asked to ignore video edits. Added
analysis/serve_rallies.py using existing YOLOX, TrackNet and RTMPose. No new
MediaPipe or Random Forest dependency/training. Serve posture is a readiness
proxy, not legal-service classification. Low floor motion + diagonal placement
+ body/wrist cue held 0.4s, then directional shuttle launch; backward endings need
a completed 2s stationary-shuttle + low-player-motion window before next setup.
Misses interrupt that window. Outputs provisional serves/rallies with null
uncertain ends plus replay buttons for short setup cues and complete input clips.

TrackNet supports --assume-unedited instead of requiring --edits. Serve runner
defaults to unedited contract with --corners; optional legacy --edits retained.
Adjacent explicitly unedited reports can join; no stationarity or launch cue
bridges the inference boundary, but completed historical quiet windows survive.
No edit inspection on the new prototype path. Person detections must span clips.

Private final data/feasibility/serve-first-unedited-review-01/ examines 56.5s of
full-court excerpts. One near-side serve at 60.266667s, preparation 60.0–60.6s;
brief setup cues at 0.2–0.4s and 12.8–13.0s, isolated cue at 61.4s. No 2s ending
window found, so prior/final ends unknown. No accuracy claims or forced endings.
TrackNet GPU inputs serve-tracknet-01/02/03 and serve-tracknet-unedited-01.
Four pose snapshots inspected. No main app changes in this slice.

Private replay server left at http://127.0.0.1:8002/review.html. Restart with:
python analysis/serve_review.py data/feasibility/serve-first-unedited-review-01/review.html --video videoplayback.mp4 --port 8002
Helper serves exactly review + source on loopback with byte ranges, preventing
the earlier file-origin/seek issues. Chrome candidate seek/play/replay/end pause,
range request and unrelated-file denial passed; no page errors. New sequencing,
pose proxy, gap/miss/cut/chunk/range tests plus existing rally/shuttle/shared checks
passed. A split-report integration check reproduced the same serve after joining.
See docs/serve-first-rallies.md. Next: user's review and then upload integration.

## Latest continuation: TrackNet retest (2026-10-08)

User requested TrackNet test. Reran source [48.6,53.666667) on CUDA RTX 4060:
152 frames, 119 raw proposals, 33 misses; inference 9.501s, decode/background/
inference 12.416s. Exact sample predictions match tracknet-clip-03. Shuttle and
rally self-checks passed. Inspected 12 overlay snapshots; no accuracy labels.
Fresh ignored artifacts: data/feasibility/tracknet-retest-20261008/.

Local replay http://127.0.0.1:8001/review.html is served by ignored
data/serve-tracknet-review.py (loopback, only that output directory, byte-range
support). Basic Python http.server reset Chrome seek to zero; range support fixed
it. Chrome verified 1280x720 decode, 5.066633s duration, seek to 1s and advancement
to 1.35s without page/video errors. Restart helper with `python
data/serve-tracknet-review.py` if needed. This remains a separate experiment;
uploaded-video UI still uses YOLOX for people, not TrackNet for shuttle.

## Latest continuation: local upload boxes and heatmap demo (2026-10-08)

Follow-up 422 fix: actual dev-server log showed the user's four valid court
corners clicked counterclockwise. upload_demo now arranges the four points by
far/near row and left/right before calibration. Accept any click order for an
upright camera (far corners above near corners); geometry validation retained.
UI instructions updated and invalid geometry gets a specific reset message.
Regression browser test uses the user's exact click coordinates with real video.

Follow-up: Show boxes & heatmap now remains clickable before calibration and
starts the corner picker, with keyboard focus and progress on the button.
Previously it silently stayed disabled until four corners were marked.

User requested an upload-to-boxes-and-heatmap demo now. UploadDialog now retains
the selected File and embeds UploadAnalysis. Mark four first-frame singles-court
corners clockwise from far-left, then Show boxes & heatmap. Existing YOLOX-Tiny
CPU detector samples the first 30 seconds at 5 Hz. Bounding-box bottom centres
project through a manual homography onto the reused CourtMap grid. Near/far
selector rotates the selected side to the bottom; no verified player identities.

Local-only same-origin POST /api/analyze-demo validates bounded multipart upload,
runs analysis/upload_demo.py (90s timeout), and deletes temporary copies under
ignored data/demo-uploads. Analysis limit 100 MB/4K; preview limit remains 500 MB.
Results stay in the dialog, no persistence or hosted worker. No TrackNet/GPU
needed for person boxes. Fixed camera, no edits/side changes; existing dashboard
sample statistics stay illustrative. See docs/upload-demo.md. Preserve the
pre-existing next-env.d.ts change. Rally/production accuracy tasks remain open.

Validation: upload mapping self-check, all eight Playwright tests (including real
private clip upload, both themes, temporary cleanup and no browser errors), and
production build passed. Actual clip processing took about 8 seconds for 150
samples. Screenshot inspected at ignored artifacts/upload-analysis.png. This
proves the local flow, not detector accuracy across other videos.

## Latest continuation: TrackNet on GPU (2026-10-08)

User authorized pretrained shuttle tracking and requested GPU if useful; RTX 4060
Laptop GPU 8 GB is present. CUDA PyTorch 2.11.0+cu128 installed only into ignored
`data/tracknet-env`; CUDA tensor operation verified. Official TrackNetV3 source,
MIT license, provenance and weights downloaded to ignored data/models/tracknetv3.
GitHub API + Google file-content endpoint worked after raw-host requests timed out.
Context7 was used for PyTorch checkpoint/inference API verification.

`analysis/download_tracknet.py` prepares official assets;
`analysis/shuttle.py` runs the raw TrackNet prediction module with uniform
overlap ensemble on a <=15s edit-bounded court clip, exports proposals + H.264
overlay/review HTML. InpaintNet intentionally unused so misses remain explicit.
`analysis/rallies.py --shuttle` optionally adds observed-shuttle motion to starts
and requires two seconds of missing detections plus low player activity to end.
Source hashes, timestamps and edit checks retained; invalid/inpainted/inference-gap
reports cannot establish missing-shuttle evidence.

Final private run `data/feasibility/tracknet-clip-03/`: [48.6,53.666667), 152 frames,
119 raw proposals, 33 missing; inference 8.900s, decode/background/inference 11.293s.
Twelve overlay frames inspected. Flight tracking and stationary post-point shuttle
look plausible but no independent labels/accuracy. Longest miss ~0.533s DURING play.
Native overlay uses Windows Media Foundation (avoids unavailable OpenH264 DLL).
Combined result `data/feasibility/rally-tracknet-clip-03/`: [49.2,53.666667], unfinished
at clip end. Same numeric bounds as motion baseline; no improvement claimed.
The shuttle stays visible/stationary after the point, so disappearance-only endings
do not fire. See `docs/shuttle-tracking.md` for setup, rerun commands and provenance.

Shuttle/rally/shared checks pass, including decode rounding, combined cue logic,
inference gap rejection and no missing-only endings. Chrome checked overlay decode,
duration/playback and original-source candidate seek/end pause with no page errors.
No main app changes; private artifacts stay ignored. Generated next-env.d.ts preserved.
Next: stationary-shuttle + low-player-activity ending cue, tested against manually
observed point endings and retrieval/quiet-play false starts. Then real review UI.

## Latest continuation: automatic video-edit handling (2026-10-08)

Implemented `analysis/video_edits.py` and connected it to `analysis/rallies.py`.
Uses the existing six floor landmarks against a reference court frame to exclude
close-ups, plus adjacent-frame changed-pixel fraction to detect same-angle edits.
The reference time/landmarks and cut threshold are explicit CLI inputs; no manual
cut times were supplied in the new 100s run. Fixed-camera heuristic only.

Private run `data/feasibility/rally-edits-100s/`: 13 edit/view transitions,
18 excluded samples, nine candidate spans instead of two merged intervals.
Same-angle cuts at 12.466667, 53.666667 and 93.3s were confirmed visually in
adjacent source frames. Original two-second quiet rule unchanged; all first eight
candidates end at edits, ninth unfinished. These are NOT nine confirmed rallies
or validated serve/end times. See `docs/rally-detection.md` for commands/list.

Open that run's `review.html` locally for candidate replay. Synthetic regression
includes an actual generated video with same-view cut, non-court frames and
return; checks exact edit times/view gating. Shared feasibility checks and Chrome
decode/seek/play/end-pause/full-replay checks pass. No frontend or new dependencies.
Private video/results remain ignored; pre-existing next-env.d.ts diff preserved.
Sandbox worked without repair.

Next: compare candidates with marked serve/point-ending times, then expose
reviewed suggestions in real-video UI. Starts may lag serves; edit endings can
include walking. Keep user correction and unknown outcomes; TrackNet remains
deferred. The longer baseline failure below is retained as experiment history.

## Latest continuation: longer rally test (2026-10-08)

User approved testing a longer passage containing pauses. Ran the unchanged
motion rule on [0,100) at 5 Hz: 500 samples, 3,000 decoded frames, detector
38.463s wall time. Output [0.8,12.4] and [13.4,100]; the second interval merges
multiple points and close-ups. This FAILED actual rally separation; no low-motion
ending was emitted. Do not present the two candidates as complete rallies.

Assistant inspected 2s source samples across [40,180), and 0.5s samples across
[48,62). The brief slowdown around 53–55s is interrupted by a same-angle edit:
53.8s motion spikes to 6.13 box heights/s, then there is less than two seconds
below threshold before activity resumes. Pauses are often shortened by edits.
See `docs/rally-detection.md` for evidence, timing and rerun commands.

Private `data/feasibility/rally-suggestions-100s/review.html` replays the failed
baseline; source sheets and outputs stay ignored. Native Chrome decode,
seek/play, end pause and full replay checks pass, as do rule regression checks.
No detector code, thresholds, dependencies or main app changes in this test.
Generated next-env.d.ts diff preserved. Sandbox worked; no repair needed.

Next: handle same-angle edits and exclude close-ups, then test a shorter quiet
rule for the edited broadcast clip. Motion-only baseline is insufficient here;
do not generalize the failure to continuous phone recordings. TrackNet remains
uninstalled; add shuttle evidence if the next small baseline still merges points.

## Latest continuation: simple rally prototype (2026-10-08)

User requested simple rally separation for the prototype clip. Implemented
`analysis/rallies.py`, reusing YOLOX detections and court geometry, with no new
dependencies or desktop app changes. This replaces the proposed TrackNet-first
experiment below with a smaller player-motion baseline; TrackNet remains deferred.
Details and rerun commands: `docs/rally-detection.md`.

Private first run: 5 Hz detections on [0,40), 200 samples, 8.882s detector wall
time. Motion starts candidates; two seconds of low motion can end them. Missing
players never count as quiet; the known 12.466667s cut is manually supplied.
Suggestions: [0.8,12.4] (cut), [13.4,40] (unfinished clip). These are NOT two
confirmed complete rallies or measured accuracy. One-second source frames were
visually inspected; no quiet ending was detected in this excerpt.

Open `data/feasibility/rally-suggestions-40s/review.html` for native local-video
candidate replay; `results.json` retains signals/settings/provenance. Everything
under data/ stays ignored. `python analysis/test_rallies.py` and shared feasibility
checks pass. Local Chrome verified decode, seek/play, candidate-end pause and full
replay with no page errors. Existing generated next-env.d.ts diff preserved.

Next: run a longer clip with a between-point pause, manually compare boundaries,
then add shuttle evidence only if motion is insufficient. Current prototype
does not process new uploads or infer winners. Full production gates stay open.
Sandbox lock recurred during startup; saved check/repair stopped only two matching
helpers, and normal Get-Location succeeded immediately afterward.

## Latest session close (2026-10-08)

The user requested automatic rally start/end suggestions, then chose to close
the session before implementation. Next session should pick up this request;
the older manual-review-only priority below is superseded for the next experiment.
Use existing YOLOX player detections plus pretrained TrackNetV3 shuttle positions
and a simple temporal rule, first on a short continuous clip. Proposed start cues:
both players in court, visible moving shuttle, and increased player activity.
Proposed end cues need combined evidence: shuttle missing for at least two seconds
plus sustained low player activity. Missing detections alone can be occlusion;
downward flight alone is normal during rallies and does not establish landing.
Walking to service positions is a possible later cue, not an implemented feature.
Keep boundaries provisional and reviewable; compare with manually marked rallies
before reporting accuracy. Account for camera cuts and unfinished clip boundaries.

This session only inspected the repository/setup and the official TrackNetV3
README (https://github.com/qaz812345/TrackNetV3). No rally detector, new model,
real-video review UI, or rally evaluation was implemented. PyTorch/torchvision
are absent; ONNXRuntime and OpenCV are available. Check/download official weights
and install only inference dependencies actually needed. Keep footage and weights
under ignored data/. The existing heatmap uses YOLOX/MIL box-bottom occupancy,
not TrackNet or validated foot contact. Earlier heatmap and terminal fixes are
already pushed; their build and six Playwright checks passed in earlier work.
Current working tree also contains a generated next-env.d.ts change; preserve it
and exclude it from this documentation-only commit. Sandbox reads worked during
this session, so no repair was needed. Startup instructions are saved in AGENTS.md.

## Codex Windows sandbox repair (2026-10-07)

Sandbox commands failed before execution with `helper_unknown_error: setup
refresh had errors`, even after restarting Codex. Approved commands outside the
sandbox still worked. The underlying error in
`C:/Users/11SEV/.codex/.sandbox/sandbox.2026-10-07.log` was runtime read/execute
permission validation failing for
`C:/Users/11SEV/AppData/Local/OpenAI/Codex/runtimes/cua_node/71e3f41277f96d73/bin/node_repl.exe`
because Windows reported the file was in use (`os error 32`).

Fix: through an approved command outside the sandbox, stop only the running
`node_repl.exe` helpers whose executable path matches that runtime. Two helpers
were stopped; Codex itself remained running. Retry a sandbox command immediately
so setup can validate permissions before those helpers restart.

```powershell
$runtimePath = 'C:\Users\11SEV\AppData\Local\OpenAI\Codex\runtimes\cua_node\71e3f41277f96d73\bin\node_repl.exe'
Get-CimInstance Win32_Process -Filter "Name = 'node_repl.exe'" |
    Where-Object { $_.ExecutablePath -eq $runtimePath } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }
```

If this recurs, inspect the latest sandbox log and process executable paths first;
the runtime directory hash and process IDs can change. Stopping these helpers can
interrupt browser/computer-use sessions. They were not permanently blocked, and
no files or settings were changed by this repair. The lock may recur when helpers
restart; switching back to browser tools has not been verified.

Verification: `Get-Location` succeeded inside the sandbox, followed by creating,
reading and deleting `.sandbox-access-check.tmp` in the workspace. Both checks
used normal sandbox execution without escalation. No Codex restart was needed.

## Current state

Latest planning update: the user challenged the value of a shuttle overlay and
requested a plan for the next useful feature. Real-video rally review is now
next: play/store a local clip, mark/edit start/end intervals, replay only that
rally, save won/lost/unknown plus reviewer notes, derive real counts, and export
metadata. No AI model is needed for this slice. Use native video and browser
IndexedDB, with storage failure/deletion handling and no backend worker yet.
`tasks/plan.md` contains the design/model rationale; R1-R3 in `tasks/todo.md`
contain ordered acceptance checks. These are planned, not implemented.
Standalone TrackNetV3 trails and further RTMPose contact work are deferred.
Automatic boundary suggestions can later be evaluated against saved intervals;
shuttle tracking alone is not rally segmentation or a coaching explanation.

Latest terminal fixes (2026-10-08): Windows commands now explicitly use npm.cmd;
Playwright's automatic server startup also selects npm.cmd on Windows. Screenshot
saving uses `npm.cmd run screenshot` with the installed Playwright CLI, writing
`artifacts/movement-preview.png`; verified and visually inspected. Browser MCP
file saving still has mismatched workspace roots, so do not repeat that failing
path or claim its host configuration was repaired. Display-only MCP screenshots
remain usable. No global PowerShell execution policy or Codex permissions changed.

Sandbox repair now checks the latest success/failure event and ignores resolved
historical locks. Unknown errors and unrelated runtime paths remain rejected;
process inspection denial reports the need for approved execution. The runnable
`npm.cmd run test:sandbox` uses fake process commands and verifies stale-error
handling, dry run, exact helper selection and JSON-escaped paths without stopping
real processes. Both that check and a real check-only run pass.

AGENTS.md now directs Git mutations through the existing approved escalation
rules immediately, avoiding predictable .git/index.lock denials. Read-only Git
remains sandboxed. The protected .git boundary is expected and unchanged.
All six Playwright checks pass with automatic dev-server startup after scoping
the unavailable-map assertion to the app's main region (Next's development error
overlay contains its own images). A previous interrupted run also recorded
computer-sleep network suspension and browser-launch timeout; a fresh run passed.
The deliberate corrupt-file test logs its expected handled error; this is not a
production failure. Type checking passes. App/heatmap behavior is unchanged.

Latest scope update (2026-10-08): user wants the prototype built faster and the
heatmap effort wrapped up. Further RTMPose/contact-labeling research is deferred.
`analysis/movement_preview.py` reuses the saved white-player boxes for a 6x8
coarse occupancy grid over the single stable-camera segment [12.466667s,40s).
826 proposals: 27.366667s mapped, 0.166667s outside, no missing proposal time.
These are approximate box-bottom positions including jump bias, not valid-contact
coverage or independently verified tracking. Accuracy targets were not lowered.

The real derived grid is visible at `/movement`, linked from the existing
workspace as “View tracked clip movement.” No sample rally/weakness claims are
mixed into that page. The original demo dashboard remains intact. Private
`data/feasibility/movement-preview/results.json` is generated locally, ignored
by Git and excluded from Next.js deployment traces. Absent/invalid local results
show an unavailable state; this is not new-upload processing. Export command and
limits are in `docs/ground-contact.md`, Coarse movement preview.

Sandbox shortcut added: `npm.cmd run sandbox:fix -- -CheckOnly` and then
`npm.cmd run sandbox:fix`, using approved execution outside a broken sandbox.
`AGENTS.md` now puts this direction at session startup; do not ask the user to
repeat the fix or search conversations. Script finds the runtime lock in the
latest sandbox log, handles plain/JSON-escaped paths, and stops only matching
helpers inside the expected runtime directory. Dry run verified; no helpers were
stopped while the sandbox worked. Retry a normal command before browser tools.

Verification: occupancy regression and shared geometry checks pass; all six
Playwright checks pass, including movement data, missing/corrupt results, light/
dark accessibility and viewport overflow. Production build passes, `/movement`
is dynamic, and the private result is absent from deployment trace files. The
live movement page was visually inspected and had a clean browser console.
The build regenerated `next-env.d.ts`; it has no remaining diff and is not included
in this checkpoint.
Next: pretrained TrackNetV3 on one short rally, inspect raw misses/false detections
and a shuttle-trail overlay before integrating upload/replay. Do not restart
grounded-foot labeling. Task 2 and Checkpoint A remain open for validated release.

Latest continuation (2026-10-08): resumed the interrupted contact-rule experiment
and applied the recorded sandbox repair after confirming the same runtime lock
in the latest log. Stopped only the two matching `node_repl.exe` helpers; normal
sandbox execution then succeeded. Read this repair section before requesting
generic unsandboxed access if the error recurs.

`analysis/foot_motion.py` tests RTMPose shoe motion across +/-3-frame context.
Tuned on source frames <800, checked on >=800; threshold 1.2 box heights/s.
Earlier counts: TP4/FP1/TN3/FN0, one abstention, five excluded uncertain/occluded.
Later counts: TP1/FP1/TN3/FN0, zero abstentions, eight excluded. The later false
contact is frame1094 (raised trailing shoe); the tuning false contact is frame494.
The only labeled airborne sample914 was rejected, but one example cannot establish
jump accuracy. Motion ranges overlap: slowing the threshold to reject frame494
also rejects a grounded pair. This rule fails as a two-grounded contact gate.

Three private sequence sheets around takeoff/landing and both false positives
were inspected. Only existing centre frames have reference labels; no dense
timing accuracy or new-clip validation was claimed. Private results and sheets
are in `data/feasibility/foot-motion-assistant-01/`; rerun `foot-motion-assistant-02`
reproduced counts and predictions. See the final section of `docs/ground-contact.md`
for interpretation and rerun commands. Motion, pose and shared checks pass.
Next: denser contact observations and a different cue, then a reserved new clip
if the rule survives tuning. Keep this failed baseline out of the heatmap.
Task 2/Checkpoint A remain open; desktop UI and existing `next-env.d.ts` untouched.

Latest continuation: the user explicitly requested assistant labeling and starting
the pose experiment. All 27 fixed samples are now labeled in private
`data/feasibility/two-shoe-assistant/review.json`: 5 both grounded, 8 one grounded,
1 airborne, 11 uncertain, 2 occluded. Assistant provenance is explicit; these are
not independent human ground truth. The original blank packet is unchanged.
Labels were saved before any model predictions were viewed.

`analysis/foot_pose.py` runs official RTMPose-m COCO+UBody wholebody ONNX
`c8b76419` using the existing tracker boxes, CPU ONNXRuntime and installed deps.
Toe/toe/heel centroids are shoe proxies, not automatically detected floor contacts.
All 27 samples have proxies, including the jump; court mapping is manually gated
by assistant both-grounded labels. On those five samples, median midpoint
difference is 0.217m versus 0.211m for box bottom centre. No clear improvement or
independent accuracy is established. Details, rerun commands and limitations are
in `docs/ground-contact.md`, Assistant labels and first RTMPose experiment.

The completed-label check, `python analysis/test_foot_pose.py`, and shared
synthetic checks pass. All 27 overlays and five eligible shoe crops were visually
inspected. Private model, annotations and results remain ignored. Next: assess
whether two-grounded-shoe coverage is useful, then contact estimation and an
untouched-segment test. Task 2 and Checkpoint A remain open. Desktop UI and the
pre-existing generated `next-env.d.ts` change remain untouched.

Latest continuation: added `analysis/check_foot_review.py` to check returned
two-shoe labels against the original blank packet without scoring a tracker.
It preserves the source/schedule/context, checks contact states and image bounds,
requires explanations for missing contacts, and can reject unfinished reviews.
Shared synthetic checks pass; the real blank packet reports 27 pending and zero
eligible midpoint labels. `--complete` correctly rejects that blank packet.
No human labels, accuracy measurement or heatmap were produced. The desktop UI
and the pre-existing generated `next-env.d.ts` change remain untouched.

The user said they did not understand "review" and had nothing to provide.
Explain it as looking at saved pictures and marking where shoes touch the floor;
the video and pictures are already local. Do not assume the user can edit JSON
or repeatedly ask for a completed file. The first centre picture was opened to
illustrate the task, without creating a label. Plain-language guidance and checker
commands are in `docs/ground-contact.md`. Next: help obtain human observations,
retain their provenance, then compare a declared estimator with matching labels.
Independent review and a position-error gate remain unavailable; Task 2 and
Checkpoint A stay open. This is a completed label-checking preparation step,
not completed foot-position feasibility.

Latest session: the next foot-position experiment is prepared, with no desktop UI
source changes. The test target is the court midpoint of two visible grounded shoe
contacts, not body centre or the previous support-shoe labels. The user asked about
unequal foot heights during jumps: if both shoes are airborne, neither is a floor
contact. Keep rectangle tracking separate from missing floor positions; do not
guess the lower shoe onto the court. One grounded shoe is not a two-shoe midpoint.

`analysis/court.py` now has `project_foot_midpoint`, mapping each shoe before
averaging on the court and returning no midpoint for one-grounded, airborne,
uncertain or occluded frames. `analysis/prepare_foot_review.py` exported a private
blank packet to `data/feasibility/two-shoe-review/`: 27 samples at frames
404:30:1184 (13.466667-39.466667s), plus +/-3-frame context, 81 unmarked PNGs.
All samples remain pending. See `docs/ground-contact.md#two-shoe-review-protocol`
for simple reviewer instructions and rerun commands. No independent reviewer was
identified; the user needed the term explained. Do not invent independent labels,
estimator accuracy, valid-time coverage, or a real heatmap. Next: obtain independent
labels under this convention, report disagreements/eligible sample counts, then
evaluate a declared estimator against matching midpoint labels. A position-error
acceptance gate is not agreed. Task 2 and Checkpoint A remain open.

Verification: shared synthetic checks pass, including projection order, jump
abstention and sampling bounds. A deliberately wrong midpoint calculation fails
the regression. All 81 PNGs match decoded source pixels, the hash and centre
timestamps were checked, and three distributed centre frames were visually inspected.
Private footage, models and review artifacts stay ignored. A pre-existing
generated `next-env.d.ts` change was left untouched and excluded from this work.

Session-ready checkpoint: the camera/ground-contact experiment for the manually
restarted white-player segment is complete. Review now includes twelve selected
frames: five approximate grounded support-shoe contacts, six uncertain, one
airborne. Support contacts differ from box-bottom centres by 0.153-1.175m; these
compare different physical points and are NOT validated tracking errors. See
`docs/ground-contact.md` and private `data/feasibility/feet-review/contact-comparison.jpg`.
Next: define the intended movement point, get consistent independent labels and
evaluate an estimator; do not create a real heatmap from these sparse examples.
Task 2 and Checkpoint A remain open. No desktop UI source changed.

User instruction: when the next work is fully complete and ready for a fresh
session, update this handoff, commit and push the changes to GitHub, and report
the commit reference. Do not publish the private footage, model or review artifacts.

Latest ground-contact experiment: six selected source frames were reviewed;
13s has one approximate manual support-shoe contact, 29s is airborne, and four
are uncertain. Four manual court corners at 13s were checked against six other
floor intersections (median residual 3.4cm, max 7.8cm, approximate manual picks).
This is not validated player accuracy or calibration stability. The rectangle
bottom-centre differs from the manual contact by about 15.3cm in that one frame.
`analysis/court.py` now abstains for uncertain/airborne/occluded contact states;
its runnable regression checks pass. See `docs/ground-contact.md` and private
`data/feasibility/feet-review/calibration-review.jpg`. No real heatmap or UI
integration was added. Next: calibration stability and more grounded labels.

Camera stability follow-up completed for `[12.466667s,40s)`: six floor patches
were compared in all 826 frames. 4,871/4,956 patch checks had correlation >=0.9,
all at zero displacement; each frame had at least four such matches. This
supports a fixed camera for this segment, not accurate foot tracking or automatic
cut detection. See `docs/ground-contact.md`; private dense results and review
sheet are under `data/feasibility/feet-review/`. Next: more grounded contact
annotations, independent review and position/coverage measurement before heatmaps.

Latest restart experiment: tracking was manually reseeded for the same white-shirt
player at source frame 374 (12.466667s), seed box `(465,333,83,224)`. The new run
reached 40s: 826 frames, 73.321s CPU wall time, no missing proposals, target followed
in 12 distributed visual review snapshots. These are exploratory checks, not
validated full-frame accuracy. `data/feasibility/white-segments.json` records
separate pre/post-edit intervals and explicit trail breaks; all four stale
post-edit proposals from the first run are excluded by its interval boundary.
The private playable follow-up video is
`data/feasibility/white-segment-02/review-h264.mp4`. See `docs/white-tracking.md`.

White-player tracking update: the user selected the white-shirt player. Native
OpenCV MIL drifted around 9s in a 12s test; adding YOLOX detector checks at 5 Hz
kept the target enclosed in all 12 reviewed snapshots. A 40s test abstained at
12.6s after a verified same-angle source edit at 12.466667s. Track proposals remain
unverified; four stale frames after that edit must be excluded. See
`docs/white-tracking.md`; the playable private review is
`data/feasibility/white-assisted-12s/review-h264.mp4`. Continuous segment annotations,
manual reseeds, ground truth, court calibration verification, and broader metrics
remain pending. No subagents were spawned; the user asked about their availability.

Tracking feasibility update: the user supplied `videoplayback.mp4` in the workspace
and confirmed permission for the downloaded footage. It is 720p/30 fps, 790.833s,
edited broadcast singles footage. An offline YOLOX-Tiny CPU detector sampled the
first 180 seconds; manual initial-frame calibration and private review images
are saved under ignored `data/feasibility/`. See `docs/first-video.md` for measured
runtime, camera-cut limitations, and rerun commands. Stable identities, tracking
accuracy/coverage, peak memory, representative phone recordings, and qualified
coach review remain pending. Preserve the desktop UI and demo labels.

The desktop web frontend is implemented and reviewed. The user wants to move into real implementation next; preserve the current UI instead of redesigning it. The user explicitly said that a desktop web prototype is sufficient and no mobile-specific work is needed.

Stack: Next.js 16.4, React 19.3, TypeScript, native CSS, Phosphor icons. Read `AGENTS.md` and the relevant installed Next.js documentation before code changes.

Working frontend flows: match overview, rally filters and selection, evidence links, sample movement animation, court heatmap, practice instructions and completion, local video playback, theme switching, match library, and report/plan downloads. Filters and selected rallies use URL parameters; drill completion uses local storage.

All match statistics, outcomes, heatmap values, shots, movement trails, explanations, and drills are illustrative sample data from `lib/demo.ts`. The court photograph is AI-generated. Do not present these as output from uploaded footage. Upload currently creates a local object URL for native video preview; there is no upload API, database, processing worker, player detector, rally detector, or AI inference yet.

## Verification already completed

- Production build passed.
- All 5 Playwright tests passed against the production server.
- Tests cover rally evidence and reloads, drill completion and downloads, upload validation and native video decoding, movement controls, navigation, layout overflow, and axe accessibility in both themes.
- Production browser console was clean.
- Desktop Lighthouse scored performance 100 and accessibility 100 on the local prototype. These are local measurements, not production service guarantees.

## Run locally

```sh
npm.cmd install
npm.cmd run dev
# Or: npm.cmd run build, then npm.cmd start
npm.cmd run test:ui
npm.cmd run typecheck
```

The default URL is http://127.0.0.1:3000. The previous session left a production server running, but check the port before starting another. A new session does not need the old process: start the server again if it has stopped. Playwright uses an installed Chrome browser.

One stale-cache issue occurred after stopping the dev server: an empty `.next/dev/types/routes.d.ts` caused a production type-check failure. Clearing only the verified workspace `.next/dev/types` cache resolved it. Prefer stopping dev before a production build; never remove source files or weaken type checking to fix generated cache errors.

## Next work

Read `tasks/plan.md` and `tasks/todo.md`. The original analysis tasks remain pending; frontend completion does not complete the real upload/worker or tracking tasks.

Start with Tasks 1-3: representative consented singles footage, tracking/court-mapping feasibility, and one coach-reviewed evidence-to-drill example. Use a stationary phone recording with the full court and both players visible as the initial recording contract. Allow manual court/player selection and outcome corrections. Leave processing thresholds and calibration configurable.

The user supplied one downloaded match video and confirmed permission; local hardware was inspected. A labeled dataset, representative phone recordings, a qualified coaching reviewer, deadline, team size, and budget remain unspecified. Never invent accuracy results or mark data-dependent tasks complete without real evidence.

After feasibility, build the smallest upload -> queued analysis -> persisted result -> existing UI slice. Validate files at the API boundary, keep videos out of Git, and show missing/uncertain results honestly. Shot recognition and clear-depth claims have their own later validation gates. Do not add authentication providers, payments, real-time coaching, custom training, or distributed queues without a demonstrated need.

## Resume prompt

> Continue ShuttleSense’s working prototype. Read AGENTS.md first for Windows commands and sandbox repair; do not ask the user to explain them again. Read tasks/HANDOFF.md, tasks/plan.md and R1-R3 in tasks/todo.md. Next feature is real-video rally review: local match storage, marked start/end intervals, bounded replay, saved won/lost/unknown outcomes and reviewer notes, real counts and metadata export. No model is needed initially. TrackNet overlays and precise shoe contacts are deferred. Preserve the existing desktop demo and separate its fictional data from actual review. Production accuracy gates remain open. Keep footage/results private, explain simply, update the handoff and commit/push completed work.
