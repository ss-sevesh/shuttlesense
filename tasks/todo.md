# ShuttleSense task breakdown

All tasks are pending. Paths below are proposed because the workspace has no application yet. S means roughly 1-2 files; M means roughly 3-5 files. Check actual scope before starting, and split a task if it exceeds one focused session. Checkpoints record evidence; they do not require repeated permission within an authorized build.

## Phase 1: Prove the coaching premise

### Task 1: Define a representative evaluation set
- [ ] Collect consented singles footage and annotate rally boundaries, outcomes, player identities, orientation changes, and uncertain events; separate tuning and held-out recordings.
- [ ] Record supported capture conditions and the proposed metrics, including coverage and abstentions.
**Verify:** Inspect annotations against source timestamps; validate interval ordering and bounds with one small script.
**Depends on:** None. **Scope:** S. **Likely files:** `docs/evaluation.md`, `analysis/check_annotations.py`. Private footage stays outside Git.

### Task 2: Test player tracking on real footage
- [ ] Run one existing pretrained detector/tracker on representative clips and inspect court-relative position estimates after manual calibration.
- [ ] Record identity accuracy, invalid intervals, runtime, memory, model license, and failures; decide whether the recording contract is viable.
**Verify:** Compare output to Task 1 annotations, including occlusion and a side change; leave one runnable coordinate/identity regression check.
**Depends on:** 1. **Scope:** M. **Likely files:** `analysis/requirements.txt`, `analysis/track.py`, `analysis/test_tracking.py`, `docs/evaluation.md`.

### Task 3: Prove one useful coaching example
- [ ] Have a qualified reviewer annotate a recurring movement issue, the relevant contact/context events, evidence intervals, and a suitable drill on real rallies.
- [ ] Define when to emit the insight, when to abstain, and what evidence would be required for stronger late-arrival or short-clear claims.
**Verify:** Replay each example and ask the reviewer whether the explanation is supported; record disagreements instead of fabricating certainty.
**Depends on:** 1, 2. **Scope:** S. **Likely files:** `docs/coaching-rules.md`, `analysis/examples/reviewed-match.json`.

### Checkpoint A: Feasibility
- [ ] Tracking measurements and reviewer feedback support a narrow first release.
- [ ] Unsupported inputs and unproven claims are documented.
- [ ] If feasibility fails, revise the recording contract or keep human review; do not present manual output as automated analysis.

## Phase 2: Upload to movement replay

### Task 4: Deliver upload and processing status
- [ ] A supported video uploads, persists, and progresses through queued/running/complete/failed states using one Python analysis process.
- [ ] Malformed, oversized, or unsupported files fail clearly; a restarted process does not leave jobs permanently running.
**Verify:** Upload a valid file and invalid inputs; interrupt a job and confirm recovery. Test the upload/job boundary and run the app build.
**Depends on:** Checkpoint A. **Scope:** M. **Likely files:** `package.json`, `app/page.tsx`, `app/api/videos/route.ts`, `lib/store.ts`, `analysis/worker.py`.

### Task 5: Deliver court and player setup
- [ ] The player can select themselves, mark court reference points, and confirm near/far orientation and side-change intervals.
- [ ] Invalid geometry is rejected; saved calibration consistently maps samples into that player's court coordinates.
**Verify:** Reopen saved setup and check known reference points and a side change with one calibration test.
**Depends on:** 4. **Scope:** M. **Likely files:** `components/court-setup.tsx`, `app/api/videos/[id]/setup/route.ts`, `analysis/court.py`, `lib/store.ts`, `analysis/test_court.py`.

### Task 6: Deliver movement replay and heatmap
- [ ] Process the selected player's tracks and display a timestamp-synchronized trail and top-down occupancy heatmap.
- [ ] Show missing/uncertain tracking intervals; exclude them from occupancy counts and avoid connecting paths across gaps.
**Verify:** Seek through one real match and compare overlays to source footage; check timestamp alignment and valid-time heatmap normalization.
**Depends on:** 2, 5. **Scope:** M. **Likely files:** `analysis/track.py`, `lib/results.ts`, `components/match-replay.tsx`, `components/court-heatmap.tsx`, `app/matches/[id]/page.tsx`.

### Checkpoint B: Movement slice
- [ ] Upload -> setup -> processing -> movement replay works on a real supported video.
- [ ] Focused checks pass and the web app builds.
- [ ] Heatmap describes movement occupancy, without labeling high occupancy as weakness.

## Phase 3: Rally evidence to practice

### Task 7: Deliver corrected rally review
- [ ] Add/edit ordered rally intervals and won/lost/unknown outcomes; replay stops at the selected interval end.
- [ ] Summary counts derive from saved outcomes and expose unknown rallies; corrections survive reload.
**Verify:** Correct boundaries and an outcome, reopen the match, and confirm replay bounds and counts with one interval test.
**Depends on:** 6. **Scope:** M. **Likely files:** `components/rally-timeline.tsx`, `components/match-replay.tsx`, `app/api/videos/[id]/rallies/route.ts`, `lib/results.ts`, `lib/rallies.test.ts`.

### Task 8: Suggest rally boundaries
- [ ] Implement the simplest segmentation method supported by measured footage; present suggestions for review and retain manual corrections.
- [ ] Report held-out boundary precision, recall, and timing error; low-confidence segments remain reviewable and do not invent winners.
**Verify:** Run the boundary evaluation from Task 1 and inspect a false positive and a missed rally.
**Depends on:** 7. **Scope:** M. **Likely files:** `analysis/rallies.py`, `analysis/evaluate_rallies.py`, `analysis/worker.py`, `components/rally-timeline.tsx`.

### Task 9: Deliver evidence-based movement insights
- [ ] Apply the reviewed rule from Task 3, using valid calibrated tracks and reviewed context events; retain configurable thresholds.
- [ ] Every emitted insight links to rally IDs and evidence timestamps, separates observation from interpretation, and suppresses unsupported counts or causes.
**Verify:** One small rule test covers an accepted example, missing context, tracking gaps, and an abstention; review real output with the qualified reviewer.
**Depends on:** 3, 7. **Scope:** M. **Likely files:** `analysis/insights.py`, `analysis/test_insights.py`, `lib/results.ts`, `components/why-i-lost.tsx`.

### Checkpoint C: Trustworthy rally report
- [ ] Confirmed outcomes, replay evidence, and insight counts agree on actual uploaded footage.
- [ ] Rally suggestions meet the proposed gate or remain explicitly assisted; unknown outcomes and insufficient evidence are visible.
- [ ] Focused checks pass and the web app builds.

### Task 10: Deliver the personalized practice plan
- [ ] Map a supported priority issue to a coach-reviewed drill with purpose, setup, repetitions/rest, and a success cue.
- [ ] Selecting the drill reveals the source issue and clips; insufficient evidence produces no invented personalized prescription.
**Verify:** Follow the complete issue -> evidence -> drill flow on a reviewed match; check the deterministic mapping with one runnable example.
**Depends on:** 9. **Scope:** M. **Likely files:** `analysis/drills.json`, `analysis/insights.py`, `components/practice-plan.tsx`, `analysis/test_insights.py`.

### Task 11: Validate the first release with players
- [ ] Evaluate whole held-out recordings against the plan's gates and test five-player usability, keyboard access, mobile layout, failure states, and video deletion.
- [ ] Before external access, verify private storage and per-user/session authorization for upload, results, playback, and deletion; set resource limits and retention behavior.
**Verify:** Record metrics and pilot feedback; test unauthorized access and malformed uploads if external access is enabled. Run focused checks, build, and one complete real-video browser flow.
**Depends on:** 8, 10. **Scope:** M per session; split discovered fixes into separate tasks. **Likely files:** `docs/evaluation.md`, `docs/pilot.md`, upload/result/media routes affected by discovered issues.

### Checkpoint D: First release
- [ ] The user can identify one supported priority, inspect its evidence, and choose a drill within five minutes.
- [ ] Measured accuracy, coverage, runtime, and limitations are recorded; manual corrections are labeled honestly.
- [ ] All first-release criteria pass before claiming readiness. Public deployment is a separate action, not part of this planning task.

## Phase 4: Complete the shot-aware vision

### Task 12: Test shot recognition feasibility
- [ ] Label smash, clear, drop, net, and unknown events on supported footage; confirm definitions and adequate examples with a reviewer.
- [ ] Evaluate a baseline on held-out recordings, recording per-class precision/recall, abstentions, runtime, and licenses before choosing a model or training approach.
**Verify:** Produce a confusion matrix and inspect classification failures. Decide which classes have enough evidence to expose.
**Depends on:** Checkpoint D. **Scope:** M. **Likely files:** `docs/shot-evaluation.md`, `analysis/shots.py`, `analysis/evaluate_shots.py`, `analysis/requirements.txt`.

### Task 13: Deliver supported shot labels
- [ ] Show timestamped supported shot predictions in rally replay; users can correct labels, and uncertain events remain unknown.
- [ ] Persist prediction provenance separately from corrections; label corrections do not silently corrupt tracking or outcome data.
**Verify:** Run held-out per-class checks, then correct a label in the browser and confirm persistence and timestamp alignment.
**Depends on:** 12. **Scope:** M. **Likely files:** `analysis/worker.py`, `lib/results.ts`, `components/rally-timeline.tsx`, `app/api/videos/[id]/shots/route.ts`.

### Task 14: Deliver shot-based coaching
- [ ] Add one reviewer-approved shot-related rule whose measurements actually support the claim; a clear label alone cannot establish a short clear.
- [ ] Connect its evidence to a suitable drill and re-evaluate insight agreement and coverage. Keep unsupported causal or landing-depth conclusions suppressed.
**Verify:** Review true and false examples on held-out footage; extend the smallest insight test and exercise shot -> replay -> explanation -> drill in the browser.
**Depends on:** 9, 10, 13. **Scope:** M. **Likely files:** `docs/coaching-rules.md`, `analysis/insights.py`, `analysis/drills.json`, `analysis/test_insights.py`, `components/why-i-lost.tsx`.

### Checkpoint E: Shot-aware release
- [ ] Exposed shot classes meet the agreed validation gates, with sample counts and coverage reported.
- [ ] Shot-aware explanations remain traceable to evidence and qualified where causation is uncertain.
- [ ] The complete upload -> tracking -> rallies -> shots -> insight -> drill flow passes on real held-out footage.
