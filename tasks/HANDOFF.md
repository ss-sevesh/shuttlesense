# ShuttleSense session handoff

## Current state

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
npm install
npm run dev
# Or: npm run build, then npm start
npm run test:ui
npm run typecheck
```

The default URL is http://127.0.0.1:3000. The previous session left a production server running, but check the port before starting another. A new session does not need the old process: start the server again if it has stopped. Playwright uses an installed Chrome browser.

One stale-cache issue occurred after stopping the dev server: an empty `.next/dev/types/routes.d.ts` caused a production type-check failure. Clearing only the verified workspace `.next/dev/types` cache resolved it. Prefer stopping dev before a production build; never remove source files or weaken type checking to fix generated cache errors.

## Next work

Read `tasks/plan.md` and `tasks/todo.md`. The original analysis tasks remain pending; frontend completion does not complete the real upload/worker or tracking tasks.

Start with Tasks 1-3: representative consented singles footage, tracking/court-mapping feasibility, and one coach-reviewed evidence-to-drill example. Use a stationary phone recording with the full court and both players visible as the initial recording contract. Allow manual court/player selection and outcome corrections. Leave processing thresholds and calibration configurable.

The user supplied one downloaded match video and confirmed permission; local hardware was inspected. A labeled dataset, representative phone recordings, a qualified coaching reviewer, deadline, team size, and budget remain unspecified. Never invent accuracy results or mark data-dependent tasks complete without real evidence.

After feasibility, build the smallest upload -> queued analysis -> persisted result -> existing UI slice. Validate files at the API boundary, keep videos out of Git, and show missing/uncertain results honestly. Shot recognition and clear-depth claims have their own later validation gates. Do not add authentication providers, payments, real-time coaching, custom training, or distributed queues without a demonstrated need.

## Resume prompt

> Continue ShuttleSense tracking feasibility. Read AGENTS.md, tasks/HANDOFF.md, tasks/todo.md and docs/ground-contact.md. Preserve the desktop UI. The permission-confirmed videoplayback.mp4 is local and the selected player wears white. Detector-assisted MIL and manual restart were tested through 40s; fixed floor-patch checks support camera stability only for [12.466667s,40s). Twelve selected frames have five approximate support-shoe annotations, six uncertain and one airborne. Define the intended movement point and obtain consistent independent labels before evaluating foot positions or producing real heatmaps. Task 2 and Checkpoint A remain open. Explain technical terms simply as you work. Keep private footage/model/artifacts out of Git.
