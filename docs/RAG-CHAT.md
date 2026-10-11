# Local profiles and Coach Chat

Open `/workspace?view=profile` to save an optional player profile, or
`/workspace?view=chat` for Coach Chat. A current generated report also offers
**Chat about this match**. Existing website, entry, upload, rally review, attempt
photos, ending replay and report/PDF exports keep their existing behavior.

All profile fields are optional. Consent is separate for health details; declining
or withdrawing it clears conditions, injuries, restrictions and clearance flags
before persistence. Profile files live at ignored `data/player/profile.json`, not
in browser localStorage or shared vectors. These are local files, not an encrypted
vault, protected login or medical screening. Save failures stay visible; an unreadable
profile cannot be silently overwritten by an empty form.

Select a recording explicitly in chat, or choose general coaching without a
recording. Selection is not an assertion that this is the profile owner's footage.
There is no automatic player-history association of legacy recordings. Reference
notes, original measurements/user outcomes and generated report interpretation
remain separate source kinds. Links open exact cited times, paused and bounded by
the current rally window. Historical replies are labelled; re-ask to check current
facts. Each context keeps the latest 50 turns under ignored `data/chat/`. Deleting
a profile does not delete footage or chats; delete each chat with **Delete this chat**.
Profile changes exclude prior-profile turns from new model context.

Exact outcomes, durations, boundaries and timestamp measurements use direct lookup.
Prose retrieval uses current report/evidence hashes, source content, report version
and reviewed reference content. Changed markings, windows, reports or references
exclude stale vectors and prior-context conversation immediately. A final recheck
rejects replies if profile/evidence changed while generating. The model never
receives photos. Source IDs are allowlisted; numerical and scope checks run before
display or saving. Responses are buffered, rather than streaming unchecked tokens.

Food examples and weekly practice drafts use checked app templates, not arbitrary
LLM prescriptions. Unknown allergies require clarification; recognized allergies
filter a small ingredient catalog. Actual labels, preparation and cross-contact
still need checking; examples are not certified allergy-safe or copied AIS recipes.
Draft sessions use available days, a listed slot and the requested session limit,
at most two separated days and 30 minutes per session. They do not book appointments
or prescribe extra load. Cuisine/budget and skill-specific plans require adaptation
with appropriate professionals. Optional conditions/injuries/clinician restrictions
prevent personal food/activity plans; medical, supplements and weight-loss requests
are outside scope. Young players get parent/carer and professional-supervision advice.

`docs/rag-guidance.json` contains only short attributed notes with source links and
review dates. “Reviewed” means checked against those materials, not a personalized
assessment by a clinician or coach. No live scraping or autonomous web browsing
occurs during chat. These few notes and model-output checks do not guarantee semantic
truth or medical safety. Ask about exact evidence when a prose answer is refused.

## Optional setup

Ordinary analysis setup and website installation remain unchanged. After installing
the analysis runtime and pinned report model, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-analysis.ps1 -RagOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-analysis.ps1 -RagOnly -CheckOnly
```

This pins `qdrant-client==1.19.1` and installs/verifies Qwen3-Embedding-0.6B Q8_0
(639 MB, 1024 dimensions). Exact identities are in `analysis/chat_model.json`.
Text chat reuses the installed Qwen3-4B-Instruct-2507 report weights; prompts remain
separate. Qdrant uses persistent Python local mode in ignored `data/rag/qdrant`,
with separate guidance/evidence collections named by embedding checksum, dimensions
and chunking version. No Docker, Qdrant server, cloud account or extra npm package.

Chat/index work owns the existing exclusive analysis/report GPU lock. Competing work
gets an explicit busy response. One worker owns the Qdrant path and closes it before
returning; models unload afterward, including failure cleanup. This is a single
local app instance; unrelated Ollama clients or separate app copies do not share
its lock. Missing optional runtimes show setup guidance; website, review, reports,
profile and checked guidance remain usable without them.

## Verification, 2026-10-11

- Measured model/retrieval spike: persistent reopen, Windows competing-process lock,
  deletion, stale exclusion, two-recording isolation, correct cited sample answers.
  Top-1 2/3, top-3 3/3; 33.85 seconds for the tiny cold-start spike; sampled peak GPU
  4328 MiB on the 8188 MiB RTX4060. See `docs/rag-spike.md`, not an accuracy guarantee.
- Five Python RAG tests and seven unchanged report-validator tests passed.
- Twenty-eight distinct production browser/unit checks passed across website/entry,
  profile, chat, synthetic isolation/safety, existing Paris434 workspace/rally review,
  exact photos, upload controls and HTML/PDF paths. New chat answer and profile UI
  pass 320/768/1024/1440, keyboard and axe checks; chat answers also pass both themes.
- Real Ollama calls through the chat API reopened the persisted index. Synthetic
  injected profile instructions could not produce unchecked advice; inspecting
  test-owned vectors proved that profile/health sentinels were absent. An outcome
  changed during real model generation; no stale answer was returned or saved.
- An isolated tracked-file checkout installed with `npm ci` (zero reported npm
  vulnerabilities), built production without private recordings or Python/RAG
  runtimes, and passed fifteen distinct model-free checks including setup errors.
  Existing public tests' hardcoded port was adjusted only in the isolated test copy.
- Optional identity readiness passed; Ollama had no loaded models and the shared
  work lock was absent after checks. Synthetic profiles/history fixtures were removed
  and any pre-existing profile restored. No real health data was collected.

No new full-video worker run or report-model regeneration was needed for this feature;
existing Paris350_434 cached evidence and synthetic fixtures were used. Other browsers,
new hardware/OS installs, large-corpus load and multilingual safety are unverified.
No authentication, calendar integration, multi-user serving or cloud vector hosting.
