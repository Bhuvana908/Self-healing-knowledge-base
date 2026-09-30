"""Hash-chain tests: verification, tamper detection with the exact seq, and append-only
rollback (spec 13). Mongo adaptation: there are no UPDATE/DELETE triggers — append-only is
enforced at the data-access layer, and out-of-band edits (simulating a dropped trigger)
must be CAUGHT by verify_chain naming the exact seq."""

import pytest  # noqa: F401  (used by pytest.skip in the rollback test)
from pymongo import MongoClient

from lib.db import client as _motor_client  # ensures .env is loaded into os.environ
import os

MONGO = None


def _mongo():
    global MONGO
    if MONGO is None:
        MONGO = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    return MONGO


def test_chains_verify_clean(admin_client):
    r = admin_client.get("/ledger/verify")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["versions"]["ok"] is True
    assert body["audit"]["ok"] is True
    assert body["versions"]["records"] > 0


def test_version_tamper_detected_with_exact_seq(admin_client):
    mongo = _mongo()
    original = mongo.versions.find_one({}, sort=[("seq", 1)])
    assert original, "no versions in the ledger — load the demo corpus first"
    seq = original["seq"]

    # simulate out-of-band mutation (the thing DB triggers would reject)
    mongo.versions.update_one({"_id": original["_id"]}, {"$set": {"text": original["text"] + " TAMPERED"}})
    try:
        body = admin_client.get("/ledger/verify").json()
        assert body["ok"] is False
        assert f"seq {seq}" in body["versions"]["message"], body["versions"]["message"]
    finally:
        mongo.versions.update_one({"_id": original["_id"]}, {"$set": {"text": original["text"]}})

    # restoring the exact bytes heals the chain (hash recomputes identically)
    assert admin_client.get("/ledger/verify").json()["ok"] is True


def test_audit_tamper_detected_with_exact_seq(admin_client):
    mongo = _mongo()
    original = mongo.audit.find_one({}, sort=[("seq", 1)])
    assert original
    seq = original["seq"]

    mongo.audit.update_one({"_id": original["_id"]}, {"$set": {"actor": "attacker"}})
    try:
        body = admin_client.get("/ledger/verify").json()
        assert body["ok"] is False
        assert f"seq {seq}" in body["audit"]["message"]
    finally:
        mongo.audit.update_one({"_id": original["_id"]}, {"$set": {"actor": original["actor"]}})
    assert admin_client.get("/ledger/verify").json()["ok"] is True


def test_rollback_is_append_only(admin_client, seeded):
    """Pick a document that already has more than one version (auto-fixes create them),
    so the rollback target is genuinely older than current."""
    docs = admin_client.get("/documents").json()
    doc = history = None
    for d in (x for x in docs if x["status"] == "active" and x["current_version_no"] > 1):
        h = admin_client.get(f"/documents/{d['id']}/history").json()
        if len(h) > 1:
            doc, history = d, h
            break
    if doc is None:  # no multi-version doc yet: create one via an ingest + accepted fix
        pytest.skip("no multi-version document available in this run")

    before_count = len(history)
    before_versions = {v["version_no"] for v in history}
    target = history[0]

    r = admin_client.post(f"/documents/{doc['id']}/rollback/{target['version_no']}")
    assert r.status_code == 200, r.text

    after = admin_client.get(f"/documents/{doc['id']}/history").json()
    after_versions = {v["version_no"] for v in after}
    assert len(after) == before_count + 1
    assert before_versions <= after_versions  # nothing was deleted
    newest = max(after, key=lambda v: v["version_no"])
    assert newest["reason"] == f"rollback to v{target['version_no']}"
    assert newest["text"] == target["text"]
    assert admin_client.get("/ledger/verify").status_code == 200
