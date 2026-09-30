"""Document routes: ingest (with injection defense), list, version history, and the
admin-only rollback that appends the old text as a NEW version (nothing is deleted)."""

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.deps import require_admin, require_reviewer, require_viewer
from lib.ingest import clean_doc, ingest_document
from lib.ledger import append_audit, append_version
from models.models import Document, DocumentCreate, VersionOut

router = APIRouter(tags=["documents"])


@router.post("/documents", response_model=Document)
async def create_document(body: DocumentCreate, user: dict = Depends(require_reviewer)) -> Document:
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="Document text must not be empty")
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="Title must not be empty")
    res = await ingest_document(body.title.strip(), body.text, body.source_type, user["username"],
                                doc_date=body.doc_date)
    return Document(**res["doc"])


@router.get("/documents", response_model=list[Document])
async def list_documents(status: str | None = None, _: dict = Depends(require_viewer)) -> list[Document]:
    query = {"status": status} if status in {"active", "quarantined"} else {}
    docs = await db.docs.find(query).sort("created_at", -1).to_list(1000)
    return [Document(**clean_doc(d)) for d in docs]


@router.get("/documents/{doc_id}/history", response_model=list[VersionOut])
async def document_history(doc_id: str, _: dict = Depends(require_viewer)) -> list[VersionOut]:
    if not await db.docs.find_one({"id": doc_id}):
        raise HTTPException(status_code=404, detail="Unknown document")
    versions = await db.versions.find({"doc_id": doc_id}).sort("version_no", 1).to_list(1000)
    for v in versions:
        v.pop("_id", None)
    return [VersionOut(**v) for v in versions]


@router.post("/documents/{doc_id}/rollback/{version_no}", response_model=VersionOut)
async def rollback_document(doc_id: str, version_no: int, user: dict = Depends(require_admin)) -> VersionOut:
    """Admin rollback: appends the old text as a NEW version — rollback never deletes."""
    doc = await db.docs.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Unknown document")
    target = await db.versions.find_one({"doc_id": doc_id, "version_no": version_no})
    if not target:
        raise HTTPException(status_code=404, detail=f"Version {version_no} does not exist")
    if version_no == doc["current_version_no"]:
        raise HTTPException(status_code=409, detail="That version is already the current one")

    next_no = doc["current_version_no"] + 1
    entry = await append_version(
        doc_id, next_no, target["text"], user["username"], f"rollback to v{version_no}",
        {"rollback_to": version_no, "decision": "rollback"})
    await db.docs.update_one({"id": doc_id}, {"$set": {"current_version_no": next_no}})
    await append_audit(user["username"], "rollback", doc_id,
                       {"to_version": version_no, "new_version_no": next_no})
    return VersionOut(**entry)
