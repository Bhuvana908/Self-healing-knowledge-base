"""Hash-chained append-only ledger for document versions and the audit trail.

Adaptation note (MongoDB stack): the spec's PostgreSQL triggers that reject UPDATE/DELETE
are enforced at the data-access layer — this module is the ONLY code path that writes to
`versions` and `audit`, and it only ever inserts. Any out-of-band mutation is caught by
verify_ledger(), which recomputes both chains and names the exact seq where tampering
occurs. The PostgreSQL advisory lock is replaced by a process-local asyncio lock plus an
atomic find_one_and_update counter, so sequence numbers stay strictly linear.

hash = SHA-256 of (prev_hash | doc_id | version_no | text | author | reason | lineage | ts)
for versions; the audit chain hashes (prev_hash | ts | actor | action | target | detail).
The first record of each chain uses prev_hash "GENESIS".

All appends accept `database` so the evaluation benchmark can run against a throwaway DB
without polluting the live ledger.
"""

import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timezone

from pymongo import ReturnDocument

from lib.db import db

GENESIS = "GENESIS"
_append_lock = asyncio.Lock()


def _canon(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def version_hash(prev_hash: str, doc_id: str, version_no: int, text: str, author: str,
                 reason: str, lineage: dict, ts: str) -> str:
    payload = "|".join([prev_hash, doc_id, str(version_no), text, author, reason, _canon(lineage), ts])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def audit_hash(prev_hash: str, ts: str, actor: str, action: str, target: str, detail: dict) -> str:
    payload = "|".join([prev_hash, ts, actor, action, target, _canon(detail)])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _next_seq(collection: str, dbh) -> int:
    doc = await dbh.counters.find_one_and_update(
        {"_id": collection},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(doc["seq"])


async def _head_hash(collection: str, dbh) -> str:
    head = await dbh[collection].find_one({}, sort=[("seq", -1)])
    return head["hash"] if head else GENESIS


async def append_version(doc_id: str, version_no: int, text: str, author: str, reason: str,
                         lineage: dict | None = None, database=None) -> dict:
    """Append-only: the only way a version enters `versions`. Never updates or deletes."""
    dbh = database if database is not None else db
    async with _append_lock:
        lineage = lineage or {}
        ts = _now_iso()
        prev = await _head_hash("versions", dbh)
        entry = {
            "id": str(uuid.uuid4()),
            "seq": await _next_seq("versions", dbh),
            "doc_id": doc_id,
            "version_no": int(version_no),
            "text": text,
            "author": author,
            "reason": reason,
            "lineage": lineage,
            "ts": ts,
            "prev_hash": prev,
        }
        entry["hash"] = version_hash(prev, doc_id, entry["version_no"], text, author, reason, lineage, ts)
        await dbh.versions.insert_one(entry)
        entry.pop("_id", None)
        return entry


async def append_audit(actor: str, action: str, target: str, detail: dict | None = None,
                       database=None) -> dict:
    """Append-only audit entry. Failed sign-ins land here too."""
    dbh = database if database is not None else db
    async with _append_lock:
        ts = _now_iso()
        detail = detail or {}
        prev = await _head_hash("audit", dbh)
        entry = {
            "id": str(uuid.uuid4()),
            "seq": await _next_seq("audit", dbh),
            "ts": ts,
            "actor": actor,
            "action": action,
            "target": target,
            "detail": detail,
            "prev_hash": prev,
        }
        entry["hash"] = audit_hash(prev, ts, actor, action, target, detail)
        await dbh.audit.insert_one(entry)
        entry.pop("_id", None)
        return entry


def _compute_version_hash(entry: dict) -> str:
    return version_hash(
        entry.get("prev_hash", ""), entry.get("doc_id", ""), entry.get("version_no", 0),
        entry.get("text", ""), entry.get("author", ""), entry.get("reason", ""),
        entry.get("lineage", {}), entry.get("ts", ""),
    )


def _compute_audit_hash(entry: dict) -> str:
    return audit_hash(
        entry.get("prev_hash", ""), entry.get("ts", ""), entry.get("actor", ""),
        entry.get("action", ""), entry.get("target", ""), entry.get("detail", {}),
    )


async def _verify_chain(collection: str, compute, dbh) -> dict:
    prev = GENESIS
    count = 0
    async for entry in dbh[collection].find({}, sort=[("seq", 1)]):
        seq = entry.get("seq")
        if entry.get("prev_hash") != prev:
            return {"ok": False, "message": f"chain broken at seq {seq}: prev_hash does not match its predecessor", "records": count}
        if compute(entry) != entry.get("hash"):
            return {"ok": False, "message": f"hash mismatch at seq {seq} — record was modified in place", "records": count}
        prev = entry["hash"]
        count += 1
    return {"ok": True, "message": f"chain intact ({count} records)", "records": count}


async def verify_ledger(database=None) -> dict:
    """Recompute both chains. Returns (ok, message) per chain, naming the exact bad seq."""
    dbh = database if database is not None else db
    versions = await _verify_chain("versions", _compute_version_hash, dbh)
    audit = await _verify_chain("audit", _compute_audit_hash, dbh)
    return {
        "ok": versions["ok"] and audit["ok"],
        "versions": versions,
        "audit": audit,
        "checked_at": _now_iso(),
    }
