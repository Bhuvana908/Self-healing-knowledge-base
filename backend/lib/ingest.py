"""Ingestion + injection defense (spec 7). Order matters: the document and version 1 are
stored, then the injection scan runs BEFORE indexing — flagged documents are quarantined,
logged, and never enter the claim index or produce automated changes."""

import uuid
from datetime import datetime, timezone

from lib import injection, llm
from lib.db import db
from lib.dates import today_iso
from lib.ledger import append_audit, append_version
from lib.settings import trust_for


def clean_doc(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


async def ingest_document(title: str, text: str, source_type: str, actor: str,
                          doc_date: str | None = None, demo: bool = False,
                          database=None) -> dict:
    """Full ingestion pipeline. Returns {"doc": doc, "injection": scan_result}."""
    dbh = database if database is not None else db
    doc_date = doc_date or today_iso()
    scan = injection.scan_text(text)

    # Layer 5: ambiguous scores (0.3..0.6) may consult the label-only LLM.
    label = None
    if scan["ambiguous"] and llm.provider() != "offline":
        label = await llm.injection_label(text)
        if label is True:
            scan["flagged"] = True
            scan["llm_label"] = "injection"
        elif label is False:
            scan["llm_label"] = "benign"

    doc_id = str(uuid.uuid4())
    trust = await trust_for(source_type)
    doc = {
        "id": doc_id,
        "title": title,
        "source_type": source_type,
        "trust": trust,
        "doc_date": doc_date,
        "status": "quarantined" if scan["flagged"] else "active",
        "quarantine_reason": ("prompt-injection detected (score %.2f)" % scan["score"]) if scan["flagged"] else None,
        "current_version_no": 1,
        "indexed_version": -1,  # claims are only ever indexed for clean documents
        "created_at": datetime.now(timezone.utc).isoformat(),
        "added_by": actor,
        "demo": demo,
    }
    await dbh.docs.insert_one(doc.copy())
    await append_version(doc_id, 1, text, actor, "initial ingest",
                         {"source": "ingest", "source_type": source_type}, database=database)
    await append_audit(
        actor, "quarantine" if scan["flagged"] else "ingest", doc_id,
        {"title": title, "score": scan["score"], "source_type": source_type}, database=database)
    return {"doc": clean_doc(doc), "injection": scan}
