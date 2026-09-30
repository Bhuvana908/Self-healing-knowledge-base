"""Bulk document upload (no labels): ingest a reviewer's own real knowledge base from a
CSV, JSON, JSON-Lines or plain-text file through the SAME pipeline as any other document
(injection scan runs BEFORE indexing).

Accepted shapes
  - CSV with a header row containing at least `title` and `text` (plus optional
    `source_type`, `doc_date`)
  - JSON: a list of objects, or an object with a `documents` / `rows` / `data` list
  - JSON Lines: one object per line
  - .txt / .md: the whole file becomes a single document titled after the filename
"""

import csv
import io
import json

from lib import ingest
from lib.db import db
from lib.ledger import append_audit

VALID_SOURCE_TYPES = {"signed_policy", "official_wiki", "team_wiki", "email", "chat", "unknown"}
MAX_DOCS = 2000


class BulkError(ValueError):
    """Raised for a malformed upload; the message is shown to the user verbatim."""


def _norm(rows: list) -> list[dict]:
    return [{str(k).strip().lower(): v for k, v in r.items()} for r in rows if isinstance(r, dict)]


def parse_documents(raw: bytes, filename: str) -> list[dict]:
    text = raw.decode("utf-8-sig", errors="replace").strip()
    if not text:
        raise BulkError("The uploaded file is empty")
    name = (filename or "upload").lower()

    if name.endswith((".txt", ".md")):
        stem = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0].replace("_", " ").strip()
        return [{"title": stem or "Uploaded document", "text": text,
                 "source_type": "unknown", "doc_date": None}]

    rows: list[dict]
    if name.endswith((".json", ".jsonl", ".ndjson")) or text[:1] in "[{":
        if name.endswith((".jsonl", ".ndjson")) or (text[:1] == "{" and "\n" in text and not text.endswith("}")):
            try:
                rows = _norm([json.loads(line) for line in text.splitlines() if line.strip()])
            except json.JSONDecodeError as exc:
                raise BulkError(f"Invalid JSON Lines: {exc.msg} (line {exc.lineno})")
        else:
            try:
                data = json.loads(text)
            except json.JSONDecodeError as exc:
                raise BulkError(f"Invalid JSON: {exc.msg} (line {exc.lineno})")
            if isinstance(data, dict):
                data = data.get("documents") or data.get("rows") or data.get("data") or [data]
            if not isinstance(data, list):
                raise BulkError('JSON must be a list of objects, or an object with a "documents" list')
            rows = _norm(data)
    else:
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise BulkError("The CSV has no header row")
        rows = [{(k or "").strip().lower(): v for k, v in r.items()} for r in reader]

    if not rows:
        raise BulkError("No documents found in the upload")
    if "text" not in rows[0] and "body" not in rows[0] and "content" not in rows[0]:
        raise BulkError("Missing a text column. Expected: title, text (optional: source_type, doc_date)")

    docs: list[dict] = []
    for i, r in enumerate(rows, start=1):
        body = str(r.get("text") or r.get("body") or r.get("content") or "").strip()
        title = str(r.get("title") or r.get("name") or "").strip() or f"Untitled document {i}"
        if not body:
            continue
        src = str(r.get("source_type") or r.get("source") or "unknown").strip().lower()
        docs.append({
            "title": title[:300],
            "text": body,
            "source_type": src if src in VALID_SOURCE_TYPES else "unknown",
            "doc_date": (str(r.get("doc_date") or r.get("date") or "").strip() or None),
        })
    if not docs:
        raise BulkError("Every row was missing document text")
    if len(docs) > MAX_DOCS:
        raise BulkError(f"Too many documents ({len(docs)}). The limit per upload is {MAX_DOCS}.")
    return docs


async def bulk_ingest(raw: bytes, filename: str, actor: str, database=None) -> dict:
    dbh = database if database is not None else db
    docs = parse_documents(raw, filename)

    existing = {d["title"] async for d in dbh.docs.find({}, {"title": 1})}
    ingested = quarantined = skipped = 0
    for d in docs:
        if d["title"] in existing:
            skipped += 1
            continue
        res = await ingest.ingest_document(d["title"], d["text"], d["source_type"], actor,
                                           doc_date=d["doc_date"], database=database)
        existing.add(d["title"])
        ingested += 1
        quarantined += 1 if res["injection"]["flagged"] else 0

    await append_audit(actor, "bulk_upload", filename or "upload",
                       {"found": len(docs), "ingested": ingested, "quarantined": quarantined},
                       database=database)
    return {
        "found": len(docs),
        "ingested": ingested,
        "quarantined": quarantined,
        "skipped_duplicate_titles": skipped,
        "docs_total": await dbh.docs.count_documents({}),
    }
