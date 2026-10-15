"""공지사항."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import format_kst_iso, now_kst
from app.models import Notice


def _payload(notice: Notice, *, with_body: bool = True) -> dict:
    data = {
        "id": notice.id,
        "title": notice.title,
        "pinned": notice.pinned,
        "published": notice.published,
        "publishedAt": format_kst_iso(notice.published_at),
        "updatedAt": format_kst_iso(notice.updated_at),
    }
    if with_body:
        data["body"] = notice.body
    return data


async def list_notices(db: AsyncSession, *, include_unpublished: bool = False) -> list[dict]:
    stmt = select(Notice).order_by(Notice.pinned.desc(), Notice.published_at.desc(), Notice.id.desc())
    if not include_unpublished:
        stmt = stmt.where(Notice.published.is_(True))
    return [_payload(n) for n in (await db.execute(stmt)).scalars().all()]


async def get_notice(db: AsyncSession, notice_id: int, *, include_unpublished: bool = False) -> dict:
    notice = await db.get(Notice, notice_id)
    if not notice or (not notice.published and not include_unpublished):
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
) -> dict:
    title = (title or "").strip()[:200]
    body = (body or "").strip()
    if not title or not body:
        raise_app_error("INVALID_NOTICE")
    if notice_id is None:
        notice = Notice(title=title, body=body, pinned=pinned, published=published, published_at=now_kst())
        db.add(notice)
    else:
        notice = await db.get(Notice, notice_id)
        if not notice:
            raise_app_error("NOT_FOUND", 404)
        notice.title, notice.body, notice.pinned, notice.published = title, body, pinned, published
    await db.commit()
    await db.refresh(notice)
    return _payload(notice)


async def delete_notice(db: AsyncSession, notice_id: int) -> None:
    notice = await db.get(Notice, notice_id)
    if not notice:
        raise_app_error("NOT_FOUND", 404)
    await db.delete(notice)
    await db.commit()
