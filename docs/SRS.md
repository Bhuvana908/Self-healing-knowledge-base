# SRS — Self-Healing Knowledge Base

## 1. Architecture

```mermaid
flowchart LR
    subgraph Browser
        UI[React 19 SPA<br/>sidebar governance console]
    end
    subgraph FastAPI["FastAPI (api_router, /api)"]
        AUTH[auth: setup/login/JWT cookie/RBAC]
        INGEST[ingest + injection defense]
        SCAN[scan orchestrator]
        RESOLVE[resolve / undo / rollback]
        LEDGER[ledger appends + verify]
        EVAL[evaluation + benchmark]
    end
    subgraph Mongo[(MongoDB)]
        DOCS[docs]
        VERSIONS[versions · hash chain]
        AUDIT[audit · hash chain]
        CLAIMS[claims + TF-IDF vectors]
        CONFLICTS[conflicts]
        MISC[users / settings / scan_runs / eval_labels / counters]
    end
    LLM{{Gemini 2.5 Flash<br/>label-only, optional}}

    UI -->|relative /api via Vite proxy| AUTH & INGEST & SCAN & RESOLVE & LEDGER & EVAL
    INGEST -->|version 1 + quarantine before indexing| DOCS
    SCAN --> CLAIMS
    SCAN <--> LLM
    RESOLVE --> LEDGER
    LEDGER --> VERSIONS & AUDIT
```

Detection pipeline: **ingest → normalize + injection scan (quarantine gate) → claim
extraction → frozen TF-IDF space (incremental: only new/changed docs embedded) → exact
cosine kNN (k=8) → classification → subtyping → confidence → routing (auto ≥ 0.80 /
human 0.40–0.80 / dismissed < 0.40; ties always human) → deterministic apply via the
hash-chained ledger**.

## 2. Data model (MongoDB adaptation of the PostgreSQL schema)

| Collection | Fields |
|---|---|
| `docs` | id, title, source_type, trust, doc_date, status (active\|quarantined), quarantine_reason, current_version_no, indexed_version, created_at |
| `versions` | seq, id, doc_id, version_no, text, author, reason, lineage (JSON), ts, prev_hash, hash — append-only |
| `audit` | seq, ts, actor, action, target, detail, prev_hash, hash — append-only |
| `claims` | cid (content hash), doc_id, text, doc_version_no, numbers, negations, vector (sparse TF-IDF) |
| `conflicts` | id (content hash), type (contradiction\|duplicate\|stale\|unsupported), claim_a/b, text_a/b, doc_a/b, sim, confidence, route (auto\|human\|dismissed), proposal (JSON), status, explanation, created |
| `scan_runs` | id, ts, actor, claims, pairs, seconds, found, auto_fixed, awaiting_human, dismissed, reindexed_docs |
| `users` | username, salt, pw_hash (PBKDF2-SHA256, 240k iters), role |
| `settings` | trust table, thresholds, auto_apply_enabled |

Append-only: the spec's UPDATE/DELETE triggers are enforced at the data-access layer
(`lib/ledger.py` is the sole writer and only inserts); tampering is detected by chain
recomputation, naming the exact seq. Ledger appends are serialized (asyncio lock + atomic
counters), preserving the advisory-lock guarantee of a strictly linear chain.

## 3. Hash chain

`hash = SHA-256(prev_hash | doc_id | version_no | text | author | reason | lineage | ts)`
(canonically serialized lineage, `|`-joined); audit hashes
`prev_hash | ts | actor | action | target | detail`. First record uses `prev_hash =
"GENESIS"`. `verify_ledger()` recomputes both chains and returns `(ok, message)` naming
the exact seq on failure. Rollback never deletes — it appends the old text as a new
version with reason `rollback to vN`.

## 4. Detection engine (formulas)

- **Injection**: zero-width/bidi strip + NFKC; weighted regexes with noisy-OR
  `p = 1 − Π(1−w)`; hidden markup adds +0.15 when any pattern matched; flag at
  `p ≥ 0.6` or (`p ≥ 0.3` ∧ hidden); ambiguous (0.3–0.6) may consult the label-only LLM.
- **Claims**: sentences ≥ 5 words; normalization lowercases, converts number words to
  digits, masks digits for similarity, compares numbers and negation words separately.
- **Retrieval**: TF-IDF (1–2 grams, sublinear tf, stop words) — exact cosine kNN, k=8,
  candidate floor 0.45; incremental (unchanged docs never re-embedded).
- **Classification**: sim ≥ 0.80 ∧ no numeric/negation diff → duplicate; sim ≥ 0.60 ∧
  diff → conflict; 0.45–0.60 ∧ diff → LLM judge (offline fallback: content-word Jaccard).
- **Subtyping**: stale if date gap > 365d ∧ newer trust ≥ 0.8×older; contradiction winner
  = higher trust (gap ≥ 0.05), else newer date (gap ≥ 30d), else genuine tie (proposal
  "none", always human). Unsupported = authority phrase with no citation marker.
- **Confidence** (clamped 0..1):
  duplicate = `0.5·sim + 0.3 + 0.2·min(1, trust_gap/0.5)`;
  stale = `0.35·sim + 0.30·min(1, gap/730) + 0.35·min(1, max(0, Δtrust+0.5)) + 0.25`;
  contradiction = `max(0.40, 0.35·sim + 0.45·min(1, trust_gap/0.5) + 0.20·min(1, gap/365))`;
  tie = `max(0.40, 0.35·sim)`; unsupported = `0.55 + 0.4·(1−trust)`.
- Conflict ids are content hashes — re-scans never duplicate resolved findings; each scan
  clears open/dismissed findings and regenerates them.

## 5. Security

Roles admin > reviewer > viewer enforced per route (`lib/deps.py`). First admin via
`POST /api/auth/setup` (refuses once a user exists). JWT (HS256, 12 h, rotating jti) in an
httpOnly cookie. PBKDF2-SHA256 + per-user salt. Login rate limiting (5 fails / 15 min)
with failed sign-ins appended to the audit chain. Startup refuses missing/short/default
`SECRET_KEY`.

## 6. API

`POST /auth/setup|login|logout`, `GET /auth/me|status|users`, `POST /auth/users`,
`PATCH /auth/users/{username}`, `GET /health` (chain status), `POST /documents`,
`GET /documents[?status=]`, `GET /documents/{id}/history`,
`POST /documents/{id}/rollback/{version}` (admin), `POST /scan`, `GET /scan/runs`,
`GET /conflicts?status=&type=&route=`, `POST /conflicts/{id}/resolve`,
`POST /conflicts/{id}/suggest`, `POST /conflicts/{id}/undo` (admin),
`GET /ledger/verify`, `GET /audit?action=`, `GET /stats`,
`GET/PUT /settings/trust|thresholds`, `POST /settings/auto-apply`,
`POST /admin/demo/load`, `GET /admin/llm-status`, `GET /evaluation`,
`POST /evaluation/run`, `POST /evaluation/benchmark`, `GET/POST /poison/*`. Documented at `/docs`.

## 7. Test mapping (spec §13 → suites)

| Spec test | Suite |
|---|---|
| Chain verify + tamper detection with exact seq | `test_chain.py` |
| Rollback append-only | `test_chain.py` |
| Injected docs quarantined, never indexed | `test_injection.py` |
| Benign instruction-like not flagged | `test_injection.py` |
| Ties route to a human | `test_engine.py` |
| Auto-fix then undo restores text | `test_engine.py` |
| Incremental scan (no re-embedding) | `test_engine.py` |
| Role enforcement | `test_rbac.py` |
| Refusing to start with a default secret | `test_security.py` |
| API flow | `test_flow.py` |
| UI smoke of every page | Playwright lane (testing agent) |
