"""Corpus selection: the knowledge base holds ONE chosen corpus at a time.

Loading a corpus with `replace=True` (the default) clears the previous knowledge base —
documents, the version chain, claims, findings, scan runs and evaluation labels/reports —
then ingests the chosen corpus fresh, so the dashboard shows nothing until the user runs a
scan. The audit chain is deliberately NOT cleared: the reset itself is recorded on it, so
the tamper-evident history of what happened survives every reset.

`replace=False` keeps whatever is already there and merges the corpus in (titles that
already exist are skipped), which is how the two corpora can be combined on purpose.
"""

from datetime import datetime, timezone

from lib.db import db
from lib.ledger import append_audit
from lib.real_corpus import load_real
from lib.seed_corpus import load_demo

CORPORA = {"demo", "real"}
LABELS = {"demo": "Demo corpus (synthetic, fully labeled)",
          "real": "Real-world corpus (published public documents, partly labeled)"}

# Everything derived from the documents. `audit`, `users` and `settings` are preserved.
_WIPE = ["docs", "versions", "claims", "conflicts", "scan_runs", "eval_labels",
         "eval_reports", "index_state"]


async def reset_kb(actor: str) -> dict:
    """Clear the knowledge base and restart the version chain from GENESIS."""
    removed = {}
    for name in _WIPE:
        removed[name] = (await db[name].delete_many({})).deleted_count
    # the version chain restarts at seq 1; the audit counter keeps running
    await db.counters.delete_one({"_id": "versions"})
    await append_audit(actor, "kb_reset", "kb", removed)
    return removed


async def active_corpus() -> dict:
    state = await db.settings.find_one({"_id": "corpus_state"}) or {}
    docs = await db.docs.count_documents({})
    last_scan = await db.scan_runs.find().sort("ts", -1).to_list(1)
    return {
        "active": state.get("active") if docs else None,
        "loaded_at": state.get("loaded_at") if docs else None,
        "documents": docs,
        "scanned": bool(last_scan),
    }


async def load_corpus(corpus: str, replace: bool, actor: str) -> dict:
    if corpus not in CORPORA:
        raise ValueError(f"Unknown corpus '{corpus}' — choose 'demo' or 'real'")

    removed = await reset_kb(actor) if replace else {}
    res = await (load_real(actor) if corpus == "real" else load_demo(actor))

    labeled = await db.eval_labels.count_documents({})
    docs_total = await db.docs.count_documents({})
    loaded_at = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one(
        {"_id": "corpus_state"},
        {"$set": {"active": corpus, "loaded_at": loaded_at, "replace": replace}},
        upsert=True,
    )
    await append_audit(actor, "corpus_load", corpus,
                       {"replace": replace, "ingested": res.get("ingested", 0)})
    return {
        "corpus": corpus,
        "label": LABELS[corpus],
        "replaced": bool(replace),
        "cleared_documents": removed.get("docs", 0),
        "ingested": res.get("ingested", 0),
        "quarantined": res.get("quarantined", 0),
        "labels": labeled,
        "docs_total": docs_total,
        "loaded_at": loaded_at,
    }
