"""Resolution actions (spec 9): accept / keep_both / hold / reject / synthesize, plus
admin undo. Every applied edit appends a new immutable hash-chained version with lineage;
nothing is ever deleted. Auto-applied fixes are undone by appending the text preceding
the change as a new version and marking the conflict rolled_back."""

import re
from datetime import datetime, timezone

from fastapi import HTTPException

from lib.db import db
from lib.ledger import append_audit, append_version

RESOLVE_STATUS = {
    "accept": "accepted",
    "keep_both": "kept_both",
    "hold": "hold",
    "reject": "rejected",
    "synthesize": "synthesized",
}
RESOLVABLE = {"open", "hold"}


def replace_sentence(text: str, old: str, new: str | None) -> str | None:
    """Replace/remove a sentence; whitespace-flexible fallback. None when absent."""
    if old in text:
        return text.replace(old, new or "", 1)
    pattern = re.compile(r"\s+".join(map(re.escape, old.split())))
    m = pattern.search(text)
    if not m:
        return None
    replaced = text[:m.start()] + (new or "") + text[m.end():]
    return re.sub(r"  +", " ", replaced).strip() if new is None else replaced


async def current_text(doc: dict, database=None) -> str:
    dbh = database if database is not None else db
    v = await dbh.versions.find_one({"doc_id": doc["id"], "version_no": doc["current_version_no"]})
    return v["text"] if v else ""


async def _apply_doc_edit(doc: dict, old_sentence: str, new_sentence: str | None,
                          author: str, reason: str, lineage: dict, database=None) -> dict:
    """Apply a sentence edit by appending a new version — never by mutating history."""
    dbh = database if database is not None else db
    text = await current_text(doc, database=database)
    new_text = replace_sentence(text, old_sentence, new_sentence)
    if new_text is None:
        raise HTTPException(status_code=409,
                            detail=f"Source sentence no longer exists in '{doc['title']}' — nothing was changed")
    next_no = doc["current_version_no"] + 1
    entry = await append_version(doc["id"], next_no, new_text, author, reason, lineage, database=database)
    await dbh.docs.update_one({"id": doc["id"]}, {"$set": {"current_version_no": next_no}})
    return entry


async def resolve_conflict(conflict: dict, action: str, actor: str,
                           merged_text: str | None = None, database=None) -> list[dict]:
    dbh = database if database is not None else db
    if conflict["status"] not in RESOLVABLE:
        raise HTTPException(status_code=409, detail=f"Conflict already resolved (status: {conflict['status']})")
    if action not in RESOLVE_STATUS:
        raise HTTPException(status_code=400, detail=f"Unknown action '{action}'")
    if action == "accept" and conflict["proposal"].get("kind") == "none":
        raise HTTPException(status_code=400,
                            detail="This finding is a tie with no deterministic proposal — a human must decide; use synthesize or keep_both")

    lineage = {
        "conflict_id": conflict["id"],
        "type": conflict["type"],
        "decision": action,
        "confidence": conflict.get("confidence"),
        "keep": action == "keep_both",
    }
    versions: list[dict] = []
    proposal = conflict.get("proposal") or {}

    if action == "accept":
        doc = await dbh.docs.find_one({"id": proposal["doc_id"]})
        if not doc:
            raise HTTPException(status_code=404, detail="Proposed target document no longer exists")
        versions.append(await _apply_doc_edit(
            doc, proposal["old_sentence"], proposal.get("new_sentence"),
            actor, f"accepted {conflict['type']} fix", lineage, database=database))
    elif action == "synthesize":
        merged = (merged_text or "").strip()
        if not merged:
            raise HTTPException(status_code=400, detail="Synthesize requires merged text")
        doc_a = await dbh.docs.find_one({"id": conflict["doc_a"]})
        if doc_a:
            versions.append(await _apply_doc_edit(
                doc_a, conflict["text_a"], merged,
                actor, f"synthesized {conflict['type']} fix", lineage, database=database))
        doc_b = await dbh.docs.find_one({"id": conflict["doc_b"]}) if conflict.get("doc_b") else None
        if doc_b:
            versions.append(await _apply_doc_edit(
                doc_b, conflict["text_b"], None,
                actor, f"synthesized {conflict['type']} fix (counterpart removed)", lineage, database=database))

    await dbh.conflicts.update_one(
        {"id": conflict["id"]},
        {"$set": {"status": RESOLVE_STATUS[action], "resolved_by": actor,
                  "resolved_at": datetime.now(timezone.utc).isoformat()}})
    await append_audit(actor, f"resolve_{action}", conflict["id"],
                       {"type": conflict["type"], "versions": [v["seq"] for v in versions]}, database=database)
    return versions


async def undo_conflict(conflict: dict, actor: str, database=None) -> list[dict]:
    """Undo of an applied fix: restores the version preceding the change and marks the
    conflict rolled_back. Rollback never deletes — it appends the old text as a new one."""
    dbh = database if database is not None else db
    if conflict["status"] != "auto_applied":
        raise HTTPException(status_code=409, detail="Only auto-applied fixes can be undone here")
    fixes = await dbh.versions.find({"lineage.conflict_id": conflict["id"]}).to_list(100)
    if not fixes:
        raise HTTPException(status_code=409, detail="No ledger version recorded for this conflict")

    restored: list[dict] = []
    for fix in fixes:
        doc = await dbh.docs.find_one({"id": fix["doc_id"]})
        if not doc:
            continue
        prev_no = fix["version_no"] - 1
        prev = await dbh.versions.find_one({"doc_id": fix["doc_id"], "version_no": prev_no})
        if not prev:
            continue
        next_no = doc["current_version_no"] + 1
        entry = await append_version(
            doc["id"], next_no, prev["text"], actor, f"rollback to v{prev_no}",
            {"undo_of": conflict["id"], "conflict_id": conflict["id"], "type": conflict["type"],
             "decision": "undo", "confidence": conflict.get("confidence"), "keep": False},
            database=database)
        await dbh.docs.update_one({"id": doc["id"]}, {"$set": {"current_version_no": next_no}})
        restored.append(entry)

    await dbh.conflicts.update_one(
        {"id": conflict["id"]},
        {"$set": {"status": "rolled_back", "resolved_by": actor,
                  "resolved_at": datetime.now(timezone.utc).isoformat()}})
    await append_audit(actor, "undo_fix", conflict["id"],
                       {"type": conflict["type"], "restored_versions": [v["seq"] for v in restored]}, database=database)
    return restored
