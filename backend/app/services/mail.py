from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Optional

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.time import now_kst
from app.models import MailMessage, MailStatus, MailTemplate, MailType

settings = get_settings()

_pending_after_commit: list[int] = []

WEB_ROOT = Path(__file__).resolve().parents[2].parent / "web"

MAIL_HTML_FILES: dict[MailType, str] = {
    MailType.EMAIL_VERIFY: "01-이메일인증.html",
    MailType.RESERVE_DONE_NORMAL: "02-예약완료-일반.html",
    MailType.RESERVE_DONE_REAPPLY: "03-예약완료-재신청.html",
    MailType.DROP_REAPPLY_NOTICE: "04-탈락-재신청안내.html",
}

DEFAULT_SUBJECTS: dict[MailType, str] = {
    MailType.EMAIL_VERIFY: "[헬스키퍼] 이메일 인증코드 안내",
    MailType.RESERVE_DONE_NORMAL: "[헬스키퍼] 예약이 확정되었습니다",
    MailType.RESERVE_DONE_REAPPLY: "[헬스키퍼] 재신청 예약이 확정되었습니다",
    MailType.DROP_REAPPLY_NOTICE: "[헬스키퍼] 탈락 안내 및 재신청 가능 슬롯 안내",
}

# 관리자 화면 편집용 plain text (실제 발송 본문은 web/이메일/*.html 디자인 템플릿)
PLAIN_BODY_DEFAULTS: dict[MailType, str] = {
    MailType.EMAIL_VERIFY: (
        "안녕하세요 {이름}님,\n\n아래 링크를 클릭해 이메일 인증을 완료해 주세요.\n{인증링크}\n\n24시간 내에 인증해 주세요."
    ),
    MailType.RESERVE_DONE_NORMAL: (
        "안녕하세요, {이름}님.\n"
        "신청하신 안마서비스 예약이 관리자 확정으로 완료되었습니다.\n\n"
        "날짜: {날짜}\n시간: {시간}\n\n"
        "· 일반 신청 취소는 마감(수요일 17:00) 전까지 가능합니다."
    ),
    MailType.RESERVE_DONE_REAPPLY: (
        "안녕하세요, {이름}님.\n"
        "선착순 재신청이 즉시 확정되었습니다.\n\n"
        "날짜: {날짜}\n시간: {시간}\n\n"
        "· 재신청 건은 취소할 수 없습니다."
    ),
    MailType.DROP_REAPPLY_NOTICE: (
        "안녕하세요, {이름}님.\n"
        "신청하신 시간대는 우선권에 따라 탈락 처리되었습니다.\n\n"
        "비어있는 슬롯: {빈슬롯목록}\n"
        "재신청 시작: {재신청시작}\n"
        "재신청 마감: {재신청마감}\n\n"
        "· 재신청 건은 취소할 수 없습니다."
    ),
}

CONTEXT_ALIASES: dict[str, str] = {
    "name": "이름",
    "slotDate": "날짜",
    "slotTime": "시간",
    "emptySlots": "빈슬롯목록",
    "emptySlotsHtml": "빈슬롯목록Html",
    "reapplyOpenAt": "재신청시작",
    "reapplyDeadline": "재신청마감",
    "verifyUrl": "인증링크",
    "mypageUrl": "mypageUrl",
    "reapplyUrl": "reapplyUrl",
    "logoUrl": "logoUrl",
    "appBaseUrl": "appBaseUrl",
}


def queue_mail_after_commit(mail_id: int) -> None:
    _pending_after_commit.append(mail_id)


def drain_pending_mails() -> list[int]:
    global _pending_after_commit
    ids = _pending_after_commit[:]
    _pending_after_commit = []
    return ids


def _weekday_ko(d: date) -> str:
    return ["월", "화", "수", "목", "금", "토", "일"][d.weekday()]


def format_slot_date_kr(value: object) -> str:
    if isinstance(value, date):
        d = value
    elif isinstance(value, str) and value:
        d = date.fromisoformat(value[:10])
    else:
        return str(value or "")
    return f"{d.month}월 {d.day}일 ({_weekday_ko(d)})"


def expand_mail_context(context: dict) -> dict:
    base_url = settings.app_base_url.rstrip("/")
    out = dict(context)
    out.setdefault("appBaseUrl", base_url)
    out.setdefault("logoUrl", f"{base_url}/assets/logo-lockup.svg")
    out.setdefault("mypageUrl", f"{base_url}/api/mypage/enter")
    out.setdefault("reapplyUrl", f"{base_url}/api/reapply/enter")

    if out.get("slotDate"):
        out["slotDate"] = format_slot_date_kr(out["slotDate"])

    for en, ko in CONTEXT_ALIASES.items():
        if en in out and ko not in out:
            out[ko] = out[en]

    return out


def _is_html_template(text: str) -> bool:
    sample = text.lstrip()[:300].lower()
    return sample.startswith("<!doctype") or "<html" in sample


def load_design_html(mail_type: MailType) -> str:
    rel = MAIL_HTML_FILES.get(mail_type)
    if not rel:
        return ""
    path = WEB_ROOT / "이메일" / rel
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8")


def editor_body_template(stored_body: str, mail_type: MailType) -> str:
    """관리자 편집 화면용 — 항상 기본 plain text 요약."""
    return PLAIN_BODY_DEFAULTS.get(mail_type, "")


async def get_template(db: AsyncSession, mail_type: MailType) -> Optional[MailTemplate]:
    result = await db.execute(select(MailTemplate).where(MailTemplate.type == mail_type))
    return result.scalar_one_or_none()


def render_template(subject_tpl: str, body_tpl: str, context: dict) -> tuple[str, str]:
    """치환 변수 {name}, {이름} 등 — CSS 중괄호는 그대로 둠."""
    expanded = expand_mail_context(context)

    def substitute(text: str) -> str:
        out = text
        for key, value in expanded.items():
            out = out.replace("{" + key + "}", str(value))
        return out

    return substitute(subject_tpl), substitute(body_tpl)


def absolutize_html_assets(html: str) -> str:
    """메일 클라이언트용 — 상대 /assets·앱 링크 경로를 절대 URL로."""
    base = settings.app_base_url.rstrip("/")
    reapply_enter_url = f"{base}/api/reapply/enter"
    mypage_enter_url = f"{base}/api/mypage/enter"
    html = html.replace('src="/assets/', f'src="{base}/assets/').replace(
        "src='/assets/", f"src='{base}/assets/"
    )
    html = html.replace('href="/reapply"', f'href="{reapply_enter_url}"').replace(
        "href='/reapply'", f"href='{reapply_enter_url}'"
    )
    html = html.replace('href="/mypage"', f'href="{mypage_enter_url}"').replace(
        "href='/mypage'", f"href='{mypage_enter_url}'"
    )
    return html


def resolve_template_parts(
    mail_type: MailType,
    template: Optional[MailTemplate],
) -> tuple[str, str]:
    subject_tpl = (template.subject_template if template else "") or DEFAULT_SUBJECTS.get(
        mail_type, mail_type.value
    )
    body_tpl = (template.body_template if template else "") or ""
    if not _is_html_template(body_tpl):
        design = load_design_html(mail_type)
        if design:
            body_tpl = design
    return subject_tpl, body_tpl


async def enqueue_mail(
    db: AsyncSession,
    *,
    mail_type: MailType,
    to_email: str,
    context: dict,
    dedupe_key: Optional[str] = None,
    to_member_id: Optional[int] = None,
    reservation_id: Optional[int] = None,
    cycle_id: Optional[int] = None,
) -> Optional[MailMessage]:
    if dedupe_key:
        existing = await db.execute(
            select(MailMessage).where(MailMessage.dedupe_key == dedupe_key)
        )
        if existing.scalar_one_or_none():
            return None

    template = await get_template(db, mail_type)
    subject_tpl, body_tpl = resolve_template_parts(mail_type, template)
    subject, body = render_template(subject_tpl, body_tpl, context)

    msg = MailMessage(
        type=mail_type,
        to_member_id=to_member_id,
        to_email=to_email,
        subject=subject,
        body=body,
        status=MailStatus.PENDING,
        dedupe_key=dedupe_key,
        reservation_id=reservation_id,
        cycle_id=cycle_id,
    )
    db.add(msg)
    await db.flush()
    return msg


async def send_smtp(msg: MailMessage) -> None:
    import aiosmtplib
    from email.message import EmailMessage
    from email.utils import formataddr, formatdate, make_msgid

    email = EmailMessage()
    from_name = settings.smtp_from_name.strip()
    email["From"] = (
        formataddr((from_name, settings.smtp_from)) if from_name else settings.smtp_from
    )
    email["To"] = msg.to_email
    email["Subject"] = msg.subject
    email["Date"] = formatdate(localtime=True)
    domain = settings.smtp_from.split("@")[-1] if "@" in settings.smtp_from else None
    email["Message-ID"] = make_msgid(domain=domain)

    if _is_html_template(msg.body):
        body = absolutize_html_assets(msg.body)
        email.set_content(body, subtype="html", charset="utf-8")
    else:
        email.set_content(msg.body)

    await aiosmtplib.send(
        email,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=settings.smtp_use_tls,
    )


async def process_one_mail(db: AsyncSession, mail_id: int) -> bool:
    result = await db.execute(
        select(MailMessage)
        .where(MailMessage.id == mail_id)
        .where(MailMessage.status.in_([MailStatus.PENDING, MailStatus.FAILED]))
        .with_for_update(skip_locked=True)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        return False

    msg.status = MailStatus.SENDING
    msg.last_tried_at = now_kst()
    await db.flush()

    try:
        await send_smtp(msg)
        msg.status = MailStatus.SENT
        msg.sent_at = now_kst()
        msg.last_error = None
    except Exception as exc:
        msg.status = MailStatus.FAILED
        msg.retry_count += 1
        msg.last_error = str(exc)[:2000]
        if msg.retry_count >= settings.mail_retry_max:
            msg.status = MailStatus.DEAD
    await db.commit()
    return msg.status == MailStatus.SENT


async def retry_failed_mails(db: AsyncSession) -> int:
    now = now_kst()
    result = await db.execute(
        select(MailMessage).where(MailMessage.status == MailStatus.FAILED)
    )
    count = 0
    for msg in result.scalars().all():
        if msg.retry_count >= settings.mail_retry_max:
            msg.status = MailStatus.DEAD
            continue
        backoff_idx = min(msg.retry_count, len(settings.mail_retry_backoff_seconds) - 1)
        backoff = settings.mail_retry_backoff_seconds[backoff_idx]
        if msg.last_tried_at and msg.last_tried_at + timedelta(seconds=backoff) > now:
            continue
        msg.status = MailStatus.PENDING
        count += 1
    await db.commit()
    return count
