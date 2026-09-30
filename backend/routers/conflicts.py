"""Conflict routes: the review queue listing, resolution actions, and admin undo."""

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.deps import require_admin, require_reviewer, require_viewer
from lib.resolve import resolve_conflict, undo_conflict
from models.models import Conflict, ResolveOutcome, ResolveRequest, VersionOut

router = APIRouter(tags=["conflicts"])


def _clean(c: dict) -> Conflict:
    c.pop("_id", None)
    return Conflict(**c)


@router.get("/conflicts", response_model=list[Conflict])
async def list_conflicts(status: str | None = None, type: str | None = None,
                         route: str | None = None, _: dict = Depends(require_viewer)) -> list[Conflict]:
    query: dict = {}
    if status:
        query["status"] = status
    if type:
        query["type"] = type
    if route:
        query["route"] = route
    conflicts = await db.conflicts.find(query).sort("created", -1).to_list(500)
    return [_clean(c) for c in conflicts]


async def _get_conflict(conflict_id: str) -> dict:
    c = await db.conflicts.find_one({"id": conflict_id})
    if not c:
        raise HTTPException(status_code=404, detail="Unknown conflict id")
    return c


@router.post("/conflicts/{conflict_id}/resolve", response_model=ResolveOutcome)
async def resolve(conflict_id: str, body: ResolveRequest,
                  user: dict = Depends(require_reviewer)) -> ResolveOutcome:
    conflict = await _get_conflict(conflict_id)
    versions = await resolve_conflict(conflict, body.action, user["username"],
                                      merged_text=body.merged_text)
    updated = await _get_conflict(conflict_id)
    return ResolveOutcome(conflict=_clean(updated), versions=[VersionOut(**v) for v in versions])


@router.post("/conflicts/{conflict_id}/suggest")
async def suggest(conflict_id: str, user: dict = Depends(require_reviewer)) -> dict:
    """Optional LLM assist: a suggested merged sentence, label-only. Returns None offline —
    the human always edits and approves the text themselves."""
    from lib import llm
    conflict = await _get_conflict(conflict_id)
    merged = await llm.synthesize(conflict["text_a"], conflict.get("text_b") or "")
    return {"merged": merged}


@router.post("/conflicts/{conflict_id}/undo", response_model=ResolveOutcome)
async def undo(conflict_id: str, user: dict = Depends(require_admin)) -> ResolveOutcome:
    """Admin-only undo of an auto-applied fix: appends the text preceding the change as a
    new version and marks the conflict rolled_back."""
    conflict = await _get_conflict(conflict_id)
    versions = await undo_conflict(conflict, user["username"])
    updated = await _get_conflict(conflict_id)
    return ResolveOutcome(conflict=_clean(updated), versions=[VersionOut(**v) for v in versions])
