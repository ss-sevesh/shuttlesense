# ShuttleSense session handoff

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
