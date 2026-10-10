# Contributing

Use the README quickstart and `/demo` first. Preserve the existing cream/green UI,
plain language, keyboard accessibility and honest evidence labels. Read AGENTS.md
and tasks/HANDOFF.md before changing the local model pipeline.

For UI changes run the production build, typecheck and public-demo browser test:

```sh
npm run build
npm run typecheck
npx playwright test tests/public-demo.spec.ts
```

Python report logic has synthetic checks:

```sh
python -m unittest discover -s analysis -p test_match_report.py
python -m unittest discover -s analysis -p test_shot_coach.py
```

These checks require the corresponding NumPy/OpenCV/Python packages. Playwright
uses installed Chrome. Local real-video tests reference ignored result manifests
and are not fresh-clone tests. Use only the currently approved Paris350_434 clip
for those tests; historical WhatsApp/425/videoplayback suites are not authorized.

Keep videos, weights, outputs and personal information out of commits. Public
media must come from the synthetic demo generator, not private test clips.
Do not weaken confidence gates or label estimates as confirmed impacts, intent,
winner detection, physical distance or model accuracy.

Report issues with steps, expected/actual behavior, relevant environment versions
and synthetic reproductions where possible. Use focused commit subjects describing
the resulting behavior. Explain meaningful validation and remaining limits in PRs.
