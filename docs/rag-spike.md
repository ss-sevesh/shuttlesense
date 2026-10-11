# Local RAG baseline, 2026-10-11

The optional runtime uses Qdrant client 1.19.1 in persistent Python local mode and
Ollama Qwen3-Embedding-0.6B Q8_0 (1024 dimensions). Full manifest/model SHA256s are
pinned in `analysis/chat_model.json`; installation verified the downloaded blob.
Chat reuses the existing pinned Qwen3-4B-Instruct-2507 Q4_K_M report weights with a
separate prompt. No report/vision prompts or UI changed in this slice.

Actual Windows spike: persistent close/reopen, competing-process exclusion,
two-recording filtering, stale-hash exclusion, replacement and deletion passed.
Five unit tests passed including model failure preservation and shared GPU locking.
Three synthetic questions took 33.85 seconds including cold model loads, indexing,
retrieval, generation and unload. Top-1 retrieval was **2/3**; top-3 was **3/3**.
These tiny fixtures are a feasibility check, not an accuracy benchmark. Generic
outcome wording ranked generated practice above user markings. Exact facts must
use direct lookup, as specified in the approved plan; semantic ranking cannot be
the authority for outcomes, timestamps or measurements.

Measured answers with three retrieved sources:

- Wrist relation: “The shuttle was 48 pixels away from the near-player wrist proxy
  at 12.5 seconds.” Citation: original snapshot. This is image separation only.
- Outcome: “Rally 3 was marked lost by the user, and the cause of this loss is
  unknown.” Citation: user marking.
- Practice: “Optional shadow-footwork practice for 30 seconds.” Citation: generated
  interpretation, not original evidence or a proven cause.

Sampled every ~200 ms plus command overhead: peak total GPU memory 4328 MiB
(8188 MiB available), aggregate Python working set 260.8 MiB, aggregate Ollama
working set 361.2 MiB. Values include other processes and are sampled peaks,
not exact allocations. Ollama `/api/ps` was empty afterward. CLI spike owns the
same exclusive `data/analysis-jobs/active.json` lock used by analysis/reports.
It refuses existing locks rather than attempting unsafe CLI stale recovery.

Reproduce after ordinary analysis setup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-analysis.ps1 -RagOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-analysis.ps1 -RagOnly -CheckOnly
& data/hf-racquet-env/Scripts/python.exe -m unittest discover -s analysis -p test_rag_chat.py
& data/hf-racquet-env/Scripts/python.exe analysis/rag_chat.py --spike
```

This setup is optional. Normal setup does not download embeddings. Missing RAG
packages do not affect website, upload, rally review or reports. No personal or
health information was collected; only synthetic fixture text was embedded.
Model citations are validated for membership, not semantic truth. Food/medical
safety and user-facing chat remain separate acceptance work.

Primary API references: [Qdrant local mode](https://github.com/qdrant/qdrant-client#local-mode),
[Ollama embedding model](https://ollama.com/library/qwen3-embedding:0.6b),
[Ollama embed API](https://docs.ollama.com/api/embed).
