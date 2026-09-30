"""Auth primitives: PBKDF2-SHA256 password hashing, JWT session tokens, SECRET_KEY
validation, and login rate limiting. No default credentials ship anywhere — the first
admin is created through POST /api/auth/setup, and the app refuses to start when the
signing secret is missing or equals a known default."""

import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

import jwt

COOKIE_NAME = "shkb_session"
PBKDF2_ITERATIONS = 240_000
TOKEN_TTL_HOURS = 12
ALGORITHM = "HS256"

# Values the app refuses to start with (spec 3: no default secrets).
KNOWN_DEFAULT_SECRETS = {
    "changeme", "change-me", "change_me", "secret", "secretkey", "secret-key",
    "supersecret", "super-secret", "pleasechangeme", "changeit", "changeme123",
    "insecure-secret", "your-secret-key", "test-secret", "defaultsecret", "dev",
}
MIN_SECRET_LEN = 16


class SecretConfigError(RuntimeError):
    """Raised at startup when SECRET_KEY is missing, too short, or a known default."""


def validate_secret(value: str | None) -> str:
    v = (value or "").strip()
    if not v:
        raise SecretConfigError(
            "SECRET_KEY is not set — refusing to start. Generate one with: "
            "python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    if v.lower() in KNOWN_DEFAULT_SECRETS:
        raise SecretConfigError("SECRET_KEY equals a known default value — refusing to start.")
    if len(v) < MIN_SECRET_LEN:
        raise SecretConfigError(f"SECRET_KEY is shorter than {MIN_SECRET_LEN} characters — refusing to start.")
    return v


def get_secret() -> str:
    return validate_secret(os.environ.get("SECRET_KEY"))


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    """PBKDF2-SHA256 with a per-user random salt. Returns (pw_hash, salt) as hex."""
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS)
    return digest.hex(), salt


def verify_password(password: str, pw_hash: str, salt: str) -> bool:
    try:
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS)
        return hmac.compare_digest(digest.hex(), pw_hash)
    except ValueError:
        return False


def create_token(username: str, role: str, secret: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_TTL_HOURS),
        "jti": secrets.token_hex(8),  # rotation: every login mints a fresh token id
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def decode_token(token: str, secret: str) -> dict | None:
    try:
        return jwt.decode(token, secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


class LoginRateLimiter:
    """Fixed-window failed-login limiter per identity+IP (in-memory; single pod)."""

    def __init__(self, max_fails: int = 5, window_seconds: int = 900):
        self.max_fails = max_fails
        self.window_seconds = window_seconds
        self._fails: dict[str, list[float]] = {}

    def _prune(self, key: str) -> None:
        now = time.time()
        self._fails[key] = [t for t in self._fails.get(key, []) if now - t < self.window_seconds]

    def blocked(self, key: str) -> bool:
        self._prune(key)
        return len(self._fails.get(key, [])) >= self.max_fails

    def record_fail(self, key: str) -> None:
        self._fails.setdefault(key, []).append(time.time())

    def reset(self, key: str) -> None:
        self._fails.pop(key, None)
