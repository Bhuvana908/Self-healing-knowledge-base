"""Poison-lab routes: fire an attack payload through the REAL ingestion pipeline so the
quarantine path is exercised end to end. Claims counts prove the poison never enters the
live index (before == after)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib import injection
from lib.db import db
from lib.deps import require_reviewer, require_viewer
from lib.ingest import ingest_document
from lib.llm import injection_label
from models.models import PoisonFireRequest, PoisonPreviewRequest

router = APIRouter(tags=["poison"])


@router.get("/poison/payloads")
async def payloads(_: dict = Depends(require_viewer)) -> dict:
    return {"payloads": injection.RED_TEAM_PAYLOADS, "benign": injection.BENIGN_INSTRUCTION_LIKE}


@router.post("/poison/preview")
async def preview(body: PoisonPreviewRequest, user: dict = Depends(require_reviewer)) -> dict:
    scan = injection.scan_text(body.text)
    if scan["ambiguous"]:  # layer 5: label-only LLM consult for ambiguous scores
        label = await injection_label(body.text)
        if label is True:
            scan["flagged"] = True
            scan["llm_label"] = "injection"
        elif label is False:
            scan["llm_label"] = "benign"
    return scan


@router.post("/poison/fire")
async def fire(body: PoisonFireRequest, user: dict = Depends(require_reviewer)) -> dict:
    payload = next((p for p in injection.RED_TEAM_PAYLOADS if p["id"] == body.payload_id), None)
    text = body.text or (payload["text"] if payload else None)
    if not text or not text.strip():
        raise HTTPException(status_code=422, detail="Provide attack text or a known payload_id")
    label = payload["label"] if payload else "custom payload"
    stamp = datetime.now(timezone.utc).strftime("%H:%M:%S")

    claims_before = await db.claims.count_documents({})
    res = await ingest_document(f"Poison lab — {label} ({stamp})", text, "chat", user["username"])
    claims_after = await db.claims.count_documents({})

    return {
        "injection": res["injection"],
        "doc": res["doc"],
        "quarantined": res["doc"]["status"] == "quarantined",
        "claims_before": claims_before,
        "claims_after": claims_after,
        "claims_unchanged": claims_before == claims_after,
    }
