# ShuttleSense task breakdown

Analysis tasks remain pending unless checked below; the desktop frontend exists. Paths below are proposed for analysis implementation. S means roughly 1-2 files; M means roughly 3-5 files. Check actual scope before starting, and split a task if it exceeds one focused session. Checkpoints record evidence; they do not require repeated permission within an authorized build.

Feasibility preparation: [evaluation protocol](../docs/evaluation.md), manual annotation validator, and synthetic court/side-change regression checks are available. The [first-video report](../docs/first-video.md) records a real detector baseline on user-supplied, permission-confirmed footage and initial manual court mapping. Identity tracking, representative annotations, and a qualified coaching reviewer are still needed; Checkpoint A remains open.

## Phase 1: Prove the coaching premise

Prototype shortcut (2026-10-08): coarse real-track movement preview is available at
`/movement`; precise shoe-contact work is deferred at the user's request. Task 2
and the later production checkpoints remain open. Next is real-video rally review
without a model, as scoped in `plan.md`. Standalone shuttle trails and further shoe
labeling are deferred; prioritize useful saved replay over another detector demo.

## Next prototype slice: real-video rally review

This local slice implements Task 7 ahead of the automatic movement pipeline; it
does not claim the upload/worker or production checkpoints are complete.

### R1: Reopen a real local match
- [ ] Choose and play a decoded video in a dedicated review page; preserve the existing demo.
- [ ] Save video and review metadata in browser storage; reopening restores the match, and explicit deletion removes it.
- [ ] Decode/quota/write errors remain visible without claiming success or discarding previous saved data.
**Verify:** Choose a real clip, reload and play it again; verify deletion and a failed save. **Depends on:** None. **Scope:** M. **Likely files:** `components/upload-dialog.tsx`, `app/review/page.tsx`, `components/rally-review.tsx`, `lib/local-review.ts`.

### R2: Mark exact rally intervals
- [ ] Mark start/end from video time, edit/delete boundaries, and reject invalid or overlapping intervals.
- [ ] Selecting/restarting a rally seeks to its start; replay pauses at its end.
- [ ] Saved rallies stay ordered and survive reopening.
**Verify:** Mark three intervals, reject reversed/out-of-range/overlapping values, and check replay boundaries. **Depends on:** R1. **Scope:** S. **Likely files:** `components/rally-review.tsx`, `lib/local-review.ts`.

### R3: Keep real outcomes and observations
- [ ] Save won/lost/unknown from the selected player's perspective and optional reviewer notes.
- [ ] Derive counts from saved data; report unknowns separately and exclude them from win percentage, showing no percentage when all are unknown.
- [ ] Outcome/note edits survive reload, and JSON metadata export matches the saved review.
**Verify:** Correct an outcome, reload, compare totals/export, and test an all-unknown review. **Depends on:** R2. **Scope:** S. **Likely files:** `components/rally-review.tsx`, `lib/local-review.ts`.

### Checkpoint: Real-video review
- [ ] Real clip -> three marked rallies -> bounded replay -> outcome correction -> reload -> export works.
- [ ] Interval checks and focused browser flow pass; existing UI tests, typecheck and production build pass.
- [ ] No fictional rally data, automatic diagnoses or unverified drill prescriptions appear in the real review.

### Task 1: Define a representative evaluation set
- [ ] Collect consented singles footage and annotate rally boundaries, outcomes, player identities, orientation changes, and uncertain events; separate tuning and held-out recordings.
- [x] Record supported capture conditions and the proposed metrics, including coverage and abstentions.
**Verify:** Inspect annotations against source timestamps; validate interval ordering and bounds with one small script.
**Depends on:** None. **Scope:** S. **Likely files:** `docs/evaluation.md`, `analysis/check_annotations.py`. Private footage stays outside Git.

### Task 2: Test player tracking on real footage
- Label preparation: added a returned-packet checker and plain-language review guidance. The local packet still has 27 pending labels and zero eligible midpoints; no independent review or position score exists. Synthetic validation checks pass.
- Latest step: defined a conservative two-grounded-shoe midpoint experiment and prepared 27 regularly sampled, unmarked source frames plus context for independent review. All labels remain pending; airborne/one-grounded/unclear frames produce no midpoint. See [review protocol](../docs/ground-contact.md#two-shoe-review-protocol). No accuracy or coverage result yet.
- Segment checkpoint complete: twelve reviewed contact examples include five approximate support-shoe contacts, six uncertain and one airborne. These sparse assistant labels do not establish accuracy or coverage. Define the movement-point convention and obtain independent labels next.
- Camera stability: six local floor patches checked in all 826 frames of the restarted segment; each frame has at least four high-correlation matches with zero pixel shift. This supports a fixed mapping for that segment; foot-position accuracy and coverage remain open.
- Ground-contact progress: [six-frame review](../docs/ground-contact.md) checks one manual grounded point and six independent floor landmarks at 13s. Uncertain/airborne contacts abstain; calibration stability, position accuracy and valid-time coverage remain unmeasured.
- Follow-up: manual reseeding after the first source edit tracks 826 frames through 40s with no missing proposals; 12 distributed snapshots follow the selected white player. Separate segment boundaries are saved; full identity accuracy and court-position validation remain open.
- Progress: [white-player tests](../docs/white-tracking.md) compare native MIL and detector-assisted MIL on 12s/40s excerpts. Drift and a same-angle edit are documented; full identity/coverage evaluation and verified court mapping remain pending.
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
