from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Cookie, Depends, Request
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import raise_app_error
from app.core.session import get_admin_session, get_member_session
from app.database import get_db, get_redis
from app.models import AdminUser, Member, MemberStatus

settings = get_settings()


async def get_redis_client() -> Redis:
    return await get_redis()


async def get_current_member(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis_client)],
    hk_session: Annotated[Optional[str], Cookie(alias=settings.session_cookie_name)] = None,
) -> Member:
    session_id = hk_session or request.headers.get("X-Session-Id")
    if not session_id:
        raise_app_error("UNAUTHORIZED", 401)
    data = await get_member_session(redis, session_id)
    if not data:
        raise_app_error("UNAUTHORIZED", 401)
    result = await db.execute(select(Member).where(Member.id == data["member_id"]))
    member = result.scalar_one_or_none()
    if not member or member.status == MemberStatus.WITHDRAWN:
        raise_app_error("UNAUTHORIZED", 401)
    return member


async def get_current_active_member(
    member: Annotated[Member, Depends(get_current_member)],
) -> Member:
    if member.status != MemberStatus.ACTIVE:
        raise_app_error("NOT_VERIFIED", 403)
    return member


async def get_current_admin(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis_client)],
    hk_admin_session: Annotated[Optional[str], Cookie(alias=settings.admin_session_cookie_name)] = None,
) -> AdminUser:
    session_id = hk_admin_session or request.headers.get("X-Admin-Session-Id")
    if not session_id:
        raise_app_error("UNAUTHORIZED", 401)
    data = await get_admin_session(redis, session_id)
    if not data:
        raise_app_error("UNAUTHORIZED", 401)
    result = await db.execute(select(AdminUser).where(AdminUser.id == data["admin_id"]))
    admin = result.scalar_one_or_none()
    if not admin or not admin.is_active:
        raise_app_error("FORBIDDEN", 403)
    return admin
