from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.time import KST, now_kst
from app.models import (
    MailStatus,
    Member,
    Reservation,
    ReservationStatus,
    Slot,
    TeamsMessage,
    TeamsMessageType,
)
from app.services.sso import _microsoft_post

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
MICROSOFT_TIMEOUT = httpx.Timeout(connect=15.0, read=30.0, write=15.0, pool=15.0)

GRAPH_SCOPES = "Chat.Create ChatMessage.Send offline_access"

# Microsoft는 refresh token 사용마다 새 토큰을 발급·무효화함. 런타임·파일에 최신값 유지.
_REFRESH_TOKEN_FILE = Path(__file__).resolve().parents[3] / ".teams-sender-refresh"
_runtime_refresh_token: str | None = None


def _effective_refresh_token() -> str:
    if _runtime_refresh_token:
        return _runtime_refresh_token
    if _REFRESH_TOKEN_FILE.is_file():
        stored = _REFRESH_TOKEN_FILE.read_text(encoding="utf-8").strip()
        if stored:
            return stored
    return get_settings().teams_sender_refresh_token


def _persist_rotated_refresh_token(token: str) -> None:
    global _runtime_refresh_token
    _runtime_refresh_token = token
    _REFRESH_TOKEN_FILE.write_text(f"{token}\n", encoding="utf-8")
    logger.info(
        "Teams sender refresh token rotated — saved to %s",
        _REFRESH_TOKEN_FILE.name,
    )


def _graph_client() -> httpx.AsyncClient:
    transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0", retries=0)
    return httpx.AsyncClient(timeout=MICROSOFT_TIMEOUT, transport=transport)


_WEEKDAY_KO = ("월", "화", "수", "목", "금", "토", "일")


async def _get_sender_access_token() -> str:
    """발송 계정(healthkeeper@) refresh token → Graph 위임 access token."""
    settings = get_settings()
    refresh_token = _effective_refresh_token()
    if not refresh_token.strip():
        raise RuntimeError("TEAMS_SENDER_REFRESH_TOKEN is not configured")
    url = f"https://login.microsoftonline.com/{settings.entra_tenant_id}/oauth2/v2.0/token"
    status, data = await _microsoft_post(
        url,
        {
            "grant_type": "refresh_token",
            "client_id": settings.entra_client_id,
            "client_secret": settings.entra_client_secret,
            "refresh_token": refresh_token,
            "scope": GRAPH_SCOPES,
        },
    )
    if status != 200 or "access_token" not in data:
        detail = data.get("error_description") or data.get("error") or str(data)[:500]
        raise RuntimeError(f"Graph sender token failed ({status}): {detail}")
    new_refresh = data.get("refresh_token")
    if new_refresh and new_refresh != refresh_token:
        _persist_rotated_refresh_token(str(new_refresh))
    return str(data["access_token"])


async def _graph_request(
    method: str,
    path: str,
    *,
    token: str,
    json_body: dict | None = None,
) -> tuple[int, dict | str]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    url = f"{GRAPH_BASE}{path}"
    async with _graph_client() as client:
        resp = await client.request(method, url, headers=headers, json=json_body)
    if not resp.content:
        return resp.status_code, {}
    try:
        return resp.status_code, resp.json()
    except json.JSONDecodeError:
        return resp.status_code, resp.text


async def _sender_oid_from_token(token: str) -> str:
    """위임 토큰의 oid — 1:1 채팅 members에 발송자 포함용."""
    try:
        claims = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError as exc:
        raise RuntimeError(f"Cannot parse sender token: {exc}") from exc
    oid = claims.get("oid") or claims.get("sub")
    if not oid:
        raise RuntimeError("Sender token has no oid/sub claim")
    return str(oid)


async def _get_or_create_chat(token: str, recipient_oid: str) -> str:
    sender_oid = await _sender_oid_from_token(token)
    members = [
        {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            "roles": ["owner"],
            "user@odata.bind": f"{GRAPH_BASE}/users('{sender_oid}')",
        },
        {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            "roles": ["owner"],
            "user@odata.bind": f"{GRAPH_BASE}/users('{recipient_oid}')",
        },
    ]
    status, data = await _graph_request(
        "POST",
        "/chats",
        token=token,
        json_body={
            "chatType": "oneOnOne",
            "members": members,
        },
    )
    if status in (200, 201) and isinstance(data, dict) and data.get("id"):
        return str(data["id"])
    detail = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)[:1000]
    raise RuntimeError(f"Teams chat create failed ({status}): {detail}")


async def _send_chat_message(token: str, chat_id: str, body: str) -> None:
    status, data = await _graph_request(
        "POST",
        f"/chats/{chat_id}/messages",
        token=token,
        json_body={
            "body": {
                "contentType": "html",
                "content": body,
            }
        },
    )
    if status in (200, 201):
        return
    detail = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)[:1000]
    raise RuntimeError(f"Teams message send failed ({status}): {detail}")


def _slot_label(slot: Slot) -> str:
    dow = _WEEKDAY_KO[slot.slot_date.weekday()]
    return f"{slot.slot_date.month}/{slot.slot_date.day}({dow}) {slot.start_time.strftime('%H:%M')}"


def render_reminder_body(*, name: str, slot: Slot, minutes_before: int) -> str:
    slot_text = _slot_label(slot)
    return (
        f"<p><strong>[헬스키퍼]</strong> 안마 예약 {minutes_before}분 전 알림</p>"
        f"<p>{name}님, <strong>{slot_text}</strong> 예약 시간이 곧 시작됩니다.</p>"
        f"<p>헬스키퍼 공간으로 이동해 주세요.</p>"
    )


def _slot_starts_in_minutes(slot: Slot, now: datetime, target_minutes: int) -> bool:
    slot_dt = datetime.combine(slot.slot_date, slot.start_time, tzinfo=KST)
    delta_min = (slot_dt - now).total_seconds() / 60
    return (target_minutes - 1) <= delta_min <= (target_minutes + 1)


async def enqueue_teams_message(
    db: AsyncSession,
    *,
    message_type: TeamsMessageType,
    to_member_id: int,
    to_entra_oid: str,
    body: str,
    dedupe_key: Optional[str] = None,
    reservation_id: Optional[int] = None,
) -> Optional[TeamsMessage]:
    if dedupe_key:
        existing = await db.execute(
            select(TeamsMessage).where(TeamsMessage.dedupe_key == dedupe_key)
        )
        if existing.scalar_one_or_none():
            return None

    msg = TeamsMessage(
        type=message_type,
        to_member_id=to_member_id,
        to_entra_oid=to_entra_oid,
        body=body,
        status=MailStatus.PENDING,
        dedupe_key=dedupe_key,
        reservation_id=reservation_id,
    )
    db.add(msg)
    await db.flush()
    return msg


async def send_teams_message(msg: TeamsMessage) -> str:
    token = await _get_sender_access_token()
    chat_id = await _get_or_create_chat(token, msg.to_entra_oid)
    await _send_chat_message(token, chat_id, msg.body)
    return chat_id


async def process_one_teams_message(db: AsyncSession, message_id: int) -> bool:
    settings = get_settings()
    result = await db.execute(
        select(TeamsMessage)
        .where(TeamsMessage.id == message_id)
        .where(TeamsMessage.status.in_([MailStatus.PENDING, MailStatus.FAILED]))
        .with_for_update(skip_locked=True)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        return False

    msg.status = MailStatus.SENDING
    msg.last_tried_at = now_kst()
    await db.flush()

    try:
        chat_id = await send_teams_message(msg)
        msg.chat_id = chat_id
        msg.status = MailStatus.SENT
        msg.sent_at = now_kst()
        msg.last_error = None
    except Exception as exc:
        msg.status = MailStatus.FAILED
        msg.retry_count += 1
        msg.last_error = str(exc)[:2000]
        if msg.retry_count >= settings.teams_reminder_retry_max:
            msg.status = MailStatus.DEAD
        logger.warning("Teams message %s failed: %s", msg.id, exc)
    await db.commit()
    return msg.status == MailStatus.SENT


async def retry_failed_teams_messages(db: AsyncSession) -> int:
    settings = get_settings()
    now = now_kst()
    backoff = settings.teams_reminder_retry_backoff_seconds
    result = await db.execute(
        select(TeamsMessage).where(TeamsMessage.status == MailStatus.FAILED)
    )
    retried = 0
    for msg in result.scalars().all():
        if msg.retry_count >= settings.teams_reminder_retry_max:
            msg.status = MailStatus.DEAD
            continue
        idx = min(msg.retry_count, len(backoff) - 1)
        wait = backoff[idx]
        if msg.last_tried_at and (now - msg.last_tried_at).total_seconds() < wait:
            continue
        msg.status = MailStatus.PENDING
        retried += 1
    if retried:
        await db.commit()
    return retried


async def enqueue_due_reminders(db: AsyncSession) -> int:
    settings = get_settings()
    if not settings.teams_sender_ready():
        return 0

    now = now_kst()
    today = now.date()
    minutes_before = settings.teams_reminder_minutes_before

    result = await db.execute(
        select(Reservation, Slot, Member)
        .join(Slot, Reservation.slot_id == Slot.id)
        .join(Member, Reservation.member_id == Member.id)
        .where(Reservation.status == ReservationStatus.CONFIRMED)
        .where(Slot.slot_date == today)
        .where(Slot.is_vacation.is_(False))
        .where(Member.entra_oid.isnot(None))
    )

    count = 0
    for reservation, slot, member in result.all():
        if not _slot_starts_in_minutes(slot, now, minutes_before):
            continue
        body = render_reminder_body(
            name=member.name,
            slot=slot,
            minutes_before=minutes_before,
        )
        msg = await enqueue_teams_message(
            db,
            message_type=TeamsMessageType.RESERVE_REMINDER,
            to_member_id=member.id,
            to_entra_oid=member.entra_oid,
            body=body,
            reservation_id=reservation.id,
            dedupe_key=f"teams-reminder:{reservation.id}",
        )
        if msg:
            count += 1
    if count:
        await db.commit()
    return count


async def process_pending_teams_messages(db: AsyncSession, limit: int = 20) -> int:
    await retry_failed_teams_messages(db)
    result = await db.execute(
        select(TeamsMessage.id)
        .where(TeamsMessage.status == MailStatus.PENDING)
        .order_by(TeamsMessage.id)
        .limit(limit)
    )
    sent = 0
    for (message_id,) in result.all():
        if await process_one_teams_message(db, message_id):
            sent += 1
    return sent


async def send_test_chat_to_member(
    db: AsyncSession,
    *,
    member: Member,
    message: str | None = None,
) -> str:
    """로컬 테스트 — healthkeeper@ → member 1:1 채팅 발송."""
    settings = get_settings()
    if not settings.teams_sender_ready():
        raise RuntimeError(
            "Teams sender not configured — set TEAMS_SENDER_REFRESH_TOKEN in .env "
            "(run ./scripts/obtain-teams-sender-token.sh)"
        )
    if not member.entra_oid:
        raise RuntimeError(f"Member {member.email} has no entra_oid — login via Teams SSO first")

    body = message or (
        "<p><strong>[헬스키퍼]</strong> Teams 1:1 알림 테스트</p>"
        f"<p>{member.name}님, 로컬 테스트 메시지입니다.</p>"
    )
    msg = TeamsMessage(
        type=TeamsMessageType.RESERVE_REMINDER,
        to_member_id=member.id,
        to_entra_oid=member.entra_oid,
        body=body,
        status=MailStatus.PENDING,
        dedupe_key=None,
    )
    chat_id = await send_teams_message(msg)
    msg.chat_id = chat_id
    msg.status = MailStatus.SENT
    msg.sent_at = now_kst()
    db.add(msg)
    await db.commit()
    return chat_id
