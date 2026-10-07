# ShuttleSense

Local tracked movement preview: open `/movement`, or choose **View tracked clip
movement** in the workspace. It shows a coarse heatmap from saved player boxes,
separate from the fictional coaching dashboard. Exact shoe contact is deferred.
See [the preview report](docs/ground-contact.md#coarse-movement-preview) for the
export command. Private results must exist locally; they are excluded from Git
and deployment bundles. This does not automatically analyze new uploads.

Windows sandbox shortcut (only after a setup failure; run with approved execution
outside the sandbox): `npm.cmd run sandbox:fix -- -CheckOnly`, then
`npm.cmd run sandbox:fix`. Retry a sandbox command immediately. Session agents
must read [AGENTS.md](AGENTS.md), which now points directly to this repair.

Desktop web prototype for a badminton coaching workspace, built with Next.js, React, TypeScript, native CSS, and Phosphor icons.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. Use `npm run build` and `npm start` for a production preview. `npm run test:ui` runs the Playwright interaction and axe accessibility checks using an installed Chrome browser; `npm run typecheck` checks TypeScript.

The UI includes match overview, rally review, court heatmap, evidence links, drill instructions and completion, theme switching, report/plan downloads, and local video preview. Filters and selected rallies are reflected in the URL. Drill completion is saved locally.

All match statistics, coaching explanations, heatmap values, and movement trails are fictional demo data. The court image is AI-generated. Choosing a video opens native playback on your device; it does not upload to a server or run AI analysis. The full analysis implementation remains in [the project plan](tasks/plan.md).

For a new coding session, start with [the handoff notes](tasks/HANDOFF.md) and the [task checklist](tasks/todo.md).

Tracking feasibility preparation and local Python checks are documented in [the evaluation protocol](docs/evaluation.md). The [first-video report](docs/first-video.md) records an offline person-detection experiment; stable identity tracking and coaching are not connected to the UI yet.

The [white-player tracking report](docs/white-tracking.md) and [ground-contact review](docs/ground-contact.md) record short-segment experiments, camera stability checks and remaining validation limits. Run `python analysis/test_feasibility.py` for offline regression checks after installing `analysis/requirements.txt`.

Source font and image assets are included locally. `scripts/prepare-assets.mjs <image-path>` is a one-time asset preparation helper, not required to run the app. The test video is a generated one-second green frame used solely to verify native playback.

Verified with 5 Playwright checks, axe scans in light/dark themes, and a clean production browser console. Desktop Lighthouse: performance 100, accessibility 100. Captures and the audit are in `artifacts/`. The local taste skill informed the palette, typography, and spacing; product interactions were reviewed against the current [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Design dials: variance 6, motion 3, density 5.
