# Self-Healing Knowledge Base

A Knowledge Governance Platform that continuously audits an enterprise knowledge base for
**stale, duplicated, contradictory and unsupported** information, **quarantines poisoned
(prompt-injection) documents**, proposes fixes, **auto-applies only high-confidence ones**,
routes uncertain ones to human reviewers, and keeps a **tamper-evident, reversible
history** of every change on a hash chain.

Core principles: document text is *data, never instructions*; the LLM (optional) may only
return validated labels and has **no write access**; every change is a new immutable
hash-chained version (nothing is ever deleted, every fix reversible); the system works
**fully offline** (rules + TF-IDF) and improves when an API key is present; secure by
default (no default credentials, no default secrets).

## Quickstart

```bash
# Docker (recommended)
export SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
docker compose up --build        # app on :8001 (SPA served from the same origin)

# Local development
cd backend && uvicorn server:app --host 0.0.0.0 --port 8001 --reload
cd frontend && yarn dev          # Vite proxies /api -> :8001, app on :3000
```

On first run the UI shows the **setup screen** — create the first admin there. No default
credentials ship. Subsequent users (admin/reviewer/viewer) are managed in **Admin → Users**.

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `SECRET_KEY` | **yes** | JWT signing secret. The app **refuses to start** if missing, shorter than 16 chars, or equal to a known default. |
| `MONGO_URL` | yes (compose sets it) | MongoDB connection string (default `mongodb://localhost:27017`). |
| `DB_NAME` | yes | Database name (default `app`). |
| `GEMINI_API_KEY` | no | Enables the label-only Gemini judge (`gemini-2.5-flash`, temperature 0, JSON output) and Gemini embeddings. Without it the engine runs fully offline (rules + TF-IDF). |
| `CORS_ORIGINS` | no | Comma-separated allowed origins (default `*`). |
| `STATIC_DIR` | no | If set to a built SPA directory, FastAPI serves it (used by the Docker image). |

Optional OIDC SSO is not enabled in this build; group→role mapping would slot into
`lib/deps.py` (the three roles are `admin`, `reviewer`, `viewer`).

## Stack adaptations (spec asked for PostgreSQL + FAISS/sentence-transformers)

| Spec | Shipped | Behavior preserved |
|---|---|---|
| PostgreSQL + triggers rejecting UPDATE/DELETE on versions/audit | MongoDB | Append-only enforced at the data-access layer (`lib/ledger.py` is the only writer and only inserts); out-of-band edits are **caught by `verify_chain` naming the exact seq** (tested). |
| Advisory lock for serialized ledger appends | Atomic `find_one_and_update` counters + process-local asyncio lock | Sequence numbers stay strictly linear. |
| FAISS/HNSW ANN index | Exact cosine top-k over a sparse TF-IDF matrix (NumPy/SciPy), k=8 | Same recall at this scale; the vector index is pluggable. |
| sentence-transformers fallback | TF-IDF-only offline mode; Gemini embeddings when `GEMINI_API_KEY` is set | Hybrid blend weight is admin-adjustable (`embedding_weight`). |
| Python 3.12 | Python 3.11 (pod interpreter) | No behavioral difference for this codebase. |

## The 3-minute acceptance demo

1. **Dashboard → Load demo corpus** (~70 labeled docs incl. contradictions, duplicates, stale pairs, unsupported claims, injection attacks, benign hard negatives).
2. **Run self-healing scan** — high-confidence fixes auto-apply; ties land in the review queue.
3. **Review queue** — resolve a tie by hand (Accept is blocked on proposal-less ties; use Synthesize/Keep both).
4. **Poison lab** — fire an attack payload: it is quarantined, malicious spans are highlighted, claims in the live KB are unchanged.
5. **Ledger & rollback** — undo an auto-applied fix (Review queue) or roll a document back; the chain-verification banner stays green.
6. **Evaluation** — P/R/F1 with 95% CIs per fault type + false-positive rate + scale benchmark. Synthetic-corpus scores are not production accuracy (stated in the UI).

## Tests

```bash
cd backend && pytest          # hash-chain tamper detection, append-only rollback, quarantine,
                              # benign non-flagging, ties→human, auto-fix+undo, RBAC,
                              # default-secret refusal, API flow, incremental scan
cd frontend && yarn typecheck # strict TS across the Pydantic↔TS boundary
```

CI (`.github/workflows/ci.yml`) runs the backend suite against a Mongo service, the
frontend typecheck, and a docker build that also proves the app refuses to start without
`SECRET_KEY`. The SRS with the architecture diagram lives in `docs/SRS.md`.
