# RAG repair — 2026-10-11

The previous implementation is not accepted. Repair the conversational flow rather than swap model size alone.

## Work split

1. Reliability/routing (primary): reproduce response bodies; distinguish general badminton concepts, checked personal plans and exact recording facts. Remove incorrect phrase-based rejection while retaining privacy, medical and unverified-impact boundaries. Expand reviewed badminton notes. Validate only actual retrieved citations.
2. Conversation/profile (conversation agent): reuse the persisted profile automatically; answer the question without reciting unrelated personal details; resolve short followups using current eligible conversation. Profile data must never enter persistent vectors.
3. Evaluation (evaluation agent): reproducible baseline and repaired API suite covering concepts, followups, saved preferences/availability, approved Paris434 evidence, missing evidence, medical requests and prompt injection. Record actual answers, status, citations and end-to-end latency. Backup/restore synthetic test profile and histories.
4. Review (review agent): use the installed Code Review MCP for the diff where possible; resolve actionable findings, then run focused regression tests and production build.

## Acceptance

- Saved profile works across reloads without being supplied by the user with each question.
- Generic technique questions do not turn into recording lookups or identical weekly schedules.
- Followups stay on topic and cite current sources.
- Real local inference produces useful, source-grounded replies; unsupported exact facts remain unavailable and causes remain unverified.
- Measure full API speed, including retrieval and validation; report cold/indexing costs separately. Do not claim speed or model superiority from generation-only timings.
- Preserve current reports, ending coach, outcomes, review UI and the unrelated untracked directory.

## Scope

Runtime: chat route, shared policy/context, retrieval/prompt, chat copy, curated guidance. Checks: focused Python/Playwright regressions, API benchmark, production build, MCP review. No new dependencies, cloud inference, video reprocessing or replacement report/vision models.

Status: implemented and locally verified; user acceptance remains pending.

## Results

- Reproduced two baseline HTTP422s and inspected actual error bodies. Routing, retrieval context and overbroad validation were repaired.
- Saved profile is automatically loaded; direct level/days/goals lookup avoids redundant generation and questionnaires. Follow-ups use eligible current-context history.
- Semantic Qwen3-Embedding/Qdrant search remains; curated BWF notes expanded and recording summary indexed. Exact original ending/pose/outcome evidence uses direct lookup.
- Compared two installed models with identical retrieved sources; selected pinned Qwen3-4B-Instruct-2507 for better useful answers in this limited sample, despite ~8% slower generation. Report/vision prompts unchanged.
- Final API suite: 17/17 HTTP successes, human-reviewed replies; three focused ending/timestamp reruns pass. Matching baseline 12 questions: 31.090 s versus 58.905 s. Open-ended replies remain 8–13 s; final evidence lookups 63–98 ms.
- Production build, optional setup readiness, 14 Playwright checks including real inference/privacy/staleness, 11 Python retrieval/prompt/installer tests and 3 benchmark isolation tests pass. Missing-runtime Playwright check skipped because runtime is installed.
- Code Review MCP handshake succeeds, but all review tools require a published PR. No PR/private data submitted; independent local diff review completed and its findings fixed.
- Benchmark synthetic profile/history restored. No report regeneration, footage rerun, new model download, Git push or cloud deployment. Larger/multilingual corpora and a fresh Windows install remain unverified; model prose can still add unsupported details.

Reproduction and operation: [RAG-CHAT.md](../docs/RAG-CHAT.md). Measurements and human review are saved under ignored `artifacts/rag-final-*` and `artifacts/rag-model-*`.
