"""Dashboard aggregates: KPI counts, pipeline strip and findings-by-type."""

from fastapi import APIRouter, Depends

from lib.db import db
from lib.deps import require_viewer
from lib.llm import embeddings_provider, provider as llm_provider
from lib.settings import get_settings

router = APIRouter(tags=["stats"])

_LAST_SCAN_FIELDS = ("ts", "actor", "claims", "pairs", "seconds", "found",
                     "auto_fixed", "awaiting_human", "dismissed", "reindexed_docs")


@router.get("/stats")
async def stats(_: dict = Depends(require_viewer)) -> dict:
    documents = await db.docs.count_documents({})
    quarantined = await db.docs.count_documents({"status": "quarantined"})
    claims = await db.claims.count_documents({})
    awaiting = await db.conflicts.count_documents({"status": "open"})
    auto_resolved = await db.conflicts.count_documents({"status": "auto_applied"})
    ledger_versions = await db.versions.count_documents({})

    findings_by_type = {
        doc["_id"]: doc["n"]
        async for doc in db.conflicts.aggregate([{"$group": {"_id": "$type", "n": {"$sum": 1}}}])
        if doc["_id"]
    }

    last_scan = await db.scan_runs.find().sort("ts", -1).to_list(1)
    pipeline = {
        "ingested": documents,
        "quarantined": quarantined,
        "claims_indexed": claims,
        "candidate_pairs": last_scan[0]["pairs"] if last_scan else 0,
        "auto_fixed": last_scan[0]["auto_fixed"] if last_scan else 0,
        "awaiting_human": awaiting,
    }

    settings = await get_settings()
    return {
        "documents": documents,
        "quarantined": quarantined,
        "awaiting_human": awaiting,
        "auto_resolved": auto_resolved,
        "ledger_versions": ledger_versions,
        "pipeline": pipeline,
        "findings_by_type": findings_by_type,
        "auto_apply_enabled": settings["auto_apply_enabled"],
        "provider": {"llm": llm_provider(), "embeddings": embeddings_provider()},
        "last_scan": {k: last_scan[0][k] for k in _LAST_SCAN_FIELDS} if last_scan else None,
    }
