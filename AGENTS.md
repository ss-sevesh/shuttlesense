## Session startup and Windows sandbox

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

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
