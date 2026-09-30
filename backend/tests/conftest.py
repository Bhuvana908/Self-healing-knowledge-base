"""Pre-scaffolded pytest fixtures for the FastAPI backend.

Tests hit the live uvicorn process managed by supervisor (not an in-process ASGI app), so
the app under test is the same one the frontend and Playwright see. Do NOT re-create this
file — add app-specific fixtures below the marker at the bottom.
"""

import os

import httpx
import pytest
import pytest_asyncio

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API_URL = f"{BACKEND_URL}/api"


def api_url(path: str = "") -> str:
    """Absolute URL for an /api route: api_url("/status") -> http://localhost:8001/api/status."""
    return f"{API_URL}{path}"


@pytest.fixture(scope="session")
def backend_url() -> str:
    return BACKEND_URL


@pytest.fixture
def client():
    """Sync httpx client rooted at /api — the default for endpoint tests.

    Example:
        def test_status(client):
            assert client.get("/status").status_code == 200
    """
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        yield c


@pytest_asyncio.fixture
async def aclient():
    """Async variant, for tests that also await motor/backend helpers directly."""
    async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as c:
        yield c


# --- app-specific fixtures below this line ---
from pathlib import Path

ADMIN_USER = os.environ.get("TEST_ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("TEST_ADMIN_PASS", "Heal-KB-2026!secure")


def _sign_in(c: httpx.Client, username: str, password: str) -> None:
    """Login; bootstrap the first admin on a fresh DB; tolerate xdist creation races."""
    r = c.post("/auth/login", json={"username": username, "password": password})
    if r.status_code == 401:
        r = c.post("/auth/setup", json={"username": username, "password": password})
        if r.status_code in (403, 409):
            r = c.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"auth failed for {username}: {r.status_code} {r.text}"


@pytest.fixture(scope="session")
def admin_client():
    with httpx.Client(base_url=API_URL, timeout=120.0) as c:
        _sign_in(c, ADMIN_USER, ADMIN_PASS)
        yield c


@pytest.fixture(scope="session")
def viewer_client(admin_client):
    username, password = "ci-viewer", "Viewer-2026-pass!"
    admin_client.post("/auth/users", json={"username": username, "password": password, "role": "viewer"})
    with httpx.Client(base_url=API_URL, timeout=60.0) as c:
        _sign_in(c, username, password)
        yield c


@pytest.fixture(scope="session")
def reviewer_client(admin_client):
    username, password = "ci-reviewer", "Reviewer-2026-pass!"
    admin_client.post("/auth/users", json={"username": username, "password": password, "role": "reviewer"})
    with httpx.Client(base_url=API_URL, timeout=60.0) as c:
        _sign_in(c, username, password)
        yield c


@pytest.fixture(scope="session")
def seeded(admin_client):
    """Idempotent demo corpus + one scan so findings exist for RBAC/flow tests."""
    admin_client.post("/admin/demo/load")
    admin_client.post("/scan")
