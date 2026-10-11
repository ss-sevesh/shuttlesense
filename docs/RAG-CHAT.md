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

Save your profile once. The chat server reads it automatically on every question;
you do not need to paste or re-enter it. General questions do not require profile
details. Only requested personal food/session drafts ask for relevant missing fields.

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

Ordinary analysis setup and website installation remain unchanged. Text chat can
be installed independently on Windows with Python 3.11+ and a running local
Ollama service; no CUDA/video pipeline is needed. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-analysis.ps1 -RagOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-analysis.ps1 -RagOnly -CheckOnly
```

This pins `qdrant-client==1.19.1` and installs/verifies Qwen3-Embedding-0.6B Q8_0
(639 MB, 1024 dimensions). Exact identities are in `analysis/chat_model.json`.
Text chat uses the pinned Qwen3-4B-Instruct-2507 Q4_K_M model (about 2.5 GB),
with thinking disabled, reusing the report-model installer and Ollama tag.
The earlier Qwen3.5-2B trial is superseded. The existing report and vision
models/prompts remain unchanged; text chat still receives no images. Setup creates
or reuses the shared Python environment and installs only the text dependencies.
Use `npm.cmd run setup:rag` / `npm.cmd run check:rag` as command shortcuts.
Qdrant uses persistent Python local mode in ignored `data/rag/qdrant`,
with separate guidance/evidence collections named by embedding checksum, dimensions
and chunking version. No Docker, Qdrant server, cloud account or extra npm package.

Chat/index work owns the existing exclusive analysis/report GPU lock. Competing work
gets an explicit busy response. One worker owns the Qdrant path and closes it before
returning; models unload afterward, including failure cleanup. This is a single
local app instance; unrelated Ollama clients or separate app copies do not share
its lock. Missing optional runtimes show setup guidance; website, review, reports,
profile and checked guidance remain usable without them.

## Verification, 2026-10-11

### Release readiness follow-up

Reproduced six generic HTTP422 failures with Ollama stopped; exact evidence and
checked guidance remained usable. Stopped-service requests now return actionable
503 responses; the browser/API regression verifies no saved answer and no leftover
work lock. Optional-runtime failures use 503; model-output validation remains 422.

The configured local API benchmark passed 17/17 requests in 60.840 seconds total
after starting Ollama, including concepts, follow-ups, saved profile, medical scope,
injection and approved Paris434 metadata. Model prose took 8.6–12.7 seconds in this
run; original-evidence lookups were 0.1–0.2 seconds. These are local timings, not a
speed guarantee. Review found missing basic-grip coverage, now addressed by a short
Badminton England reference; split-step wording was aligned with the BWF source.
The model can still add unsupported qualitative details; HTTP success is not proof
that every sentence is source-supported or coaching is validated.

A new tracked-file checkout passed npm ci (zero reported vulnerabilities),
production build/typecheck and 16 model-free browser/API tests without private
data or Python runtimes. Standalone `setup:rag` then created a new Python environment
and passed checksum/readiness checks and actual production chat inference, profile
vector exclusion and stale-evidence rejection. That environment had no PyTorch or
OpenCV. It reused this machine's installed Ollama weights, so this is not a cold
model download or a different-machine GPU test. The main configured app also passed
10 profile/chat browser tests with actual inference and the separate service-outage
regression. Synthetic profile/history originals were restored by the checks.

GitHub Actions runs the reproducible model-free checks on Linux and Windows.
Actual local inference stays opt-in; no private video, profile or vectors enter CI.
Both OS jobs passed [the published release checks](https://github.com/ss-sevesh/shuttlesense/actions/runs/38158901310)
at e01d333, including production build, types, browser/API tests and synthetic
Python retrieval/conversation/installer/attempt-photo suites.
See the current release checklist in [tasks/todo.md](../tasks/todo.md).

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
reference sources, and at most four recent matching question/answer turns. Short
follow-ups use earlier questions to preserve the retrieval subject; previous answers
and profile fields are never indexed. General
chat has no recording sources. Profile data and conversation are not indexed. The
question is sent to the local embedding model for search, without being saved as a
vector source. No photos or raw video enter text chat, and no chat data goes to a
cloud model. Questions, validated replies and citations are saved in local history;
information typed into a question can therefore remain there until chat deletion.

**Random** fills only an unsaved sample profile in the form. It clears health
fields and consent; it does not infer health, send a chat or call a model. Save only
after replacing samples with actual details. Random is disabled if the saved profile
could not be loaded, preventing accidental replacement of unreadable data.

## Earlier 2B trial, 2026-10-11 (superseded by repair)

The earlier trial used official Ollama `qwen3.5:2b-q4_K_M`, separately pinned by manifest,
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

## RAG repair, 2026-10-11

Chat again uses the installed, checksum-pinned Qwen3-4B-Instruct-2507 weights with
its own chat prompt. Report and vision-ending prompts/models were not changed.
The optional installer reuses the report-model installer for this local custom tag;
it does not try to pull a custom name from the public Ollama registry. The original
2B comparison was too small to establish conversational quality.

Semantic search remains local: Qwen3-Embedding supplies a query vector to Qdrant's
cosine search, filtered by selected analysis and current evidence hash. Recording
and guidance vectors remain separate. The recording summary is now retrievable.
The reviewed corpus adds BWF split-step progression, grips, clear/drop and recovery
notes with source links. It remains a small corpus, not complete badminton knowledge.

General technique questions no longer turn into exact-recording lookups just because
they contain “start”, “end” or “lost”. A drill explanation no longer automatically
produces the weekly template. Saved level/days/goals use direct profile lookup.
Checked session drafts can focus on a saved backhand goal; short schedule follow-ups
retain the same saved limits. Other follow-ups retrieve with the previous topic.

Ending/loss explanation questions select the requested original window and the
matching attempt frame. They describe the user marking, estimated pose and image
separation; a missing shuttle/wrist remains unavailable. Exact timestamp queries
take precedence. No model decides a loss cause or first ground contact. Generated
prose is checked against actual retrieved source IDs and canonical source metadata,
not the whole available corpus. Personal prescription/impact/cause checks remain.

The realistic baseline reproduced two HTTP422s, an invented split-step description,
wrong recording routing and a drill replaced by a schedule. The repaired 17-question
API run returned 17/17 HTTP200; actual replies were reviewed, not just statuses.
A precise timestamp routing regression found during that run was corrected and
verified separately. The same original 12 questions took 31.090 s versus 58.905 s
in single sequential runs, including baseline failures. New ending explanations
took approximately 0.11 s; model prose had median 8.813 s, first cold/indexing
request 12.805 s. These are local measurements, not service guarantees.

Two installed models were compared on eight probes with identical retrieved sources.
Generation-only means were 4.994 s (2B) and 5.413 s (4B), approximately 8% slower for
4B. Human review favored the 4B's usefulness, but both showed unsupported additions;
this single-pass comparison does not establish general superiority. Exact numbers
and uncertain endings therefore do not rely on generative inference. Raw isolated
answers/timings are in ignored `artifacts/rag-*-realistic.json` and model-comparison
artifacts. Reproduce with `scripts/benchmark-rag.py`; it backs up/restores private
profile/history, uses a synthetic profile and copies only approved Paris434 context.
Do not run it alongside profile-editing tests or user edits.

Code Review MCP handshake succeeded (31 PR tools); it cannot review an unpublished
local diff. No PR or private evidence was submitted. Independent local review found
and fixed citation metadata, scope/cause validation and missing-image-data issues.
