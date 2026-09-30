"""Evaluation routes: last report, run the labeled evaluation, run the scale benchmark."""

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.deps import require_admin, require_reviewer, require_viewer
from lib.evaluation import DISCLAIMER, run_benchmark, run_evaluation

router = APIRouter(tags=["evaluation"])


@router.get("/evaluation")
async def last_report(_: dict = Depends(require_viewer)) -> dict:
    latest = await db.eval_reports.find().sort("ran_at", -1).to_list(1)
    if not latest:
        return {"report": None, "disclaimer": DISCLAIMER}
    latest[0].pop("_id", None)
    return {"report": latest[0], "disclaimer": DISCLAIMER}


@router.post("/evaluation/run")
async def evaluation_run(user: dict = Depends(require_reviewer)) -> dict:
    try:
        return await run_evaluation(user["username"])
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/evaluation/benchmark")
async def benchmark(user: dict = Depends(require_admin)) -> dict:
    return await run_benchmark(user["username"])
