"""공지사항 · 건강 정보 (같은 게시판, category 로 구분)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import KST, format_kst_iso, now_kst
from app.models import Notice

CATEGORIES = ("NOTICE", "HEALTH")


def _payload(notice: Notice, *, with_body: bool = True) -> dict:
    data = {
        "id": notice.id,
        "title": notice.title,
        "category": notice.category,
        "pinned": notice.pinned,
        "published": notice.published,
        "publishedAt": format_kst_iso(notice.published_at),
        # 게시 예약 — 공개 날짜가 아직 오지 않은 글
        "scheduled": notice.published_at > now_kst(),
        "updatedAt": format_kst_iso(notice.updated_at),
    }
    if with_body:
        data["body"] = notice.body
    return data


def _parse_publish_at(value: str | None) -> datetime | None:
    """관리자 입력 공개 일시 (예: 2026-11-03T09:00) — 시간대가 없으면 KST."""
    if not value:
        return None
    try:
        at = datetime.fromisoformat(value)
    except ValueError:
        raise_app_error("INVALID_NOTICE")
    return at if at.tzinfo else at.replace(tzinfo=KST)


async def list_notices(
    db: AsyncSession, *, include_unpublished: bool = False, category: str | None = None
) -> list[dict]:
    stmt = select(Notice).order_by(Notice.pinned.desc(), Notice.published_at.desc(), Notice.id.desc())
    if not include_unpublished:
        stmt = stmt.where(Notice.published.is_(True)).where(Notice.published_at <= now_kst())
    if category in CATEGORIES:
        stmt = stmt.where(Notice.category == category)
    return [_payload(n) for n in (await db.execute(stmt)).scalars().all()]


async def get_notice(db: AsyncSession, notice_id: int, *, include_unpublished: bool = False) -> dict:
    notice = await db.get(Notice, notice_id)
    if not notice or (
        not include_unpublished and (not notice.published or notice.published_at > now_kst())
    ):
        raise_app_error("NOT_FOUND", 404)
    return _payload(notice)


async def save_notice(
    db: AsyncSession,
    *,
    notice_id: int | None,
    title: str,
    body: str,
    pinned: bool,
    published: bool,
    category: str = "NOTICE",
    publishedAt: str | None = None,
) -> dict:
    title = (title or "").strip()[:200]
    body = (body or "").strip()
    if not title or not body or category not in CATEGORIES:
        raise_app_error("INVALID_NOTICE")
    publish_at = _parse_publish_at(publishedAt)
    if notice_id is None:
        notice = Notice(
            title=title, body=body, category=category, pinned=pinned, published=published,
            published_at=publish_at or now_kst(),
        )
        db.add(notice)
    else:
        notice = await db.get(Notice, notice_id)
        if not notice:
            raise_app_error("NOT_FOUND", 404)
        notice.title, notice.body, notice.category = title, body, category
        notice.pinned, notice.published = pinned, published
        if publish_at is not None:
            notice.published_at = publish_at
    await db.commit()
    await db.refresh(notice)
    return _payload(notice)


async def delete_notice(db: AsyncSession, notice_id: int) -> None:
    notice = await db.get(Notice, notice_id)
    if not notice:
        raise_app_error("NOT_FOUND", 404)
    await db.delete(notice)
    await db.commit()
