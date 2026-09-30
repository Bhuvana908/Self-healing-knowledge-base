"""Auth routes: first-run admin setup, login (rate limited, audited), logout, me, and
admin user management. No default credentials exist — the first admin is created through
POST /api/auth/setup which only works while the users collection is empty."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.db import db
from lib.deps import ROLE_RANK, get_current_user, require_admin
from lib.ledger import append_audit
from lib.security import (
    COOKIE_NAME,
    TOKEN_TTL_HOURS,
    LoginRateLimiter,
    create_token,
    get_secret,
    hash_password,
    verify_password,
)
from models.models import (
    LoginRequest,
    NeedsSetup,
    SetupRequest,
    UserCreate,
    UserOut,
    UserUpdate,
)

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = LoginRateLimiter()
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,40}$")


def _clean(user: dict) -> dict:
    return {"username": user["username"], "role": user["role"], "created_at": user.get("created_at")}


def _set_session_cookie(response: Response, username: str, role: str) -> None:
    token = create_token(username, role, get_secret())
    response.set_cookie(
        key=COOKIE_NAME, value=token, max_age=TOKEN_TTL_HOURS * 3600,
        httponly=True, samesite="lax", path="/",
    )


def _validate_credentials(username: str, password: str) -> None:
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=422, detail="Username must be 3-40 chars: letters, digits, dot, dash, underscore")
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")


@router.get("/status", response_model=NeedsSetup)
async def status() -> NeedsSetup:
    return NeedsSetup(needs_setup=await db.users.count_documents({}) == 0)


@router.post("/setup", response_model=UserOut)
async def setup(body: SetupRequest, response: Response) -> UserOut:
    """First-run bootstrap: creates the very first admin. Refuses once any user exists."""
    if await db.users.count_documents({}) > 0:
        raise HTTPException(status_code=403, detail="Setup already completed — sign in instead")
    _validate_credentials(body.username, body.password)
    pw_hash, salt = hash_password(body.password)
    user = {
        "username": body.username, "role": "admin",
        "salt": salt, "pw_hash": pw_hash,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user.copy())
    await append_audit(body.username, "user_create", body.username, {"role": "admin", "bootstrap": True})
    _set_session_cookie(response, body.username, "admin")
    return UserOut(**_clean(user))


@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, request: Request, response: Response) -> UserOut:
    ip = request.client.host if request.client else "unknown"
    key = f"{body.username}|{ip}"
    if limiter.blocked(key):
        await append_audit(body.username, "login_rate_limited", body.username, {"ip": ip})
        raise HTTPException(status_code=429, detail="Too many failed sign-ins — try again in a few minutes")
    user = await db.users.find_one({"username": body.username})
    if not user or not verify_password(body.password, user["pw_hash"], user["salt"]):
        limiter.record_fail(key)
        await append_audit(body.username, "login_failed", body.username, {"ip": ip})
        raise HTTPException(status_code=401, detail="Invalid username or password")
    limiter.reset(key)
    _set_session_cookie(response, user["username"], user["role"])
    await append_audit(user["username"], "login", user["username"], {"ip": ip})
    return UserOut(**_clean(user))


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)) -> UserOut:
    return UserOut(**_clean(user))


@router.get("/users", response_model=list[UserOut])
async def list_users(_: dict = Depends(require_admin)) -> list[UserOut]:
    users = await db.users.find({}, {"pw_hash": 0, "salt": 0}).sort("created_at", 1).to_list(500)
    return [UserOut(**_clean(u)) for u in users]


@router.post("/users", response_model=UserOut)
async def create_user(body: UserCreate, user: dict = Depends(require_admin)) -> UserOut:
    if body.role not in ROLE_RANK:
        raise HTTPException(status_code=422, detail=f"Role must be one of {sorted(ROLE_RANK)}")
    _validate_credentials(body.username, body.password)
    if await db.users.find_one({"username": body.username}):
        raise HTTPException(status_code=409, detail="Username already exists")
    pw_hash, salt = hash_password(body.password)
    new_user = {
        "username": body.username, "role": body.role, "salt": salt, "pw_hash": pw_hash,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(new_user.copy())
    await append_audit(user["username"], "user_create", body.username, {"role": body.role})
    return UserOut(**_clean(new_user))


@router.patch("/users/{username}", response_model=UserOut)
async def update_user(username: str, body: UserUpdate, user: dict = Depends(require_admin)) -> UserOut:
    target = await db.users.find_one({"username": username})
    if not target:
        raise HTTPException(status_code=404, detail="Unknown user")
    patch: dict = {}
    if body.role is not None:
        if body.role not in ROLE_RANK:
            raise HTTPException(status_code=422, detail=f"Role must be one of {sorted(ROLE_RANK)}")
        if target["role"] == "admin" and body.role != "admin":
            admins = await db.users.count_documents({"role": "admin"})
            if admins <= 1:
                raise HTTPException(status_code=409, detail="Cannot demote the last admin")
        patch["role"] = body.role
    if body.password:
        if len(body.password) < 8:
            raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
        pw_hash, salt = hash_password(body.password)
        patch["pw_hash"] = pw_hash
        patch["salt"] = salt
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"username": username}, {"$set": patch})
    await append_audit(user["username"], "user_update", username,
                       {"keys": sorted(patch.keys())})
    target.update(patch)
    return UserOut(**_clean(target))
