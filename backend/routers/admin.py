"""Admin routes: settings (source-trust table, routing thresholds, auto-apply toggle),
demo-corpus load, and LLM/embedding provider status."""

from fastapi import APIRouter, Depends

from lib.deps import require_admin, require_viewer
from lib.llm import embeddings_provider, provider as llm_provider
from lib.seed_corpus import load_demo
from lib.settings import get_settings, save_settings
from models.models import AutoApplyToggle, ThresholdsUpdate, TrustUpdate

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


@router.get("/admin/llm-status")
async def llm_status(_: dict = Depends(require_viewer)) -> dict:
    return {
        "llm": llm_provider(),
        "embeddings": embeddings_provider(),
        "offline_mode": llm_provider() == "offline",
    }
