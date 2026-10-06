# ShuttleSense session handoff

## Current state

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

The user has not supplied a match video, a labeled dataset, a qualified coaching reviewer, a deadline, team size, compute hardware, or a budget. Inspect available project inputs and hardware; ask for the missing footage while doing independent setup. Never invent accuracy results or mark data-dependent tasks complete without real evidence.

After feasibility, build the smallest upload -> queued analysis -> persisted result -> existing UI slice. Validate files at the API boundary, keep videos out of Git, and show missing/uncertain results honestly. Shot recognition and clear-depth claims have their own later validation gates. Do not add authentication providers, payments, real-time coaching, custom training, or distributed queues without a demonstrated need.

## Resume prompt

> Continue ShuttleSense in this workspace. Read AGENTS.md, tasks/HANDOFF.md, tasks/plan.md, and tasks/todo.md. Preserve the desktop frontend. Start the real analysis implementation with the representative-video and tracking feasibility tasks. Ask for missing footage while completing independent setup. Keep sample data clearly separate from real results, and report validation limits honestly.
