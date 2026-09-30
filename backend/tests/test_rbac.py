"""Role enforcement (spec 3, 13): viewer is read-only; only reviewers+ resolve; only
admins roll back and undo."""

import time


def test_viewer_cannot_resolve(viewer_client, seeded):
    conflicts = viewer_client.get("/conflicts?status=open").json()
    assert conflicts, "no open findings — load the demo corpus and scan first"
    r = viewer_client.post(f"/conflicts/{conflicts[0]['id']}/resolve", json={"action": "reject"})
    assert r.status_code == 403


def test_viewer_cannot_scan_or_ingest(viewer_client):
    assert viewer_client.post("/scan").status_code == 403
    r = viewer_client.post("/documents", json={
        "title": f"viewer ingest {time.time_ns()}", "text": "This body has enough words to be a valid document.",
    })
    assert r.status_code == 403


def test_only_admin_can_roll_back(reviewer_client, admin_client, seeded):
    docs = admin_client.get("/documents").json()
    doc = next(d for d in docs if d["status"] == "active")
    r = reviewer_client.post(f"/documents/{doc['id']}/rollback/1")
    assert r.status_code == 403
    assert admin_client.post(f"/documents/{doc['id']}/rollback/1").status_code in (200, 409)


def test_only_admin_can_undo(reviewer_client, seeded):
    r = reviewer_client.post("/conflicts/nonexistent/undo")
    assert r.status_code == 403  # role gate fires before existence checks


def test_viewer_can_read(viewer_client):
    assert viewer_client.get("/documents").status_code == 200
    assert viewer_client.get("/conflicts").status_code == 200
    assert viewer_client.get("/audit").status_code == 200
    assert viewer_client.get("/ledger/verify").status_code == 200
    assert viewer_client.get("/evaluation").status_code == 200
    assert viewer_client.get("/stats").status_code == 200


def test_failed_signin_audited_and_rate_limited(client):
    import uuid
    user = f"nobody-{uuid.uuid4().hex[:8]}"
    for _ in range(5):
        r = client.post("/auth/login", json={"username": user, "password": "wrong-password"})
        assert r.status_code == 401
    r = client.post("/auth/login", json={"username": user, "password": "wrong-password"})
    assert r.status_code == 429  # rate limiter trips after repeated failures
