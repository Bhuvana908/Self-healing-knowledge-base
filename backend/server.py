"""FastAPI bootstrap — Self-Healing Knowledge Base.

Security posture (spec 3): the app REFUSES TO START when SECRET_KEY is missing or equals
a known default — get_secret() raises at import time. No default credentials exist; the
first admin is created through POST /api/auth/setup, which only works while the users
collection is empty.
"""

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Refuses to start on a missing/default signing secret (must precede router imports).
from lib.security import get_secret
_SECRET = get_secret()

from lib.db import client, db, ensure_indexes
from lib.ledger import verify_ledger
from lib.llm import embeddings_provider, provider as llm_provider
from routers import admin, auth, conflicts, documents, evaluation
from routers import ledger as ledger_routes
from routers import poison, scan, stats


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: never block boot
    yield
    client.close()


app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")


# --- Models (template connectivity probe, kept as the canonical route pattern) ---------------
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class StatusCheckCreate(BaseModel):
    client_name: str


# --- Routes on the router, never directly on app ---------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "Self-Healing Knowledge Base API"}


@api_router.get("/health")
async def health():
    """Health including hash-chain status (spec 10)."""
    chain = await verify_ledger()
    counts = {
        "documents": await db.docs.count_documents({}),
        "quarantined": await db.docs.count_documents({"status": "quarantined"}),
        "claims": await db.claims.count_documents({}),
        "awaiting_human": await db.conflicts.count_documents({"status": "open"}),
        "ledger_versions": await db.versions.count_documents({}),
    }
    return {
        "status": "ok" if chain["ok"] else "tampered",
        "chain": chain,
        "counts": counts,
        "provider": {"llm": llm_provider(), "embeddings": embeddings_provider()},
    }


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj


@api_router.get("/status", response_model=list[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


# --- Feature routers ---------------------------------------------------------------------------
api_router.include_router(auth.router)
api_router.include_router(documents.router)
api_router.include_router(scan.router)
api_router.include_router(conflicts.router)
api_router.include_router(ledger_routes.router)
api_router.include_router(admin.router)
api_router.include_router(evaluation.router)
api_router.include_router(poison.router)
api_router.include_router(stats.router)

# Include the router in the main app — stays the LAST routing statement.
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional SPA serving for single-container Docker deploys: build the frontend into
# /app/static and set STATIC_DIR — API routes above still take precedence.
_static_dir = os.environ.get("STATIC_DIR")
if _static_dir and Path(_static_dir).is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
