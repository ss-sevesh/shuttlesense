# ShuttleSense local player profile and RAG chat plan

Status: approved scope implemented locally on 2026-10-11; all six checklist slices verified.
User did not accept reply quality. The active repair plan is [rag-repair-plan.md](rag-repair-plan.md).
Measured baseline: docs/rag-spike.md. Setup and limits: docs/RAG-CHAT.md.
This separate plan preserves the existing analysis/design plans. Task checklist below
is the target for this feature. User requested a plan before development starts.

## Outcome and scope

Extend the existing local player entry with an optional, editable player profile.
After report generation, offer Chat about this match; also add Coach Chat and Player
Profile entries to the existing workspace. Answer badminton gameplay, practice,
weekly schedule, recovery and general sports-food questions with visible sources.
Keep the approved website/workspace identity and existing models/reports intact.
Continue local single-user operation; this is not authenticated multi-user hosting.

## Current evidence

Existing text report model: pinned Qwen3-4B-Instruct-2507 Q4_K_M via Ollama (2.5GB).
Machine has the previously tested RTX4060 Laptop 8GB GPU. Repo has no Qdrant client,
configuration or integration; no listener observed on port6333. Docker command is
available but is not required by the proposed first version. No Qdrant tool exposed.
Current entry stores only a browser display name, not a protected account.

## Proposed profile

- Basics: display name, age in years (not birth date), optional height cm/weight kg.
- Badminton: skill level, singles/doubles, dominant hand, goals, current weekly play.
- Availability: available days/time slots, session length, court/gym access; optional
  sleep/recovery notes. Ask for timezone only when scheduling requires it.
- Food preferences: dietary pattern, allergies/intolerances, preferred cuisine,
  optional food budget. No automatic calorie targets from height/weight.
- Optional health: relevant conditions, current pain/injury, clinician-imposed
  exercise/food restrictions and whether clearance has been advised. Skippable.
  No collection of physician contacts, full records or medication doses by default.
- Separate clear consent to use optional health details in local chat; users can
  edit, clear or decline them and still access review/report features.

Use ACE's professional health/exercise-history questionnaire as a reference for
activity, goals and exercise restrictions, without copying it or claiming medical
screening/clearance. Use reviewed professional sports-nutrition notes as sources.

## Architecture decisions

1. Reuse installed Qwen3-4B-Instruct-2507 weights for chat with a separate chat prompt
   and output contract. Existing report and vision prompts stay unchanged. Benchmark
   groundedness and memory early; do not claim model suitability for medical treatment.
2. Qwen3-Embedding-0.6B via Ollama for text retrieval. Official Ollama listing is639MB.
   Pin model identity/digest at installation; embedding collection version includes
   model identity, dimensions and chunking version. Never mix incompatible vectors.
3. Qdrant Python persistent local mode at ignored data/rag/qdrant. CPU search, one
   serialized owner per index operation; no competing clients on the same local path.
   Check Windows dependency/locking behavior early. Docker/server mode is a later
   option if measured concurrency/scale requires it, not a second v1 implementation.
4. Profile facts go directly into each request; do not rely on semantic retrieval
   to remember allergies/restrictions. Health/profile data stays out of shared vectors,
   browser localStorage and diagnostic logs. Local files are not an encrypted vault
   or a login security boundary; disclose that accurately.
5. Index current report sections and bounded rally evidence with analysis ID, evidence
   hash, report version, rally ID, timestamp and source kind. AI prose remains labelled
   as generated interpretation; original measurements/user markings have precedence.
6. Maintain a separate shared collection of short reviewed badminton/practice/sports
   nutrition/recovery notes with source URL, date and attribution. Respect content
   permissions; no indiscriminate scraping or long copied articles.
7. Retrieval filters selected recording (or explicitly selected comparisons) and local
   profile associations. Never silently associate every existing video with a player;
   legacy recordings need explicit association for player history. Direct lookup handles
   exact numerical/timestamp questions; vectors retrieve relevant prose.
8. Prompt = rules + current consented profile + selected report/evidence + retrieved
   reference notes + bounded recent conversation + question. User/document text is
   untrusted context, not instructions. Enforce request sizes, allowlists and origins.
9. Answers cite valid source IDs and clickable rally timestamps/reference links. Say
   evidence unavailable when retrieval is insufficient. Do not invent shuttle contact,
   loss causes, intent, physical distance, diagnoses or medical clearance.
10. Changing outcomes/boundaries/report version invalidates the index source hash.
    Stale evidence is excluded immediately; reindex current report without changing
    analysis results. Store chats separately and mark old answers as historical.
11. Serialize chat/index model work with existing analysis/report GPU use; release
    embedding/chat models when finished. Missing setup and busy states remain explicit.
    Website/demo/upload review must still run when RAG dependencies are absent.

## Implementation slices and acceptance checks

- [x] 1. Local retrieval/model spike. Install/pin optional embedding and Qdrant
      dependencies; verify persistent reopen, Windows locking, retrieval accuracy,
      RAM/VRAM and grounded sample answers before expanding UI. Add checksum/identity
      readiness to setup. Files: analysis/rag_chat.py, analysis/chat_model.json,
      scripts/setup-analysis.ps1. Dependency: none.
- [x] 2. Profile end-to-end. Validated loopback API + local persistence + accessible
      profile form; save/reopen/edit/delete/consent work and no-health path works.
      Files: lib/player-profile.ts, app/api/profile/route.ts, components/player-profile.tsx,
      workspace navigation. Dependency: none; medical generation remains unavailable.
- [x] 3. Report retrieval end-to-end. Upsert/delete current report chunks, exact evidence
      lookup, reviewed guidance corpus and source filters; stale/mismatched recordings
      cannot be retrieved. Two synthetic recordings prove isolation. Dependency:1.
      Files: analysis/rag_chat.py, lib/chat-context.ts, data/rag (ignored), curated docs.
- [x] 4. Chat end-to-end. Bounded validated local chat API, streaming UI where supported,
      match selector, suggested questions, valid citations/timestamp replay links,
      history/reload/delete. No photos to text chat model. Dependency:1,2,3.
      Files: app/api/chat/route.ts, components/coach-chat.tsx, coach-workspace.tsx,
      match-report.tsx, app/globals.css.
- [x] 5. Food/schedule support. Source-backed food examples and draft weekly sessions
      respect availability, allergies and clinician restrictions; ask relevant missing
      information. No diagnosis, medication changes, condition-treatment diets,
      supplement prescriptions, aggressive dieting or youth weight-loss programs.
      Symptoms/injury needing care prompt appropriate professional help, not generated
      clearance or rehabilitation. Deterministic scope checks plus output checks;
      prompt-only controls are insufficient. Dependency:2,3,4.
- [x] 6. Full acceptance. Fresh clone without RAG remains functional; optional setup
      and real local retrieval/chat reopen work; empty/no-report/missing-model/busy/error
      states are clear. Browser 320/768/1024/1440, keyboard/axe, profile injection,
      stale evidence, cross-recording leakage, allergies/restrictions, minor users,
      deletion and GPU serialization checks pass. Existing upload/review/PDF regressions
      pass. Only approved Paris350_434 footage for any real-video checks; synthetic
      fixtures for isolation and health-policy tests. Dependency:all previous slices.

## Delivery checkpoints

After1: agree baseline model/retrieval quality from measured answers, not model size.
After2+3: profile storage/retrieval correctness validated before personal advice.
After4+5: preview complete user flow and examples for review.
After6: document setup/limits, review diff and deliver approved commits. No cloud
accounts, vector hosting, live autonomous web browsing, new vision model or calendar
integration in this first scope.

## Primary references checked

- https://github.com/qdrant/qdrant-client (persistent local mode, development/prototype)
- https://qdrant.tech/documentation/security/ (local service exposure guidance)
- https://ollama.com/library/qwen3-embedding:0.6b (embedding model/API)
- https://contentcdn.eacefitness.com/certifiednews/images/article/pdfs/HealthHistory.pdf
- https://www.ausport.gov.au/ais/nutrition/supplements/group_a

## Open approval and limits

User approved this plan on 2026-10-11. Implementation and local acceptance are complete;
preview is available in the existing workspace. No cloud deployment or GitHub push occurred.
Proposed identity remains the existing local
profile, not real accounts; authenticated hosting would require a separate scope.
The embedding was downloaded and checksum verified. Qdrant 1.19.1 was already available
and is now pinned as an optional dependency. Synthetic profile/health fixtures only were
used for verification; no real health information was collected. Generated prose remains
experimental. Food and scheduling use bounded app templates and source links, with
clinical restrictions referred to professionals. Responses are buffered until output
checks pass, rather than displaying unvalidated streaming tokens. See docs/RAG-CHAT.md
for measured checks and limits; adding RAG cannot guarantee medical/nutrition quality.
