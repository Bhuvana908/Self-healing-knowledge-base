"""Scan routes: run the self-healing scan and list recent scan runs."""

from fastapi import APIRouter, Depends

from lib import detect
from lib.db import db
from lib.deps import require_reviewer, require_viewer
from models.models import ScanRun

router = APIRouter(tags=["scan"])


@router.post("/scan", response_model=ScanRun)
async def run_scan(user: dict = Depends(require_reviewer)) -> ScanRun:
    run = await detect.run_scan(user["username"])
    return ScanRun(**run)


@router.get("/scan/runs", response_model=list[ScanRun])
async def list_runs(_: dict = Depends(require_viewer)) -> list[ScanRun]:
    runs = await db.scan_runs.find().sort("ts", -1).to_list(20)
    for r in runs:
        r.pop("_id", None)
    return [ScanRun(**r) for r in runs]
