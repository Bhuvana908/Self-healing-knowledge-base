"""Admin routes: settings (source-trust table, routing thresholds, auto-apply toggle),
demo-corpus load, labeled-dataset import, and LLM/embedding provider status."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse

from lib.dataset import TEMPLATE_CSV, DatasetError, import_dataset
from lib.deps import require_admin, require_viewer
from lib.llm import embeddings_provider, ping as llm_ping, provider as llm_provider
from lib.real_corpus import load_real
from lib.seed_corpus import load_demo
from lib.settings import get_settings, save_settings
from models.models import AutoApplyToggle, CorpusLoadResult, ThresholdsUpdate, TrustUpdate

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # request size limit (spec 3)

router = APIRouter(tags=["admin"])


@router.get("/settings")
async def read_settings(_: dict = Depends(require_admin)) -> dict:
    return await get_settings()


@router.put("/settings/trust")
async def put_trust(body: TrustUpdate, user: dict = Depends(require_admin)) -> dict:
    return await save_settings({"trust": body.trust}, user["username"])


@router.put("/settings/thresholds")
async def put_thresholds(body: ThresholdsUpdate, user: dict = Depends(require_admin)) -> dict:
    return await save_settings({"thresholds": body.thresholds}, user["username"])


@router.post("/settings/auto-apply")
async def toggle_auto_apply(body: AutoApplyToggle, user: dict = Depends(require_admin)) -> dict:
    return await save_settings({"auto_apply_enabled": body.enabled}, user["username"])


@router.post("/admin/demo/load")
async def demo_load(user: dict = Depends(require_admin)) -> dict:
    return await load_demo(user["username"])


@router.post("/admin/real-corpus/load", response_model=CorpusLoadResult)
async def real_corpus_load(user: dict = Depends(require_admin)) -> CorpusLoadResult:
    """Load the real-world corpus: excerpts of genuinely published public documents.
    Only a small slice carries ground-truth labels; the rest is ingested unlabeled."""
    return CorpusLoadResult(**await load_real(user["username"]))


@router.get("/admin/llm-status")
async def llm_status(_: dict = Depends(require_viewer)) -> dict:
    from lib.llm import GEMINI_MODEL, breaker_state
    breaker = breaker_state()
    return {
        "llm": llm_provider(),
        "embeddings": embeddings_provider(),
        "offline_mode": llm_provider() == "offline",
        "model": GEMINI_MODEL,
        "degraded": breaker["open"],
        "degraded_seconds": breaker["cooldown_seconds"],
    }


@router.post("/admin/llm-test")
async def llm_test(_: dict = Depends(require_admin)) -> dict:
    """Live probe: proves whether the configured key really reaches the provider."""
    return await llm_ping()


@router.get("/admin/dataset/template", response_class=PlainTextResponse)
async def dataset_template(_: dict = Depends(require_admin)) -> PlainTextResponse:
    return PlainTextResponse(
        TEMPLATE_CSV,
        headers={"Content-Disposition": 'attachment; filename="labeled_dataset_template.csv"'},
        media_type="text/csv",
    )


@router.post("/admin/dataset/import")
async def dataset_import(file: UploadFile = File(...), user: dict = Depends(require_admin)) -> dict:
    """Import a reviewer's own labeled CSV/JSON: documents go through the real ingestion
    pipeline (injection scan first) and labels are registered for scoring."""
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than the 5 MB limit")
    try:
        return await import_dataset(raw, file.filename or "upload", user["username"])
    except DatasetError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
