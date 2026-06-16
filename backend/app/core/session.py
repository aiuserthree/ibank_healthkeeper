from __future__ import annotations

import json
import secrets
from typing import Any

from redis.asyncio import Redis

from app.config import get_settings

MEMBER_PREFIX = "session:member:"
ADMIN_PREFIX = "session:admin:"


def _member_key(session_id: str) -> str:
    return f"{MEMBER_PREFIX}{session_id}"


def _admin_key(session_id: str) -> str:
    return f"{ADMIN_PREFIX}{session_id}"


async def create_member_session(redis: Redis, member_id: int) -> str:
    settings = get_settings()
    session_id = secrets.token_urlsafe(32)
    payload = json.dumps({"member_id": member_id})
    await redis.setex(
        _member_key(session_id),
        settings.session_max_age,
        payload,
    )
    return session_id


async def create_admin_session(redis: Redis, admin_id: int, *, max_age: int | None = None) -> str:
    settings = get_settings()
    ttl = max_age if max_age is not None else settings.session_max_age
    session_id = secrets.token_urlsafe(32)
    payload = json.dumps({"admin_id": admin_id})
    await redis.setex(
        _admin_key(session_id),
        ttl,
        payload,
    )
    return session_id


async def get_member_session(redis: Redis, session_id: str) -> dict[str, Any] | None:
    raw = await redis.get(_member_key(session_id))
    if not raw:
        return None
    return json.loads(raw)


async def get_admin_session(redis: Redis, session_id: str) -> dict[str, Any] | None:
    raw = await redis.get(_admin_key(session_id))
    if not raw:
        return None
    return json.loads(raw)


async def delete_member_session(redis: Redis, session_id: str) -> None:
    await redis.delete(_member_key(session_id))


async def delete_admin_session(redis: Redis, session_id: str) -> None:
    await redis.delete(_admin_key(session_id))
