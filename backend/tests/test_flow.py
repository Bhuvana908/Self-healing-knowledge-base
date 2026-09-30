"""End-to-end API flow (spec 10, 13): ingest → scan → resolve → rollback → ledger verify,
with role-gated endpoints answering correctly at every step."""

import time


def test_full_api_flow(reviewer_client, admin_client, seeded):
    stamp = time.time_ns()
    stamp_marker = f"process {stamp}"

    # 1. ingest a document carrying an unsupported claim. The text MUST be unique per run:
    # conflict ids are content hashes, so a finding resolved by an earlier run is terminal
    # and is deliberately never regenerated.
    r = reviewer_client.post("/documents", json={
        "title": f"Flow doc {stamp}",
        "text": (f"Everyone knows that process {stamp} is the fastest available option for new managers. "
                 "Submit tickets through the standard portal."),
        "source_type": "team_wiki",
    })
    assert r.status_code == 200
    doc = r.json()
    assert doc["status"] == "active"

    # 2. scan: the unsupported claim is detected and routed (human, conf < 0.8 for wiki trust)
    reviewer_client.post("/scan")
    conflicts = reviewer_client.get("/conflicts").json()
    mine = [c for c in conflicts if c["doc_a"] == doc["id"] and c["type"] == "unsupported"]
    assert mine, "unsupported claim was not detected"
    finding = mine[0]

    # 3. resolve: accept the proposal (remove the unsupported sentence)
    r = reviewer_client.post(f"/conflicts/{finding['id']}/resolve", json={"action": "accept"})
    assert r.status_code == 200
    body = r.json()
    assert body["conflict"]["status"] == "accepted"
    assert body["versions"], "an applied edit must append a hash-chained version"

    # 4. history reflects v1 + the fix
    history = reviewer_client.get(f"/documents/{doc['id']}/history").json()
    assert len(history) == 2
    assert stamp_marker not in history[-1]["text"]

    # 5. undo of a human-accepted fix is not permitted (only auto_applied can be undone)
    r = admin_client.post(f"/conflicts/{finding['id']}/undo")
    assert r.status_code == 409

    # 6. admin rollback to v1 appends a new version
    r = admin_client.post(f"/documents/{doc['id']}/rollback/1")
    assert r.status_code == 200
    history = reviewer_client.get(f"/documents/{doc['id']}/history").json()
    assert len(history) == 3
    assert history[-1]["reason"].startswith("rollback to v")

    # 7. health + ledger verification endpoints answer with chain status
    health = admin_client.get("/health").json()
    assert health["status"] in {"ok", "tampered"}
    assert {"documents", "claims", "awaiting_human"} <= set(health["counts"].keys())
    verify = admin_client.get("/ledger/verify").json()
    assert {"ok", "versions", "audit", "checked_at"} <= set(verify.keys())


def test_health_includes_chain_status(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "chain" in body and "ok" in body["chain"]
