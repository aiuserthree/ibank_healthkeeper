from __future__ import annotations

import html
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
    Notice,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    Slot,
    SwapProposal,
    TeamsMessage,
    TeamsMessageType,
    TransferRequest,
)
from app.services.notice import display_title
from app.services.sso import _microsoft_post
from app.services.stretch_tips import stretch_tip_for

logger = logging.getLogger(__name__)

# 양도·교환 알림은 재시도 시 Teams 채팅에 중복 메시지가 쌓일 수 있어 1회만 시도
_TRANSFER_NOTIFY_TYPES = frozenset({
    TeamsMessageType.TRANSFER_REQUEST_ADMIN,
    TeamsMessageType.TRANSFER_APPROVED,
    TeamsMessageType.SWAP_PROPOSED,
    TeamsMessageType.SWAP_REJECTED,
    TeamsMessageType.SWAP_ACCEPTED,
    TeamsMessageType.SWAP_ACCEPT_FAILED,
    TeamsMessageType.SWAP_CANCELLED,
    TeamsMessageType.RESERVATION_RETURNED,
    TeamsMessageType.MATCH_CHALLENGED,
    TeamsMessageType.MATCH_ACCEPTED,
    TeamsMessageType.MATCH_DECLINED,
    TeamsMessageType.MATCH_CANCELLED,
    TeamsMessageType.ESCAPE_INVITED,
    TeamsMessageType.ESCAPE_ACCEPTED,
    TeamsMessageType.ESCAPE_DECLINED,
    TeamsMessageType.ESCAPE_CANCELLED,
    TeamsMessageType.ESCAPE_CALL,
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


def mypage_enter_url() -> str:
    """FO 마이페이지 진입 URL (미로그인 시 로그인 → /mypage)."""
    return f"{get_settings().app_base_url.rstrip('/')}/api/mypage/enter"


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


# 아케이드 참여 도장 안내 — 이 날짜의 예약 오픈 안내에 한 번만 덧붙인다
OPEN_NOTICE_ARCADE_DATE = date(2026, 11, 4)


def _open_notice_arcade_html() -> str:
    arcade_url = f"{get_settings().app_base_url.rstrip('/')}/arcade"
    return (
        f"<p>&nbsp;</p>"
        f"<p><strong>🎮 아케이드 참여 도장</strong><br>"
        f"어떤 게임이든 한 판을 마치면 그날 <b>도장 1개</b>가 찍혀요. (여러 판 해도 <b>하루 1개</b>)<br>"
        f"<b>10개</b>를 모을 때마다 <b>무적 쿠폰 1장</b>을 드려요. (한 달 1장 · 받은 날부터 30일 동안 사용)<br>"
        f'<a href="{arcade_url}">{arcade_url}</a></p>'
    )


# 함께하기(대전 · 협동) · 부서 대항 레이드 오픈 안내 — 이 날짜의 예약 오픈 안내에 한 번만 덧붙인다
OPEN_NOTICE_TOGETHER_DATE = date(2026, 11, 11)


def _open_notice_together_html() -> str:
    base = get_settings().app_base_url.rstrip("/")
    together_url, raid_url = f"{base}/together", f"{base}/raid"
    return (
        f"<p>&nbsp;</p>"
        f"<p><strong>🤝 동료와 함께하는 게임 · 부서 대항 레이드 오픈</strong><br>"
        f"<b>함께하기</b> — 동료에게 도전장을 보내 1:1 대전(헤딩 축구 · 옥상 배구 · 오목 · 체스 · 고스톱 · 숫자 야구 등)을 하거나, "
        f"둘이서 협동 게임(야근 사무실 탈출 · 점심 분식집 · 화이트보드 그림 퀴즈 등)을 할 수 있어요.<br>"
        f'<a href="{together_url}">{together_url}</a><br>'
        f"<b>부서 대항 레이드</b> — 아케이드에서 게임을 하면 우리 부서 보스에게 피해가 들어가요. "
        f"매주 월요일 새 보스가 나오고, 부서원 절반 이상이 함께해야 쓰러뜨릴 수 있어요. "
        f"다른 부서 직원과 대전 · 협동하면 두 부서 모두 피해가 더 커요.<br>"
        f'<a href="{raid_url}">{raid_url}</a><br>'
        f"게임은 업무 시간(평일 09:00~11:30 · 13:00~18:00)에는 쉬고, 점심시간 · 퇴근 후 · 주말에 열려요.</p>"
    )


# 매니지먼트(매일 키우는 게임) 오픈 안내 — 함께하기 안내와 같은 날(11/11) 예약 오픈 안내에 한 번만 덧붙인다
OPEN_NOTICE_MANAGE_DATE = date(2026, 11, 11)


def _open_notice_manage_html() -> str:
    manage_url = f"{get_settings().app_base_url.rstrip('/')}/manage"
    return (
        f"<p>&nbsp;</p>"
        f"<p><strong>🏙️ 매일 조금씩 키우는 「매니지먼트」 게임 오픈</strong><br>"
        f"<b>오피스 타운</b>(회사 동네 꾸미기) · <b>옥상 쉼터 카페</b> · <b>옥상 텃밭</b> — "
        f"처음부터 다시 하지 않는 한 내 판이 그대로 저장돼요.<br>"
        f"출근 전에 건설 · 씨앗을 걸어 두면 업무 시간에도 계속 진행되고(최대 8시간), 점심 · 퇴근 후에 들러 거두면 돼요.<br>"
        f'<a href="{manage_url}">{manage_url}</a></p>'
    )


def render_open_notice_body(
    *,
    name: str,
    open_at: datetime,
    close_at: datetime,
    week_start: date,
    week_end: date,
    site_url: str | None = None,
    notice_date: date | None = None,
    notice: Notice | None = None,
    health: Notice | None = None,
) -> str:
    import html

    week_label = f"{week_start.month}/{week_start.day}~{week_end.month}/{week_end.day}"
    open_label, close_label = _open_close_labels(open_at, close_at)
    url = (site_url or open_notice_site_url()).strip()
    tip_title, tip_body = stretch_tip_for(notice_date or now_kst().date())
    arcade_html = _open_notice_arcade_html() if notice_date == OPEN_NOTICE_ARCADE_DATE else ""
    if notice_date == OPEN_NOTICE_TOGETHER_DATE:
        arcade_html = _open_notice_together_html()
    if notice_date == OPEN_NOTICE_MANAGE_DATE:
        arcade_html += _open_notice_manage_html()
    notice_html = ""
    if notice is not None:
        notice_url = notice_page_url(notice.id)
        notice_html = (
            f"<p>&nbsp;</p>"
            f"<p><strong>📢 새 공지 · {html.escape(display_title(notice))}</strong><br>"
            f"{_notice_intro_html(notice.body)}<br>"
            f'<a href="{notice_url}">{notice_url}</a></p>'
        )
    health_html = ""
    if health is not None:
        health_url = health_page_url(health.id)
        health_html = (
            f"<p>&nbsp;</p>"
            f"<p><strong>💡 이번 주 건강 정보 · {html.escape(health.title)}</strong><br>"
            f'<a href="{health_url}">{health_url}</a></p>'
        )
    return (
        f"<p><strong>[헬스키퍼]</strong> 차주 안마 예약 신청 안내</p>"
        f"<p>{name}님, {week_label} 주간 예약 신청이 {open_label}에 시작됩니다.</p>"
        f"<p>마감: {close_label}</p>"
        f'<p><a href="{url}">{url}</a></p>'
        f"{arcade_html}"
        f"{notice_html}"
        f"{health_html}"
        f"<p>&nbsp;</p>"
        f"<p><strong>오늘의 1분 스트레칭 · {tip_title}</strong><br>{tip_body}</p>"
    )


OPEN_NOTICE_RECENT_NOTICE_DAYS = 7


async def recent_pinned_notice(db: AsyncSession, send_date: date) -> Notice | None:
    """오픈 안내에 한 번 덧붙일 공지 — 발송일 기준 7일 안에 올라온 고정 공지 (가장 최근 것)."""
    since = datetime.combine(send_date - timedelta(days=OPEN_NOTICE_RECENT_NOTICE_DAYS), time.min, tzinfo=KST)
    result = await db.execute(
        select(Notice)
        .where(Notice.published.is_(True))
        .where(Notice.category == "NOTICE")
        .where(Notice.pinned.is_(True))
        .where(Notice.published_at >= since)
        .where(Notice.published_at <= now_kst())
        .order_by(Notice.published_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def reapply_page_url() -> str:
    return f"{get_settings().app_base_url.rstrip('/')}/reapply"


def render_reapply_notice_body(
    *,
    name: str,
    open_at: datetime,
    close_at: datetime,
    empty_slot_labels: list[str],
) -> str:
    """목 08:55 — 빈 슬롯이 있는 주의 탈락자에게 재신청 오픈 직전 안내."""
    import html

    open_kst = to_kst(open_at)
    close_kst = to_kst(close_at)
    url = reapply_page_url()
    slots = ", ".join(html.escape(label) for label in empty_slot_labels)
    return (
        f"<p><strong>[헬스키퍼]</strong> 재신청 안내</p>"
        f"<p>{html.escape(name)}님, 오늘 {open_kst.strftime('%H:%M')}부터 {close_kst.strftime('%H:%M')}까지 "
        f"빈 슬롯에 <strong>선착순</strong>으로 재신청할 수 있어요.</p>"
        f"<p>빈 슬롯: {slots}</p>"
        f'<p><a href="{url}">{url}</a></p>'
    )


def reapply_notice_dedupe_key(cycle_id: int, member_id: int) -> str:
    return f"teams-reapply-notice:{cycle_id}:{member_id}"


async def enqueue_reapply_notice(db: AsyncSession, cycle: ReservationCycle) -> tuple[int, int]:
    """빈 슬롯이 있으면 재신청 대상 탈락자(Teams 로그인 회원)에게 1:1 안내. Returns (enqueued, skipped)."""
    from app.services.admin import _reapply_drop_member_ids, _slot_chip_label
    from app.services.reservation import get_empty_slots

    empty = await get_empty_slots(db, cycle.id)
    if not empty:
        return 0, 0
    labels = [_slot_chip_label(s.slot_date, s.start_time) for s in empty]
    enqueued = skipped = 0
    for member_id in sorted(await _reapply_drop_member_ids(db, cycle.id)):
        member = await db.get(Member, member_id)
        if not member or not member.entra_oid or member.status == MemberStatus.WITHDRAWN:
            continue
        msg = await enqueue_teams_message(
            db,
            message_type=TeamsMessageType.REAPPLY_NOTICE,
            to_member_id=member.id,
            to_entra_oid=member.entra_oid,
            body=render_reapply_notice_body(
                name=member.name,
                open_at=cycle.reapply_open_at,
                close_at=cycle.reapply_close_at,
                empty_slot_labels=labels,
            ),
            dedupe_key=reapply_notice_dedupe_key(cycle.id, member.id),
        )
        if msg:
            enqueued += 1
        else:
            skipped += 1
    if enqueued:
        await db.commit()
    return enqueued, skipped


async def recent_health_notice(db: AsyncSession, send_date: date) -> Notice | None:
    """오픈 안내에 붙일 이번 주 건강 정보 — 발송일 기준 7일 안에 공개된 글 (가장 최근 것)."""
    since = datetime.combine(send_date - timedelta(days=OPEN_NOTICE_RECENT_NOTICE_DAYS), time.min, tzinfo=KST)
    result = await db.execute(
        select(Notice)
        .where(Notice.published.is_(True))
        .where(Notice.category == "HEALTH")
        .where(Notice.published_at >= since)
        .where(Notice.published_at <= now_kst())
        .order_by(Notice.published_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def health_page_url(notice_id: int) -> str:
    return f"{get_settings().app_base_url.rstrip('/')}/health?id={notice_id}"


def notice_page_url(notice_id: int) -> str:
    return f"{get_settings().app_base_url.rstrip('/')}/notice?id={notice_id}"


def _notice_intro_html(body: str) -> str:
    """공지 본문의 첫 문단 → Teams 메시지용 HTML (**굵게** 만 반영)."""
    import html
    import re

    first = ""
    for block in (body or "").strip().split("\n\n"):
        block = block.strip()
        if block and not block.startswith(("## ", "- ", ":::", "|", "> ", "[[")):
            first = " ".join(line.strip() for line in block.split("\n"))
            break
    escaped = html.escape(first)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)


def render_service_notice_body(*, name: str, title: str, body: str, url: str) -> str:
    import html

    return (
        f"<p><strong>[헬스키퍼]</strong> 새 공지 — {html.escape(title)}</p>"
        f"<p>{html.escape(name)}님, {_notice_intro_html(body)}</p>"
        f'<p>자세한 내용은 공지사항에서 확인해 주세요.<br><a href="{url}">{url}</a></p>'
    )


def service_notice_dedupe_key(notice_id: int, member_id: int) -> str:
    return f"service-notice:{notice_id}:{member_id}"


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


def render_reservation_returned_admin_body(
    *,
    member_name: str,
    slot: Slot,
    cycle,
    now: datetime,
) -> str:
    """회원 본인 반납으로 빈자리가 남았을 때 관리자 안내. 빈자리가 어떻게 채워지는지 시점별로 알려 준다.

    재신청으로 채울 수 없는 시간대(휴가·공휴일 · 월 15:30 지정 확정)는 「탈락자가 가져갈 수 있어요」가
    사실이 아니므로 그 시간대에 맞는 안내로 바꾼다.
    """
    import html

    from app.services.designated_slot import is_designated_confirm_slot
    from app.services.korean_holidays import is_public_holiday

    slot_text = _slot_label(slot)
    now = to_kst(now)
    reapply_open = to_kst(cycle.reapply_open_at)
    reapply_close = to_kst(cycle.reapply_close_at)
    if slot.is_vacation or is_public_holiday(slot.slot_date):
        how = "휴가·공휴일 시간대라 재신청·관리자 지정으로 채울 수 없어요."
    elif is_designated_confirm_slot(slot):
        how = "월 15:30 지정 확정 시간대라 관리자 화면에서 지정해 주세요."
    elif not cycle.reapply_skipped and now < reapply_open:
        how = (
            f"{_datetime_label(reapply_open)} 재신청이 열리면 탈락자가 가져갈 수 있어요. "
            "그 전에 관리자 화면에서 바로 지정할 수도 있어요."
        )
    elif not cycle.reapply_skipped and now < reapply_close:
        how = "지금 재신청 중이라 탈락자가 가져갈 수 있어요. 관리자 화면에서 바로 지정할 수도 있어요."
    else:
        how = "관리자 화면 예약 관리에서 다른 직원을 지정해 주세요."
    return (
        f"<p><strong>[헬스키퍼]</strong> 예약 반납</p>"
        f"<p><b>{html.escape(member_name)}</b>님이 <strong>{slot_text}</strong> 예약을 반납했어요.</p>"
        f"<p>{how}</p>"
    )


async def enqueue_reservation_returned_admin_notices(
    db: AsyncSession,
    *,
    reservation,
    member: Member,
    slot: Slot,
    cycle,
    now: datetime,
    promotion=None,
) -> list[int]:
    """반납 관리자 알림 — 같은 시간대 탈락자에게 자동 확정됐으면 보내지 않는다.

    빈자리로 남았을 때만(받을 분 없음 · 수동 모드 · 지정/휴가/공휴일 시간대 등)
    RETURN_ADMIN_NOTIFY_EMAILS(조준형)에게만 보낸다.
    """
    from app.services.reservation_return import RETURN_ADMIN_NOTIFY_EMAILS

    if promotion is not None and promotion.promoted:
        return []
    body = render_reservation_returned_admin_body(
        member_name=member.name, slot=slot, cycle=cycle, now=now
    )
    admins = await _lookup_members_by_emails(db, RETURN_ADMIN_NOTIFY_EMAILS)
    message_ids: list[int] = []
    for admin in admins:
        msg = await enqueue_teams_message(
            db,
            message_type=TeamsMessageType.RESERVATION_RETURNED,
            to_member_id=admin.id,
            to_entra_oid=admin.entra_oid,
            body=body,
            dedupe_key=f"reservation-returned-admin:{reservation.id}:{admin.id}",
            reservation_id=reservation.id,
        )
        if msg:
            message_ids.append(msg.id)
    return message_ids


def render_transfer_completed_body(
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
        f"<p>{name}님, <strong>{slot_text}</strong> 예약 양도가 완료되었습니다.</p>"
        f"<p>{detail}</p>"
    )


# 하위 호환 별칭
render_transfer_approved_body = render_transfer_completed_body


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


async def enqueue_transfer_completed_notices(
    db: AsyncSession,
    *,
    transfer: TransferRequest,
    donor: Member,
    recipient: Member,
    slot: Slot,
) -> list[int]:
    message_ids: list[int] = []
    if donor.entra_oid:
        body = render_transfer_completed_body(
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
            dedupe_key=f"transfer-completed-donor:{transfer.id}",
            reservation_id=transfer.new_reservation_id,
        )
        if msg:
            message_ids.append(msg.id)
    if recipient.entra_oid:
        body = render_transfer_completed_body(
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
            dedupe_key=f"transfer-completed-recipient:{transfer.id}",
            reservation_id=transfer.new_reservation_id,
        )
        if msg:
            message_ids.append(msg.id)
    return message_ids


# 하위 호환 별칭
enqueue_transfer_approved_notices = enqueue_transfer_completed_notices


def render_swap_proposed_body(
    *,
    target_name: str,
    proposer_name: str,
    target_slot: Slot,
    proposer_slot: Slot,
    mypage_url: str | None = None,
) -> str:
    url = (mypage_url or mypage_enter_url()).strip()
    return (
        f"<p><strong>[헬스키퍼]</strong> 예약 교환 제안</p>"
        f"<p>{target_name}님, <b>{proposer_name}</b>님이 슬롯 교환을 제안했습니다.</p>"
        f"<p>내 예약: <strong>{_slot_label(target_slot)}</strong></p>"
        f"<p>상대 예약: <strong>{_slot_label(proposer_slot)}</strong></p>"
        f'<p><a href="{url}">마이페이지</a>에서 수락 또는 거절해 주세요.</p>'
    )


def render_swap_rejected_body(
    *,
    proposer_name: str,
    target_name: str,
    proposer_slot: Slot,
    target_slot: Slot,
) -> str:
    return (
        f"<p><strong>[헬스키퍼]</strong> 교환 제안 거절</p>"
        f"<p>{proposer_name}님, <b>{target_name}</b>님이 교환 제안을 거절했습니다.</p>"
        f"<p>내 예약: <strong>{_slot_label(proposer_slot)}</strong> / "
        f"상대: <strong>{_slot_label(target_slot)}</strong></p>"
        f"<p>예약은 그대로 유지됩니다.</p>"
    )


def render_swap_accepted_body(
    *,
    name: str,
    other_name: str,
    new_slot: Slot,
) -> str:
    return (
        f"<p><strong>[헬스키퍼]</strong> 예약 교환 완료</p>"
        f"<p>{name}님, <b>{other_name}</b>님과 예약 교환이 완료되었습니다.</p>"
        f"<p>변경 후 예약: <strong>{_slot_label(new_slot)}</strong></p>"
    )


def render_swap_accept_failed_body(
    *,
    proposer_name: str,
    target_name: str,
    proposer_slot: Slot,
    fail_reason_ko: str,
) -> str:
    return (
        f"<p><strong>[헬스키퍼]</strong> 교환 진행 실패</p>"
        f"<p>{proposer_name}님, <b>{target_name}</b>님과의 교환을 진행할 수 없어 "
        f"제안이 종료되었습니다.</p>"
        f"<p>사유: {fail_reason_ko}</p>"
        f"<p>내 예약: <strong>{_slot_label(proposer_slot)}</strong> (변동 없음)</p>"
    )


def render_swap_cancelled_body(
    *,
    target_name: str,
    proposer_name: str,
    target_slot: Slot,
) -> str:
    return (
        f"<p><strong>[헬스키퍼]</strong> 교환 제안 취소</p>"
        f"<p>{target_name}님, <b>{proposer_name}</b>님의 교환 제안이 취소됐어요.</p>"
        f"<p>내 예약: <strong>{_slot_label(target_slot)}</strong> (변동 없음)</p>"
    )


async def enqueue_swap_proposed_notice(
    db: AsyncSession,
    *,
    swap: SwapProposal,
    proposer: Member,
    target: Member,
    proposer_slot: Slot,
    target_slot: Slot,
) -> list[int]:
    if not target.entra_oid:
        return []
    body = render_swap_proposed_body(
        target_name=target.name,
        proposer_name=proposer.name,
        target_slot=target_slot,
        proposer_slot=proposer_slot,
    )
    msg = await enqueue_teams_message(
        db,
        message_type=TeamsMessageType.SWAP_PROPOSED,
        to_member_id=target.id,
        to_entra_oid=target.entra_oid,
        body=body,
        dedupe_key=f"swap-proposed:{swap.id}",
        reservation_id=swap.target_reservation_id,
    )
    return [msg.id] if msg else []


async def enqueue_swap_rejected_notice(
    db: AsyncSession,
    *,
    swap: SwapProposal,
    proposer: Member,
    target: Member,
    proposer_slot: Slot,
    target_slot: Slot,
) -> list[int]:
    if not proposer.entra_oid:
        return []
    body = render_swap_rejected_body(
        proposer_name=proposer.name,
        target_name=target.name,
        proposer_slot=proposer_slot,
        target_slot=target_slot,
    )
    msg = await enqueue_teams_message(
        db,
        message_type=TeamsMessageType.SWAP_REJECTED,
        to_member_id=proposer.id,
        to_entra_oid=proposer.entra_oid,
        body=body,
        dedupe_key=f"swap-rejected:{swap.id}",
        reservation_id=swap.proposer_reservation_id,
    )
    return [msg.id] if msg else []


async def enqueue_swap_accepted_notices(
    db: AsyncSession,
    *,
    swap: SwapProposal,
    proposer: Member,
    target: Member,
    new_proposer_slot: Slot,
    new_target_slot: Slot,
) -> list[int]:
    message_ids: list[int] = []
    if proposer.entra_oid:
        body = render_swap_accepted_body(
            name=proposer.name,
            other_name=target.name,
            new_slot=new_proposer_slot,
        )
        msg = await enqueue_teams_message(
            db,
            message_type=TeamsMessageType.SWAP_ACCEPTED,
            to_member_id=proposer.id,
            to_entra_oid=proposer.entra_oid,
            body=body,
            dedupe_key=f"swap-accepted-proposer:{swap.id}",
            reservation_id=swap.proposer_reservation_id,
        )
        if msg:
            message_ids.append(msg.id)
    if target.entra_oid:
        body = render_swap_accepted_body(
            name=target.name,
            other_name=proposer.name,
            new_slot=new_target_slot,
        )
        msg = await enqueue_teams_message(
            db,
            message_type=TeamsMessageType.SWAP_ACCEPTED,
            to_member_id=target.id,
            to_entra_oid=target.entra_oid,
            body=body,
            dedupe_key=f"swap-accepted-target:{swap.id}",
            reservation_id=swap.target_reservation_id,
        )
        if msg:
            message_ids.append(msg.id)
    return message_ids


async def enqueue_swap_accept_failed_notice(
    db: AsyncSession,
    *,
    swap: SwapProposal,
    proposer: Member,
    target: Member,
    proposer_slot: Slot,
    fail_reason: str,
) -> list[int]:
    from app.services.swap import FAIL_REASON_KO

    if not proposer.entra_oid:
        return []
    body = render_swap_accept_failed_body(
        proposer_name=proposer.name,
        target_name=target.name,
        proposer_slot=proposer_slot,
        fail_reason_ko=FAIL_REASON_KO.get(fail_reason, "교환할 수 없는 상태입니다."),
    )
    msg = await enqueue_teams_message(
        db,
        message_type=TeamsMessageType.SWAP_ACCEPT_FAILED,
        to_member_id=proposer.id,
        to_entra_oid=proposer.entra_oid,
        body=body,
        dedupe_key=f"swap-accept-failed:{swap.id}",
        reservation_id=swap.proposer_reservation_id,
    )
    return [msg.id] if msg else []


async def enqueue_swap_cancelled_notice(
    db: AsyncSession,
    *,
    swap: SwapProposal,
    proposer: Member,
    target: Member,
    target_slot: Slot,
) -> list[int]:
    if not target.entra_oid:
        return []
    body = render_swap_cancelled_body(
        target_name=target.name,
        proposer_name=proposer.name,
        target_slot=target_slot,
    )
    msg = await enqueue_teams_message(
        db,
        message_type=TeamsMessageType.SWAP_CANCELLED,
        to_member_id=target.id,
        to_entra_oid=target.entra_oid,
        body=body,
        dedupe_key=f"swap-cancelled:{swap.id}",
        reservation_id=swap.target_reservation_id,
    )
    return [msg.id] if msg else []


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
    notice = await recent_pinned_notice(db, send_date)
    # 건강 정보 소개는 팀즈 오픈 안내에 붙이지 않는다(2026-11-09 요청) — 건강 정보 게시판에서만 본다
    for member in members:
        body = render_open_notice_body(
            name=member.name,
            open_at=cycle.open_at,
            close_at=cycle.close_at,
            week_start=cycle.target_week_start,
            week_end=cycle.target_week_end,
            site_url=site_url,
            notice_date=send_date,
            notice=notice,
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


# ── 대전 게임(오목 · 체스) ─────────────────────────────────────────

MATCH_GAME_NAME = {"gomoku": "오목", "chess": "체스", "baseball": "숫자 야구", "boxes": "칸 따먹기", "quizduel": "1:1 퀴즈", "gostop": "고스톱", "memory": "도형 짝맞추기", "soccer": "헤딩 축구", "volley": "배구"}


def match_page_url(game: str, match_id: Optional[int] = None) -> str:
    """대전 화면 — 미로그인이면 로그인 뒤 같은 판으로 돌아온다."""
    url = f"{get_settings().app_base_url.rstrip('/')}/games/{game}"
    return f"{url}#m{match_id}" if match_id else url


def _who(member: Member) -> str:
    dept = (member.department or "").strip()
    name = f"<b>{html.escape(member.name)}</b>님"
    return f"{html.escape(dept)} {name}" if dept else name


def render_match_challenged_body(*, game: str, match_id: int, target: Member, challenger: Member, deadline_at: Optional[datetime]) -> str:
    name = MATCH_GAME_NAME.get(game, "대전")
    url = match_page_url(game, match_id)
    due = f"{_datetime_label(deadline_at)}까지 수락하지 않으면 신청이 사라져요. " if deadline_at else ""
    return (
        f"<p><strong>[헬스키퍼]</strong> {name} 대전 신청</p>"
        f"<p>{html.escape(target.name)}님, {_who(challenger)}이 {name} 대전을 신청했어요.</p>"
        f"<p>{due}수락은 아케이드가 열린 시간에만 할 수 있어요.</p>"
        f'<p><a href="{url}">대전 화면 열기</a>에서 수락하거나 거절해 주세요.</p>'
    )


def render_match_accepted_body(*, game: str, match_id: int, challenger: Member, opponent: Member, first: Member) -> str:
    name = MATCH_GAME_NAME.get(game, "대전")
    url = match_page_url(game, match_id)
    turn = "내 차례예요" if first.id == challenger.id else f"{html.escape(first.name)}님 차례예요"
    return (
        f"<p><strong>[헬스키퍼]</strong> {name} 대전 수락</p>"
        f"<p>{html.escape(challenger.name)}님, {_who(opponent)}이 {name} 대전 신청을 수락했어요.</p>"
        f"<p>{_match_first_line(game, turn)}</p>"
        f'<p><a href="{url}">대전 화면 열기</a></p>'
    )


def _match_first_line(game: str, turn: str) -> str:
    """수락 알림의 「누가 먼저」 한 줄 — 게임마다 말이 다르다(둘이 따로 하는 게임은 차례가 없다)."""
    if game == "quizduel":
        return "이제 24시간 안에 각자 10문제를 풀어요."
    if game in ("soccer", "volley"):
        return "둘 다 대전 화면에 들어오면 바로 경기가 시작돼요."
    if game == "baseball":
        return f"숫자를 정한 뒤 첫 공격은 {turn}."
    first = {"chess": "첫 수(백)는", "gomoku": "첫 수(흑)는", "boxes": "첫 선은", "gostop": "첫 패는", "memory": "첫 카드는"}
    return f"{first.get(game, '첫 차례는')} {turn}."


def render_match_declined_body(*, game: str, challenger: Member, opponent: Member) -> str:
    name = MATCH_GAME_NAME.get(game, "대전")
    url = match_page_url(game)
    return (
        f"<p><strong>[헬스키퍼]</strong> {name} 대전 거절</p>"
        f"<p>{html.escape(challenger.name)}님, {_who(opponent)}이 {name} 대전 신청을 거절했어요.</p>"
        f'<p><a href="{url}">{name} 화면 열기</a>에서 다른 사람에게 도전할 수 있어요.</p>'
    )


def render_match_cancelled_body(*, game: str, opponent: Member, challenger: Member) -> str:
    name = MATCH_GAME_NAME.get(game, "대전")
    return (
        f"<p><strong>[헬스키퍼]</strong> {name} 대전 신청 취소</p>"
        f"<p>{html.escape(opponent.name)}님, {_who(challenger)}이 {name} 대전 신청을 취소했어요.</p>"
    )


async def _enqueue_match_notice(db: AsyncSession, *, kind: TeamsMessageType, to: Member, body: str, key: str) -> list[int]:
    if not to.entra_oid:
        return []
    msg = await enqueue_teams_message(
        db, message_type=kind, to_member_id=to.id, to_entra_oid=to.entra_oid, body=body, dedupe_key=key,
    )
    return [msg.id] if msg else []


async def enqueue_match_challenged_notice(db: AsyncSession, *, game: str, match_id: int, challenger: Member, target: Member, deadline_at: Optional[datetime]) -> list[int]:
    body = render_match_challenged_body(game=game, match_id=match_id, target=target, challenger=challenger, deadline_at=deadline_at)
    return await _enqueue_match_notice(db, kind=TeamsMessageType.MATCH_CHALLENGED, to=target, body=body, key=f"match-challenged:{match_id}")


async def enqueue_match_accepted_notice(db: AsyncSession, *, game: str, match_id: int, challenger: Member, opponent: Member, first: Member) -> list[int]:
    body = render_match_accepted_body(game=game, match_id=match_id, challenger=challenger, opponent=opponent, first=first)
    return await _enqueue_match_notice(db, kind=TeamsMessageType.MATCH_ACCEPTED, to=challenger, body=body, key=f"match-accepted:{match_id}")


async def enqueue_match_declined_notice(db: AsyncSession, *, game: str, match_id: int, challenger: Member, opponent: Member) -> list[int]:
    body = render_match_declined_body(game=game, challenger=challenger, opponent=opponent)
    return await _enqueue_match_notice(db, kind=TeamsMessageType.MATCH_DECLINED, to=challenger, body=body, key=f"match-declined:{match_id}")


async def enqueue_match_cancelled_notice(db: AsyncSession, *, game: str, match_id: int, challenger: Member, opponent: Member) -> list[int]:
    body = render_match_cancelled_body(game=game, opponent=opponent, challenger=challenger)
    return await _enqueue_match_notice(db, kind=TeamsMessageType.MATCH_CANCELLED, to=opponent, body=body, key=f"match-cancelled:{match_id}")



# ── 2인 협동 게임(방탈출 · 분식집) ───────────────────────────────
# room 은 협동 방 정보 — title · label(방탈출/협동 게임) · page(화면 주소) · blurb(한 줄 소개) · limit_sec

def escape_page_url(room_id: Optional[int] = None, page: str = "escape") -> str:
    url = f"{get_settings().app_base_url.rstrip('/')}/games/{page}"
    return f"{url}#r{room_id}" if room_id else url


def render_escape_invited_body(*, room, room_id: int, guest: Member, host: Member, deadline_at: Optional[datetime]) -> str:
    url = escape_page_url(room_id, room.page)
    due = f"{_datetime_label(deadline_at)}까지 수락하지 않으면 초대가 사라져요. " if deadline_at else ""
    return (
        f"<p><strong>[헬스키퍼]</strong> {html.escape(room.label)} 같이 해요</p>"
        f"<p>{html.escape(guest.name)}님, {_who(host)}이 {html.escape(room.label)} 「{html.escape(room.title)}」에 초대했어요. "
        f"{html.escape(room.blurb)}</p>"
        f"<p>{due}수락은 아케이드가 열린 시간에만 할 수 있어요.</p>"
        f'<p><a href="{url}">{html.escape(room.title)} 열기</a>에서 수락하거나 거절해 주세요.</p>'
    )


def render_escape_accepted_body(*, room, room_id: int, host: Member, guest: Member) -> str:
    url = escape_page_url(room_id, room.page)
    return (
        f"<p><strong>[헬스키퍼]</strong> {html.escape(room.label)} 초대 수락</p>"
        f"<p>{html.escape(host.name)}님, {_who(guest)}이 「{html.escape(room.title)}」 초대를 수락했어요.</p>"
        f"<p>둘 다 방에 들어와 「준비」를 누르면 {room.limit_sec // 60}분 타이머가 시작돼요.</p>"
        f'<p><a href="{url}">방에 들어가기</a></p>'
    )


def render_escape_declined_body(*, room, host: Member, guest: Member) -> str:
    url = escape_page_url(None, room.page)
    return (
        f"<p><strong>[헬스키퍼]</strong> {html.escape(room.label)} 초대 거절</p>"
        f"<p>{html.escape(host.name)}님, {_who(guest)}이 「{html.escape(room.title)}」 초대를 거절했어요.</p>"
        f'<p><a href="{url}">{html.escape(room.title)} 열기</a>에서 다른 동료를 초대할 수 있어요.</p>'
    )


def render_escape_cancelled_body(*, room, to: Member, by: Member) -> str:
    return (
        f"<p><strong>[헬스키퍼]</strong> {html.escape(room.label)} 취소</p>"
        f"<p>{html.escape(to.name)}님, {_who(by)}이 「{html.escape(room.title)}」 방을 취소했어요.</p>"
    )


def render_escape_call_body(*, room, room_id: int, to: Member, by: Member) -> str:
    url = escape_page_url(room_id, room.page)
    return (
        f"<p><strong>[헬스키퍼]</strong> {html.escape(room.label)} — 같이 들어와요</p>"
        f"<p>{html.escape(to.name)}님, {_who(by)}이 「{html.escape(room.title)}」 방에서 기다리고 있어요.</p>"
        f'<p><a href="{url}">지금 방에 들어가기</a></p>'
    )


async def enqueue_escape_notice(db: AsyncSession, *, kind: TeamsMessageType, to: Member, body: str, key: str) -> list[int]:
    if not to.entra_oid:
        return []
    msg = await enqueue_teams_message(
        db, message_type=kind, to_member_id=to.id, to_entra_oid=to.entra_oid, body=body, dedupe_key=key,
    )
    return [msg.id] if msg else []
