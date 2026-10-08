# ShuttleSense implementation plan

## Outcome

Turn one phone-recorded badminton match into a short review: a recurring weakness, the rallies that support it, and a drill for the next session. Preserve the full vision of rally segmentation, player tracking, shot labels, movement heatmaps, and explanations, but prove the evidence-to-practice loop before adding every detector.

Status: the desktop frontend prototype is implemented with fictional sample data and local video preview. The analysis pipeline and full product tasks remain pending. See [README.md](../README.md) for running the prototype; detailed analysis tasks and acceptance criteria live in [todo.md](todo.md).

## Current prototype priority

Prototype scope update (2026-10-08): prioritize a working prototype over precise
shoe-contact research. `/movement` now shows coarse box-bottom occupancy from the
saved tracked clip, explicitly approximate and separate from sample coaching.
Further foot-contact experiments are deferred. This closes the initial heatmap
preview, not the production accuracy gates or upload-to-analysis integration.
Next, deliver real-video rally review as planned below. Standalone shuttle-trail
replay is deferred: drawing a path alone does not help explain a lost point.

## Next feature: real-video rally review

User-facing outcome: choose a real match, save interesting rallies, replay each
exact interval, and keep confirmed outcomes and observations after reopening.
This is the next prototype slice of Task 7. It can ship before automatic tracking
and processing because user-marked intervals do not depend on models or court
calibration. The broader production tasks and accuracy gates remain open.

Current code: `UploadDialog` only previews a chosen video inside its modal;
`MatchReplay` animates an illustrative still, and `lib/demo.ts` supplies fictional
rallies. Reuse native video playback and existing visual styles. Keep the demo
separate from actual review data; do not replace real counts with sample values.

### Build order

1. **Real match playback and local save.** Add a dedicated review page with the
   native player. Store the video once and annotations separately in browser
   IndexedDB, keyed by a match ID; no upload API or processing worker is needed
   for this local prototype. Regenerate object URLs when reopening saved video,
   revoke old URLs, and expose decoding/storage errors. Browser quota or write
   failure must not be reported as a successful save. Include explicit deletion
   of the saved local match. Likely files: `components/upload-dialog.tsx`,
   `app/review/page.tsx`, `components/rally-review.tsx`, `lib/local-review.ts`.
2. **Mark and replay rallies.** “Mark start” and “Mark end” take timestamps from
   the actual video. Allow boundary edits and deletion. Require finite
   `0 <= start < end <= duration`, reject overlapping rally intervals, and keep
   the timeline ordered. Selecting a rally seeks to its start; playback pauses
   at its end and restart returns to that start. It does not create another
   video file. Likely files: `components/rally-review.tsx`, `lib/local-review.ts`.
3. **Save outcomes and observations.** Outcome is won/lost/unknown from the
   selected player's perspective. Add an optional user-written observation;
   label it as a reviewer note. Counts and win percentage use saved outcomes,
   show unknowns separately and exclude unknowns from the confirmed win-rate
   denominator. All-unknown reviews have no win percentage. Corrections survive
   reload. Export interval/outcome/note metadata as JSON; do not silently export
   the footage. Likely files: `components/rally-review.tsx`, `lib/local-review.ts`.

### Model decision

**No AI model for this feature.** The browser supplies video time and playback;
the reviewer supplies rally boundaries, outcomes and observations. This gets the
prototype working on actual footage without waiting for another model experiment.
YOLOX/MIL remain only the existing approximate movement experiment. RTMPose
contact work and TrackNet shuttle overlays remain deferred.

Later, if manual marking is the bottleneck, evaluate automatic boundary
suggestions against saved intervals. TrackNetV3 could supply shuttle-motion cues,
but it does not itself output rally boundaries, winners, reasons for losing or
drill prescriptions. No model is selected for those tasks until its actual
input/output and performance fit the requirement. User corrections must remain.

### Completion check

Choose a real local clip, save three non-overlapping rallies (won/lost/unknown),
replay only each selected interval, edit a boundary/outcome, reload and confirm
the original video and annotations return. Verify totals, unknown handling,
JSON export, deletion and clear storage/decoding errors. One focused browser
flow plus interval validation checks, typecheck and build is sufficient; keep
the existing six dashboard checks passing. No new claims about why a point was
lost or which drill is appropriate are introduced by this feature.

## Working assumptions

- First audience: college and club singles players who already record matches.
- First success criterion: a player can review the report in five minutes and choose one useful drill supported by replay evidence.
- Supported recording: one stationary phone in landscape, showing the full court and both players. Arbitrary angles, moving cameras, and doubles are later extensions.
- Initial player selection, court calibration, rally boundaries, and winners can be corrected by the user. Unknown outcomes remain unknown.
- Team size, deadline, hardware, video limits, and budget are unspecified. Task sizes are planning estimates, not delivery dates.
- These are defaults for this plan, not requirements the user has already confirmed.

## First release

1. Upload a supported video and see processing status or an actionable error.
2. Select the player and confirm court orientation; front-right is relative to that player's court side, including side changes.
3. Review proposed rallies, correct boundaries, and mark won/lost/unknown outcomes.
4. See valid player tracks, a top-down movement heatmap, and a rally timeline.
5. Open a rally to replay its interval with a synchronized movement trail.
6. See a supported recurring movement pattern, its evidence clips, a qualified explanation, and one practice drill.

First movement candidate: extended time outside a configurable base region following a reviewed shot/contact event. This is a hypothesis to validate, not a universal rule: appropriate base position can depend on rally context. A movement trace alone does not justify claims about late arrival or short clears. If evidence is insufficient, show the replay and say that no reliable coaching conclusion is available.

Example report structure:

> Observed: You remained outside the reviewed recovery region in 4 confirmed lost rallies.
> Interpretation: Delayed recovery may have contributed to these outcomes.
> Evidence: Replay the relevant intervals.
> Practice: A coach-reviewed recovery drill, with setup and repetitions.

Counts must come from actual reviewed events. Multiple patterns can occur in one rally; issue counts must not be presented as disjoint totals of lost rallies.

## Minimal architecture

Proposed starting stack, subject to the feasibility experiment:

- Web app: Next.js and TypeScript for upload, review, and results.
- Analysis: one Python process for video decoding, player tracking, court mapping, and event extraction. Evaluate an existing pretrained detector before training anything.
- Development storage: SQLite for video/job metadata and analysis results; local files for uploaded videos. One analysis job at a time initially.
- Integration: a versioned JSON result containing video metadata, player IDs, calibration segments, rally intervals and outcomes, valid track samples, evidence events, and coaching insights. Every insight links to its source events.
- Native video playback with an SVG or canvas overlay. Seek within the original video for rally replay before creating separate clip files.
- Deterministic, coach-reviewed insight rules and drill mappings first. A language model is optional wording assistance later and cannot invent measurements or causes.

Define actual file limits and processing budgets from measured target hardware. Keep long analysis outside the web request. Persist job states (queued, running, complete, failed), recover interrupted jobs, and expose failures clearly. A local prototype is not a public deployment: private storage, access controls, upload limits, and deletion are release gates before external access.

Do not install packages or choose a specific model until the relevant task checks current official documentation, compatibility, and model/data licensing.

## Implementation order

```text
Representative videos -> tracking feasibility -> reviewed coaching example
    -> upload -> court/player setup -> movement replay
    -> corrected rally review -> suggested rally boundaries
    -> evidence-based insights -> practice plan -> pilot validation
    -> shot feasibility -> shot labels -> shot-based coaching
```

Tasks 1-3 prove the hardest assumptions with real footage before polishing a dashboard. Tasks 4-6 deliver a working upload-to-replay slice. Tasks 7-10 add the coaching loop. Task 11 decides whether the first release is trustworthy. Tasks 12-14 extend it to smash, clear, drop, and net insights.

## Proposed validation targets

These are initial go/no-go targets to review after the baseline experiment, not achieved results:

- Evaluation set: at least 10 consented singles recordings from at least 3 recording setups and 100 annotated rallies. Keep entire recordings separate between tuning and evaluation.
- Tracking: correct selected-player identity on at least 90% of annotated sampled frames in supported videos. Report visible/untrackable coverage and identity switches separately; abstention must not hide poor coverage.
- Rally suggestions: at least 90% boundary precision and recall within a predeclared one-second tolerance on the held-out set. Corrections remain available.
- Coaching: a qualified badminton reviewer accepts at least 80% of emitted movement insights as supported and useful. Report emitted-insight coverage, disagreements, and missing evidence as well as agreement.
- Product value: at least 4 of 5 pilot players can locate the evidence and choose a drill within five minutes; check whether they actually use it at their next practice.
- Shot extension: proposed per-class precision of at least 85%, with recall, class support, and abstention coverage reported. Do not publish a class with inadequate evaluation examples.

Do not quietly lower thresholds to pass a checkpoint. Record measured failures and adjust scope or recording requirements explicitly.

## Risks and responses

| Risk / assumption | Test or response |
|---|---|
| Supported phone footage yields stable identities and court positions | Test representative real footage first; expose invalid track intervals and permit recalibration. |
| Movement patterns support useful coaching | Review real examples with a coach before implementing the rule; distinguish measurement from interpretation. |
| Rally endpoints and winners can be inferred reliably | Separate segmentation from outcome detection; use user-confirmed outcomes initially. |
| Side changes reverse court-relative labels | Store calibration/orientation by interval and test a match with a side change. |
| Shot type or clear depth cannot be supported by available evidence | Validate separately; leave unclassified events and unsupported clear-depth claims out of the report. |
| Processing is too slow or expensive | Measure time and memory on target hardware before setting supported length/resolution; retain calibration and thresholds as tunable values. |
| Attractive examples hide general failures | Evaluate whole held-out recordings and report coverage, errors, and unsupported inputs. |
| Uploads expose private footage or exhaust resources | Validate content and limits, isolate files, authorize access, support deletion, and test before any public pilot. |

## Deferred from the first release

- Doubles and moving-camera recordings: require a separate identity and geometry validation effort.
- Automatic winner determination: manual confirmation is an honest initial fallback.
- Full shot taxonomy and clear-depth explanations: tasks 12-14 require evidence beyond movement alone.
- Guaranteed causal explanations of every lost point: return qualified interpretations or no conclusion.
- Custom model training, real-time coaching, payments, subscriptions, leaderboards, and multi-worker infrastructure: add only for a validated need.
- Broad competitor claims: conduct a separate competitor review before claiming uniqueness.

## Open decisions

- Confirm audience, recording restrictions, team size, timeline, and hardware.
- Find a qualified reviewer and permissioned representative match footage.
- Choose local demonstration versus external pilot; external access activates the security release criteria.
- Confirm the proposed evaluation targets before using them as acceptance gates.

The user has reviewed the frontend prototype and requested moving into real implementation. Continue with the pending tasks in `todo.md`; `HANDOFF.md` records the current state and missing inputs.
