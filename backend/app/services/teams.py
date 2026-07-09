from __future__ import annotations

import json
import logging
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Optional

import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.time import KST, now_kst, to_kst
from app.models import (
    MailStatus,
    Member,
    MemberStatus,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    Slot,
    TeamsMessage,
    TeamsMessageType,
    TransferRequest,
)
from app.services.sso import _microsoft_post

logger = logging.getLogger(__name__)

# 양도 알림은 재시도 시 Teams 채팅에 중복 메시지가 쌓일 수 있어 1회만 시도
_TRANSFER_NOTIFY_TYPES = frozenset({
    TeamsMessageType.TRANSFER_REQUEST_ADMIN,
    TeamsMessageType.TRANSFER_APPROVED,
})

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


def _datetime_label(dt: datetime) -> str:
    kst = to_kst(dt)
    dow = _WEEKDAY_KO[kst.weekday()]
    return f"{kst.month}/{kst.day}({dow}) {kst.strftime('%H:%M')}"


def render_reminder_body(*, name: str, slot: Slot, minutes_before: int) -> str:
    slot_text = _slot_label(slot)
    return (
        f"<p><strong>[헬스키퍼]</strong> 안마 예약 {minutes_before}분 전 알림</p>"
        f"<p>{name}님, <strong>{slot_text}</strong> 예약 시간이 곧 시작됩니다.</p>"
        f"<p>헬스키퍼 공간으로 이동해 주세요.</p>"
    )


def open_notice_site_url() -> str:
    return get_settings().teams_open_notice_url.strip()


def _open_close_labels(open_at: datetime, close_at: datetime) -> tuple[str, str]:
    """일반 신청 시작·마감 — 같은 날짜(수요일) + 각각 시각."""
    open_kst = to_kst(open_at)
    close_kst = to_kst(close_at)
    dow = _WEEKDAY_KO[open_kst.weekday()]
    day = f"{open_kst.month}/{open_kst.day}({dow})"
    return (
        f"{day} {open_kst.strftime('%H:%M')}",
        f"{day} {close_kst.strftime('%H:%M')}",
    )


def render_open_notice_body(
    *,
    name: str,
    open_at: datetime,
    close_at: datetime,
    week_start: date,
    week_end: date,
    site_url: str | None = None,
) -> str:
    week_label = f"{week_start.month}/{week_start.day}~{week_end.month}/{week_end.day}"
    open_label, close_label = _open_close_labels(open_at, close_at)
    url = (site_url or open_notice_site_url()).strip()
    return (
        f"<p><strong>[헬스키퍼]</strong> 차주 안마 예약 신청 안내</p>"
        f"<p>{name}님, {week_label} 주간 예약 신청이 {open_label}에 시작됩니다.</p>"
        f"<p>마감: {close_label}</p>"
        f'<p><a href="{url}">{url}</a></p>'
    )


def open_notice_dedupe_key(cycle_id: int, member_id: int, notice_date: date) -> str:
    """발송일(KST)별 중복 방지 — 조기 수동 발송과 정규 수 08:55 발송을 구분."""
    return f"teams-open-notice:{cycle_id}:{notice_date.isoformat()}:{member_id}"


def render_transfer_request_admin_body(
    *,
    donor_name: str,
    recipient_name: str,
    slot: Slot,
) -> str:
    slot_text = _slot_label(slot)
    return (
        f"<p><strong>[헬스키퍼]</strong> 예약 양도 신청</p>"
        f"<p><b>{donor_name}</b>님이 <b>{recipient_name}</b>님에게 "
        f"<strong>{slot_text}</strong> 예약 양도를 신청했습니다.</p>"
        f"<p>관리자 화면에서 승인해 주세요.</p>"
    )


def render_transfer_approved_body(
    *,
    name: str,
    role: str,
    other_name: str,
    slot: Slot,
) -> str:
    slot_text = _slot_label(slot)
    if role == "donor":
        detail = f"<b>{other_name}</b>님에게 양도가 완료되었습니다."
    else:
        detail = f"<b>{other_name}</b>님으로부터 예약을 양도받았습니다."
    return (
        f"<p><strong>[헬스키퍼]</strong> 예약 양도 완료</p>"
        f"<p>{name}님, <strong>{slot_text}</strong> 예약 양도가 승인되었습니다.</p>"
        f"<p>{detail}</p>"
    )


async def _lookup_members_by_emails(
    db: AsyncSession, emails: tuple[str, ...]
) -> list[Member]:
    if not emails:
        return []
    result = await db.execute(
        select(Member)
        .where(Member.email.in_(emails))
        .where(Member.entra_oid.isnot(None))
        .where(Member.status != MemberStatus.WITHDRAWN)
    )
    return list(result.scalars().all())


async def enqueue_transfer_request_admin_notices(
    db: AsyncSession,
    *,
    transfer: TransferRequest,
    donor: Member,
    recipient: Member,
    slot: Slot,
) -> list[int]:
    from app.services.transfer import TRANSFER_ADMIN_NOTIFY_EMAILS

    body = render_transfer_request_admin_body(
        donor_name=donor.name,
        recipient_name=recipient.name,
        slot=slot,
    )
    admins = await _lookup_members_by_emails(db, TRANSFER_ADMIN_NOTIFY_EMAILS)
    message_ids: list[int] = []
    for admin in admins:
        msg = await enqueue_teams_message(
            db,
            message_type=TeamsMessageType.TRANSFER_REQUEST_ADMIN,
            to_member_id=admin.id,
            to_entra_oid=admin.entra_oid,
            body=body,
            dedupe_key=f"transfer-request-admin:{transfer.id}:{admin.id}",
            reservation_id=transfer.reservation_id,
        )
        if msg:
            message_ids.append(msg.id)
    return message_ids


async def enqueue_transfer_approved_notices(
    db: AsyncSession,
    *,
    transfer: TransferRequest,
    donor: Member,
    recipient: Member,
    slot: Slot,
) -> list[int]:
    message_ids: list[int] = []
    if donor.entra_oid:
        body = render_transfer_approved_body(
            name=donor.name,
            role="donor",
            other_name=recipient.name,
            slot=slot,
        )
        msg = await enqueue_teams_message(
            db,
            message_type=TeamsMessageType.TRANSFER_APPROVED,
            to_member_id=donor.id,
            to_entra_oid=donor.entra_oid,
            body=body,
            dedupe_key=f"transfer-approved-donor:{transfer.id}",
            reservation_id=transfer.new_reservation_id,
        )
        if msg:
            message_ids.append(msg.id)
    if recipient.entra_oid:
        body = render_transfer_approved_body(
            name=recipient.name,
            role="recipient",
            other_name=donor.name,
            slot=slot,
        )
        msg = await enqueue_teams_message(
            db,
            message_type=TeamsMessageType.TRANSFER_APPROVED,
            to_member_id=recipient.id,
            to_entra_oid=recipient.entra_oid,
            body=body,
            dedupe_key=f"transfer-approved-recipient:{transfer.id}",
            reservation_id=transfer.new_reservation_id,
        )
        if msg:
            message_ids.append(msg.id)
    return message_ids


async def resolve_open_notice_cycle(
    db: AsyncSession, *, cycle_id: int | None = None
) -> ReservationCycle | None:
    if cycle_id is not None:
        return await db.get(ReservationCycle, cycle_id)

    now = now_kst()
    today = now.date()
    today_start = datetime.combine(today, time.min, tzinfo=KST)
    today_end = today_start + timedelta(days=1)

    # 1) 현재 일반 신청 기간(오픈~마감) — 수동 발송 시 '오늘' 사이클
    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.open_at <= now)
        .where(ReservationCycle.close_at >= now)
        .order_by(ReservationCycle.open_at.desc())
        .limit(1)
    )
    cycle = result.scalar_one_or_none()
    if cycle:
        return cycle

    # 2) 오늘(KST) 오픈한 사이클 — 08:55 놓친 당일 catch-up
    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.open_at >= today_start)
        .where(ReservationCycle.open_at < today_end)
        .order_by(ReservationCycle.open_at.asc())
        .limit(1)
    )
    cycle = result.scalar_one_or_none()
    if cycle:
        return cycle

    # 3) 다음 오픈 예정
    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.open_at >= now)
        .order_by(ReservationCycle.open_at.asc())
        .limit(1)
    )
    cycle = result.scalar_one_or_none()
    if cycle:
        return cycle

    result = await db.execute(
        select(ReservationCycle).order_by(ReservationCycle.open_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def resolve_scheduled_open_notice_cycle(db: AsyncSession) -> ReservationCycle | None:
    """수 08:55 잡 — 당일 09:00 전후 오픈 예정 사이클."""
    now = now_kst()
    window_start = now - timedelta(minutes=10)
    window_end = now + timedelta(minutes=15)
    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.open_at >= window_start)
        .where(ReservationCycle.open_at <= window_end)
        .order_by(ReservationCycle.open_at.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def load_open_notice_recipients(
    db: AsyncSession, *, limit: int | None = None
) -> list[Member]:
    query = (
        select(Member)
        .where(Member.entra_oid.isnot(None))
        .where(Member.status != MemberStatus.WITHDRAWN)
        .order_by(Member.id)
    )
    if limit is not None:
        query = query.limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def enqueue_open_notice_broadcast(
    db: AsyncSession,
    cycle: ReservationCycle,
    *,
    limit: int | None = None,
    notice_date: date | None = None,
) -> tuple[int, int]:
    """Returns (enqueued, skipped_dedupe).

    notice_date: 중복 방지 기준일. 스케줄러는 open_at 날짜(수요일), 수동 발송은 당일.
    """
    members = await load_open_notice_recipients(db, limit=limit)
    enqueued = 0
    skipped = 0
    site_url = open_notice_site_url()
    send_date = notice_date or now_kst().date()
    for member in members:
        body = render_open_notice_body(
            name=member.name,
            open_at=cycle.open_at,
            close_at=cycle.close_at,
            week_start=cycle.target_week_start,
            week_end=cycle.target_week_end,
            site_url=site_url,
        )
        msg = await enqueue_teams_message(
            db,
            message_type=TeamsMessageType.RESERVE_OPEN_NOTICE,
            to_member_id=member.id,
            to_entra_oid=member.entra_oid,
            body=body,
            dedupe_key=open_notice_dedupe_key(cycle.id, member.id, send_date),
        )
        if msg:
            enqueued += 1
        else:
            skipped += 1
    if enqueued:
        await db.commit()
    return enqueued, skipped


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
    if msg.status == MailStatus.SENT:
        return True

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
        if msg.type in _TRANSFER_NOTIFY_TYPES:
            msg.status = MailStatus.DEAD
        elif msg.retry_count >= settings.teams_reminder_retry_max:
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
        if msg.type in _TRANSFER_NOTIFY_TYPES:
            continue
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


async def deliver_teams_messages(message_ids: list[int]) -> None:
    """API 응답 후 백그라운드 발송 — 대기 없이 Teams 전달."""
    if not message_ids:
        return
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        for message_id in message_ids:
            await process_one_teams_message(db, message_id)


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
