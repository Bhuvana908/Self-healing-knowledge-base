"""Request dependencies: current user from the httpOnly JWT cookie + role gating.
Role rank: viewer (1) < reviewer (2) < admin (3); every route declares its minimum."""

from fastapi import Depends, HTTPException, Request

from lib.db import db
from lib.security import COOKIE_NAME, decode_token, get_secret

ROLE_RANK = {"viewer": 1, "reviewer": 2, "admin": 3}


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in")
    payload = decode_token(token, get_secret())
    if not payload:
        raise HTTPException(status_code=401, detail="Session expired or invalid — sign in again")
    user = await db.users.find_one({"username": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="Unknown user")
    user.pop("_id", None)
    user.pop("pw_hash", None)
    user.pop("salt", None)
    return user


def require_role(minimum: str):
    async def dependency(user: dict = Depends(get_current_user)) -> dict:
        if ROLE_RANK.get(user["role"], 0) < ROLE_RANK[minimum]:
            raise HTTPException(status_code=403, detail=f"This action requires the {minimum} role")
        return user
    return dependency


require_viewer = require_role("viewer")
require_reviewer = require_role("reviewer")
require_admin = require_role("admin")
