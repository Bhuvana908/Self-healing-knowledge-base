# SPEC — Self-Healing Knowledge Base (living spec)

Knowledge-governance platform: audits the KB for stale/duplicated/contradictory/unsupported
claims, quarantines prompt-injection documents, auto-applies high-confidence fixes, routes
uncertain ones to humans, records everything on hash-chained append-only ledgers.

## Roles & auth
- `admin` > `reviewer` > `viewer`, rank-checked per route (`lib/deps.py`).
- No default credentials. First run: `/setup` screen → `POST /api/auth/setup` creates the
  first admin (refuses once any user exists). Login sets an httpOnly JWT cookie (12 h).
- Working credentials after first-run setup: see `memory/test_credentials.md`.
- Login rate limit: 5 failures / 15 min → 429; failures are audited.

## Key flows
1. **Ingest** (`POST /documents`, reviewer+): store doc + version 1, injection scan BEFORE
   indexing; flagged → `quarantined`, never enters `claims`/auto-fixes.
2. **Scan** (`POST /scan`, reviewer+): incremental (only new/changed docs re-extracted +
   re-vectorized); kNN k=8, candidate floor sim 0.45; classify → subtype → confidence →
   route; auto-apply when enabled and conf ≥ 0.80 (ties always human, proposal "none");
   clears open/dismissed conflicts and regenerates; conflict ids are content hashes.
3. **Resolve** (`POST /conflicts/{id}/resolve`, reviewer+): accept / keep_both / hold /
   reject / synthesize (merged text replaces A's sentence, removes B's). Accept is blocked
   on proposal-less ties (400). Applied edits append hash-chained versions with lineage.
4. **Undo** (`POST /conflicts/{id}/undo`, admin): auto_applied only; appends the text
   preceding the change as a new version; conflict → rolled_back.
5. **Rollback** (`POST /documents/{id}/rollback/{version}`, admin): appends old text,
   reason "rollback to vN". Nothing is ever deleted.
6. **Verify** (`GET /ledger/verify`): recomputes both chains, names the exact tampered seq.
7. **Evaluation** (`POST /evaluation/run`): P/R/F1 + 95% bootstrap CIs per fault type,
   FPR on clean docs; benchmark (`POST /evaluation/benchmark`, admin) runs 300 synthetic
   docs on a throwaway DB (`app_bench`, dropped after). Demo-corpus disclaimer in the UI.
8. **Poison lab** (`POST /poison/fire`, reviewer+): ingests the payload for real →
   quarantine result, spans, zero-width/hidden counts, claims before/after (unchanged).

## Config (settings collection, admin endpoints)
- Trust: signed_policy 0.95, official_wiki 0.75, team_wiki 0.55, email 0.30, chat 0.20,
  unknown 0.30 — admin-editable.
- Thresholds: auto_apply 0.80, human_min 0.40, duplicate_sim 0.80, conflict_sim 0.60,
  llm_band_sim 0.45, knn_k 8, stale_days 365, embedding_weight 0.5, winner gaps 0.05/30d.

## Corpora & uploads
- **Real-world corpus** (`lib/real_corpus.py`, `POST /admin/real-corpus/load`, admin →
  Dashboard "Load real-world corpus"): 30 excerpts of genuinely published public
  documents (NIST SP 800-118 vs 800-63B, PCI DSS 3.2.1 vs 4.0, GDPR Art. 33 + EDPB, WHO +
  CDC hand hygiene, RFCs, OWASP, ISO 27001, WCAG, PEP 8 …). Only 10 ground-truth labels
  (2 stale, 2 duplicate, 2 unsupported, 2 injection incl. 1 held out, 2 benign) tagged
  `source: "real"`; the remaining documents are ingested **unlabeled**.
- **Bulk upload** (`lib/bulk.py`, `POST /documents/bulk`, reviewer+ → Dashboard
  "Upload your own documents"): CSV / JSON / JSONL / .txt / .md, keys `title`, `text`
  (+ optional `source_type`, `doc_date`); 10 MB and 2000-doc limits; duplicate titles are
  skipped; every doc runs the standard pipeline so the injection scan precedes indexing.
- Evaluation reports `coverage {total_docs, labeled_docs, unlabeled_docs}`; unlabeled real
  documents are scanned but never scored, and the disclaimer says so.
- Dashboard has **no** "Recent activity" card (removed by user request) — the full
  hash-chained history lives on the Audit Log page; `/stats` no longer returns
  `recent_activity`.

## Seed data
- Demo corpus (~73 docs + eval labels) loads idempotently via **Dashboard → Load demo
  corpus** (admin) or `python seed.py` — includes 8 contradiction pairs (3 paraphrased
  with number words), 6 duplicate pairs, 5 stale pairs, 6 unsupported, 6 injection
  attacks, 8 benign instruction-like hard negatives, 15+ clean docs.
- LLM offline by default: set `GEMINI_API_KEY` to enable label-only judging/synthesis.

## Stack adaptations (documented in README/SRS)
MongoDB instead of PostgreSQL (append-only via the data-access layer + chain verification;
atomic counters instead of advisory lock); exact sparse cosine kNN instead of FAISS/HNSW;
TF-IDF-only offline embeddings; Python 3.11.

## Ports / infra
Frontend :3000 (Vite, proxies /api), backend :8001 (uvicorn --reload), mongod in-pod.
Supervisor programs: `frontend`, `backend`, `mongodb`.
