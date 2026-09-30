"""Ledger routes: chain verification and the hash-chained audit log."""

from fastapi import APIRouter, Depends

from lib.db import db
from lib.deps import require_viewer
from lib.ledger import verify_ledger

router = APIRouter(tags=["ledger"])


@router.get("/ledger/verify")
async def ledger_verify(_: dict = Depends(require_viewer)) -> dict:
    result = await verify_ledger()
    return result


@router.get("/audit")
async def audit_log(action: str | None = None, limit: int = 200,
                    _: dict = Depends(require_viewer)) -> list[dict]:
    query = {"action": action} if action else {}
    limit = max(1, min(limit, 1000))
    entries = await db.audit.find(query).sort("seq", -1).to_list(limit)
    for e in entries:
        e.pop("_id", None)
    return entries
