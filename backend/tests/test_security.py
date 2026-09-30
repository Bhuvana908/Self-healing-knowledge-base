"""Security posture tests: the app refuses to start with a missing/default/short secret,
and password hashing uses PBKDF2-SHA256 with per-user salts (spec 3, 13)."""

import os
import subprocess
import sys

import pytest

from lib.security import SecretConfigError, hash_password, validate_secret, verify_password


@pytest.mark.parametrize("bad", ["", "changeme", "secret", "change-me", "short", "supersecret"])
def test_validate_secret_rejects_defaults(bad):
    with pytest.raises(SecretConfigError):
        validate_secret(bad)


def test_validate_secret_accepts_strong_random():
    strong = "9f2c1e4b7a6d3f8c0b5e2a9d7c4f1b8e"
    assert validate_secret(strong) == strong


def test_server_refuses_to_start_with_default_secret():
    env = dict(os.environ, SECRET_KEY="changeme")
    r = subprocess.run(
        [sys.executable, "-c", "import server"],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        env=env, capture_output=True, text=True, timeout=120,
    )
    assert r.returncode != 0, "server must refuse to start with a default secret"
    assert "SECRET_KEY" in (r.stderr or "")


def test_password_hashing_uses_per_user_salt():
    h1, s1 = hash_password("correct horse battery staple")
    h2, s2 = hash_password("correct horse battery staple")
    assert s1 != s2  # per-user salt
    assert h1 != h2
    assert verify_password("correct horse battery staple", h1, s1)
    assert not verify_password("wrong password", h1, s1)
