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
Text chat now uses separately pinned Qwen3.5-2B Q4_K_M (about 1.9 GB including
its projector), with thinking disabled. The existing Qwen3-4B report and vision
models/prompts remain unchanged; text chat still receives no images. Qdrant uses persistent Python local mode in ignored `data/rag/qdrant`,
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

## Response time and request data

The original 4B model tiny spike took 33.85 seconds for three questions including cold loads
and indexing, about 11 seconds per question on average. This is not a timing promise
for larger reports. New or changed reports need embedding first; source count,
answer length and current machine load affect time. Models unload after each chat,
so a repeat request still reloads them. Exact facts and checked food/schedule paths
skip model generation. Busy analysis/report work returns a retry message rather
than queueing; model worker timeout is six minutes, not the expected response time.

The browser sends the question, selected analysis ID (or general context), and
current reviewed rally boundaries to the local chat API. The server reads the saved
validated profile, selected recording evidence/current report and reference notes.
For model replies, the local worker indexes source text only and embeds the question
for search. Ollama's text model receives rules, the question, the saved profile
(including health details only with consent), up to three recording sources and two
reference sources, and at most two recent matching question/answer turns. General
chat has no recording sources. Profile data and conversation are not indexed. The
question is sent to the local embedding model for search, without being saved as a
vector source. No photos or raw video enter text chat, and no chat data goes to a
cloud model. Questions, validated replies and citations are saved in local history;
information typed into a question can therefore remain there until chat deletion.

**Random** fills only an unsaved sample profile in the form. It clears health
fields and consent; it does not infer health, send a chat or call a model. Save only
after replacing samples with actual details. Random is disabled if the saved profile
could not be loaded, preventing accidental replacement of unreadable data.

## Faster chat model follow-up, 2026-10-11

Chat now uses official Ollama `qwen3.5:2b-q4_K_M`, separately pinned by manifest,
text-weight SHA256 and projector SHA256. Optional RAG setup installs and hashes both
models. Thinking is explicitly disabled, while the answer schema constrains citation
IDs to retrieved sources. Profile/health constraints and all server output checks
still apply. Embedding a question once supplies both recording and reference search;
filters and separate collections remain intact. Models still unload after each chat.

Three identical tiny grounding questions averaged 4.51 seconds with the prior 4B
model and 3.97 seconds with the new 2B model (including load/unload, excluding
retrieval/indexing), about 12% faster. All three basic content/citation checks passed
with the constrained schema. The initial unconstrained 2B candidate failed citation
checks; do not remove the enum/schema or server checks. These are small feasibility
checks, not proof of superior intelligence, semantic truth or medical safety.
A successful full API reply including indexing/retrieval took 12.438 seconds on a
synthetic recording. Larger reports still need a broader latency benchmark.

Chat no longer labels every lock failure as 429: genuine live contention remains
429; unreadable/unavailable locks return 503. A malformed-lock regression reproduces
the old false-busy response and verifies the distinction. The reported earlier 429
was not reproduced with the original request; no lock/model remained at inspection.
