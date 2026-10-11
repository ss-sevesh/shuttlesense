# ShuttleSense entry and editorial landing (2026-10-11)

User approved a local entry screen and requires review before any GitHub push.
This plan is separate from the existing analysis plans, which remain intact.

1. Build local entry inside one standalone public/index.html: split photo/form,
   a display name only, validation, guest access, and actual workspace navigation.
   Store only the display name locally; this is not authentication or a privacy gate.
2. Adapt the supplied Baseline structure into ShuttleSense: black/lime hero,
   oversized reveal, workflow carousel, numbered features, evidence cards,
   factual capability band, review guidance and a strong workspace CTA/footer.
   Embed the existing badminton illustration; no private footage or invented
   coaches, testimonials, results, member counts or contact details.
3. Keep HTML/CSS/JS in the single file, Onest plus pinned Lenis importmap only.
   Use rAF springs, adaptive rem rules, loader, parallax, reduced motion and a
   keyboard-safe menu/help modal. CDN failure must preserve entry and navigation.
4. Add /welcome and /login routes and a profile/website link to the existing
   workspace. Preserve root/workspace, saved recordings, analysis/model switches.
5. Verify desktop/mobile layouts, keyboard/axe, local name validation/storage,
   guest access, no network submission, overlays, carousel controls, CDN failure
   and existing upload/review/report flows. Present browser URLs for approval.

Design contract: editorial, sports-focused, matte black + bright green, warm white
supporting sections, large real badminton illustration, rounded framed sections,
precise labels and one main action per screen. Login is a dedicated full-screen
view rather than a modal. No new npm dependency or auth provider. No push until
explicit user approval of this completed result.

## Workspace continuity phase (2026-10-11)

Extend the approved visual direction to all four actual-data workspace tabs,
standalone saved review, upload/calibration/model controls, report and technical
panels. Reuse existing DOM and handlers; local Onest assets avoid CDN dependence.
Keep evidence image/overlay coordinates and compact exact-photo sizing unchanged.
Black/lime court headers are explicitly illustrative, never recording output.
Verify existing Paris434 controls and responsive accessibility in both themes.
All entry + workspace changes remain local until the user approves GitHub push.

## Connected start flow (approved 2026-10-11)

User approved both designs and requested GitHub commits/push. Root now opens the
website, entry/guest opens /workspace, and full-review return links preserve the
recording in Rally Review. Legacy root view/analysis links redirect to /workspace.
Website return remains available on mobile. No auth gate or model changes.
