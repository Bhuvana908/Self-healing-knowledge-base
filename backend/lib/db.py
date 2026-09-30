"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "docs": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
        IndexModel([("title", ASCENDING)], name="title"),
    ],
    "versions": [
        IndexModel([("seq", ASCENDING)], name="seq", unique=True),
        IndexModel([("doc_id", ASCENDING), ("version_no", ASCENDING)], name="doc_version"),
        IndexModel([("lineage.conflict_id", ASCENDING)], name="lineage_conflict"),
    ],
    "audit": [
        IndexModel([("seq", ASCENDING)], name="seq", unique=True),
        IndexModel([("action", ASCENDING), ("seq", DESCENDING)], name="action_seq"),
    ],
    "claims": [
        IndexModel([("cid", ASCENDING)], name="cid", unique=True),
        IndexModel([("doc_id", ASCENDING)], name="doc_id"),
    ],
    "conflicts": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("confidence", DESCENDING)], name="status_confidence"),
        IndexModel([("type", ASCENDING)], name="type"),
    ],
    "scan_runs": [IndexModel([("ts", DESCENDING)], name="ts_desc")],
    "users": [IndexModel([("username", ASCENDING)], name="username", unique=True)],
    "eval_labels": [IndexModel([("kind", ASCENDING)], name="kind")],
    "eval_reports": [IndexModel([("ran_at", DESCENDING)], name="ran_at_desc")],
    "settings": [IndexModel([("_id", ASCENDING)], name="_id")],
    "counters": [IndexModel([("_id", ASCENDING)], name="_id")],
    "index_state": [IndexModel([("_id", ASCENDING)], name="_id")],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
