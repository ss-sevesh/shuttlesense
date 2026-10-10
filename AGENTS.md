## Session startup and Windows sandbox

## Testing footage (user instruction, 2026-10-10)

Use only `Men's Singles Badminton FULL FINAL🏸 _ Paris Replays_350_434.mp4`
for real-video tests from now on. Do not substitute `_350_425`, WhatsApp clips,
or `videoplayback.mp4`, including when choosing existing integration tests.
Synthetic unit/control tests are fine. Current focus is rally division and
shuttle/ground-touch evidence: YOLO players, TrackNet shuttle and ground model on;
body pose, shot classification, LLM and contact-image extraction off. Additional
models may run only when the user selects their analysis switches or requests them.

Latest user request enables pretrained near-side body pose and visible near-side
white court markings. Body pose now defaults on; shot classification and LLM
remain off. Far-side tracking may support rally starts, but player analysis and
hit-pose evidence must remain near-side. Pose/contact and line-fit estimates must
not be described as perfect models, confirmed impacts, or exact in/out calls.

Read `tasks/HANDOFF.md` before starting work. Do not make the user explain the
sandbox repair again or search previous conversations for it.

If a command fails before execution with `helper_unknown_error: setup refresh had
errors`, use the saved shortcut: `npm.cmd run sandbox:fix -- -CheckOnly`, then
`npm.cmd run sandbox:fix`. These commands need approved execution outside the broken
sandbox. The script checks the latest log and stops only matching locked
`node_repl.exe` helpers; it does not stop Codex or change permissions/settings.
Retry `Get-Location` inside the sandbox immediately, before restarting browser
tools. Do not run the repair when the sandbox works. If the script finds a
different failure, inspect the latest log instead of killing unrelated processes.

On Windows PowerShell, always invoke `npm.cmd`/`npx.cmd`, never the policy-blocked
`.ps1` shims. Do not change the global execution policy. Child scripts explicitly
set their own process policy. Use `npm.cmd run screenshot` to save the local
movement preview under `artifacts/` after starting the app; browser MCP screenshot
tools can display images, but their workspace roots currently reject file saving.

The managed permission profile protects `.git`. Run Git mutations (`add`, `commit`,
`push`) through approved `require_escalated` execution immediately, using the
existing narrow prefix rules, rather than first trying a sandbox write. Keep
read-only Git inspection sandboxed. Do not change Git ACLs or disable sandboxing.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
