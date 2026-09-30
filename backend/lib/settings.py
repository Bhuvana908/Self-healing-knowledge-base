"""Runtime settings (admin-configurable): source-trust table, routing thresholds,
auto-apply toggle. Stored in the `settings` collection, doc `_id="global"`."""

from lib.db import db
from lib.ledger import append_audit

UNKNOWN_TRUST = 0.30

DEFAULT_TRUST: dict[str, float] = {
    "signed_policy": 0.95,
    "official_wiki": 0.75,
    "team_wiki": 0.55,
    "email": 0.30,
    "chat": 0.20,
}

DEFAULT_THRESHOLDS: dict[str, float] = {
    "auto_apply": 0.80,      # confidence >= this -> route auto
    "human_min": 0.40,       # confidence below this -> dismissed
    "duplicate_sim": 0.80,   # sim >= and no numeric/negation diff -> duplicate
    "conflict_sim": 0.60,    # sim >= and numbers/negations differ -> conflict
    "llm_band_sim": 0.45,    # sim in [0.45, 0.60) -> judge (LLM, offline fallback)
    "knn_k": 8,              # nearest neighbours per claim
    "stale_days": 365,       # date gap over which a conflict becomes stale
    "embedding_weight": 0.50,  # blend weight of embedding sim vs TF-IDF sim
    "winner_trust_gap": 0.05,
    "winner_date_gap_days": 30,
}

DEFAULTS = {
    "trust": DEFAULT_TRUST,
    "thresholds": DEFAULT_THRESHOLDS,
    "auto_apply_enabled": True,
}


async def get_settings() -> dict:
    doc = await db.settings.find_one({"_id": "global"}) or {}
    settings = {
        "trust": {**DEFAULT_TRUST, **(doc.get("trust") or {})},
        "thresholds": {**DEFAULT_THRESHOLDS, **(doc.get("thresholds") or {})},
        "auto_apply_enabled": doc.get("auto_apply_enabled", True),
    }
    return settings


async def get_thresholds() -> dict:
    return (await get_settings())["thresholds"]


async def trust_for(source_type: str) -> float:
    settings = await get_settings()
    return float(settings["trust"].get(source_type, UNKNOWN_TRUST))


async def save_settings(patch: dict, actor: str) -> dict:
    current = await get_settings()
    merged = {
        "trust": {**current["trust"], **{k: float(v) for k, v in (patch.get("trust") or {}).items()}},
        "thresholds": {**current["thresholds"], **{k: float(v) for k, v in (patch.get("thresholds") or {}).items()}},
        "auto_apply_enabled": bool(patch.get("auto_apply_enabled", current["auto_apply_enabled"])),
    }
    await db.settings.update_one({"_id": "global"}, {"$set": merged}, upsert=True)
    await append_audit(actor, "settings_update", "global", {"keys": sorted(patch.keys())})
    return merged
