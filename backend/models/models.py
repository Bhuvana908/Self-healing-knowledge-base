"""Pydantic v2 request/response models. Every model here has a hand-written TS mirror in
frontend/src/lib/types.ts — nothing infers across the Python↔TypeScript boundary, so the
pair must be updated in the same edit."""

from pydantic import BaseModel


# --- auth ------------------------------------------------------------------------------------
class NeedsSetup(BaseModel):
    needs_setup: bool


class SetupRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    username: str
    role: str
    created_at: str | None = None


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"


class UserUpdate(BaseModel):
    role: str | None = None
    password: str | None = None


# --- documents / ledger ----------------------------------------------------------------------
class DocumentCreate(BaseModel):
    title: str
    text: str
    source_type: str = "team_wiki"
    doc_date: str | None = None


class Document(BaseModel):
    id: str
    title: str
    source_type: str
    trust: float
    doc_date: str
    status: str
    quarantine_reason: str | None = None
    current_version_no: int
    created_at: str


class VersionOut(BaseModel):
    seq: int
    id: str
    doc_id: str
    version_no: int
    text: str
    author: str
    reason: str
    lineage: dict
    ts: str
    prev_hash: str
    hash: str


# --- conflicts -------------------------------------------------------------------------------
class ResolveRequest(BaseModel):
    action: str
    merged_text: str | None = None


class SuggestOutcome(BaseModel):
    merged: str | None = None


class Conflict(BaseModel):
    id: str
    type: str
    claim_a: str
    claim_b: str | None
    text_a: str
    text_b: str | None
    doc_a: str
    doc_b: str | None
    sim: float | None
    confidence: float
    route: str
    proposal: dict
    status: str
    explanation: str = ""
    tie: bool = False
    created: str
    doc_a_title: str | None = None
    doc_b_title: str | None = None
    trust_a: float | None = None
    trust_b: float | None = None
    date_a: str | None = None
    date_b: str | None = None


class ResolveOutcome(BaseModel):
    conflict: Conflict
    versions: list[VersionOut]


# --- scan / evaluation -----------------------------------------------------------------------
class ScanRun(BaseModel):
    id: str
    ts: str
    actor: str
    claims: int
    pairs: int
    seconds: float
    found: int
    auto_fixed: int
    awaiting_human: int
    dismissed: int
    reindexed_docs: int


# --- poison lab ------------------------------------------------------------------------------
class PoisonPreviewRequest(BaseModel):
    text: str


class PoisonFireRequest(BaseModel):
    payload_id: str | None = None
    text: str | None = None


# --- settings --------------------------------------------------------------------------------
class TrustUpdate(BaseModel):
    trust: dict[str, float]


class ThresholdsUpdate(BaseModel):
    thresholds: dict[str, float]


class AutoApplyToggle(BaseModel):
    enabled: bool


# --- bulk upload / real corpus ---------------------------------------------------------------
class BulkUploadResult(BaseModel):
    found: int
    ingested: int
    quarantined: int
    skipped_duplicate_titles: int
    docs_total: int


class CorpusLoadResult(BaseModel):
    ingested: int
    quarantined: int
    labels: int
    unlabeled: int
    docs_total: int
