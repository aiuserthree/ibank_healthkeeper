from __future__ import annotations

import base64
import re
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
EMAIL_ASSETS_DIR = WEB_ROOT / "assets" / "email"

_EMAIL_ASSET_PATHS: dict[str, Path] = {
    "logoUrl": WEB_ROOT / "assets" / "logo-lockup.png",
    "iconLockUrl": EMAIL_ASSETS_DIR / "icon-lock-blue.png",
    "iconCheckGreenUrl": EMAIL_ASSETS_DIR / "icon-check-green.png",
    "iconCheckBlueUrl": EMAIL_ASSETS_DIR / "icon-check-blue.png",
    "iconClockAmberUrl": EMAIL_ASSETS_DIR / "icon-clock-amber.png",
    "iconWarnRedUrl": EMAIL_ASSETS_DIR / "icon-warn-red.png",
}

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

# 관리자 화면 편집용 plain text — HK_INTRO(본문)만. HK_TIPS·HK_WARN 안내 박스는 export HTML 고정.
PLAIN_BODY_DEFAULTS: dict[MailType, str] = {
    MailType.EMAIL_VERIFY: (
        "안녕하세요.\n"
        "헬스키퍼 회원가입을 진행 중이시군요. 아래 인증코드를 회원가입 화면에 입력하면 이메일 인증이 완료됩니다."
    ),
    MailType.RESERVE_DONE_NORMAL: (
        "안녕하세요, {이름}님.\n"
        "신청하신 안마서비스 예약이 관리자 확정으로 완료되었습니다. 아래 일정에 맞춰 방문해 주세요."
    ),
    MailType.RESERVE_DONE_REAPPLY: (
        "안녕하세요, {이름}님.\n"
        "선착순 재신청이 즉시 확정되었습니다. 아래 일정으로 안마서비스가 예약되었어요."
    ),
    MailType.DROP_REAPPLY_NOTICE: (
        "안녕하세요, {이름}님.\n"
        "신청하신 시간대는 우선권(마지막 이용일)에 따라 다른 분께 확정되어 탈락 처리되었습니다. "
        "아래 비어있는 슬롯에 선착순으로 재신청하실 수 있어요."
    ),
}

STRUCTURAL_LINE_PREFIXES = (
    "날짜:",
    "시간:",
    "일시:",
    "비어있는 슬롯:",
    "재신청 시작:",
    "재신청 마감:",
)

LEGACY_BODY_MARKERS = (
    "{name}님,",
    "일시:",
    "빈 슬롯:",
)

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
    "iconLockUrl": "iconLockUrl",
    "iconCheckGreenUrl": "iconCheckGreenUrl",
    "iconCheckBlueUrl": "iconCheckBlueUrl",
    "iconClockAmberUrl": "iconClockAmberUrl",
    "iconWarnRedUrl": "iconWarnRedUrl",
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


def _png_data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def email_asset_data_uris() -> dict[str, str]:
    """Outlook-safe PNG data URIs (SVG data URIs are not rendered in Outlook desktop)."""
    base_url = settings.app_base_url.rstrip("/")
    out: dict[str, str] = {}
    for key, path in _EMAIL_ASSET_PATHS.items():
        if path.is_file():
            out[key] = _png_data_uri(path)
        elif key == "logoUrl":
            out[key] = f"{base_url}/assets/logo-lockup.png"
    return out


def expand_mail_context(context: dict) -> dict:
    base_url = settings.app_base_url.rstrip("/")
    out = dict(context)
    out.setdefault("appBaseUrl", base_url)
    for key, uri in email_asset_data_uris().items():
        out.setdefault(key, uri)
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
    """관리자 편집 화면용 plain text (본문 HK_INTRO만)."""
    stored = (stored_body or "").strip()
    default = PLAIN_BODY_DEFAULTS.get(mail_type, "")
    if stored and not _is_html_template(stored):
        if any(marker in stored for marker in LEGACY_BODY_MARKERS):
            return default
        intro, _tips = split_admin_plain(stored)
        def_intro, _ = split_admin_plain(default)
        if _normalize_plain(intro) == _normalize_plain(def_intro):
            return default
        return intro.strip() or default
    return default


def resolve_admin_body_plain(template: Optional[MailTemplate], mail_type: MailType) -> str:
    stored = editor_body_template(template.body_template if template else "", mail_type)
    return stored.strip() or PLAIN_BODY_DEFAULTS.get(mail_type, "")


def split_admin_plain(text: str) -> tuple[str, str]:
    intro_lines: list[str] = []
    tip_lines: list[str] = []
    for ln in text.replace("\r\n", "\n").split("\n"):
        stripped = ln.strip()
        if not stripped:
            continue
        if stripped.startswith("·"):
            tip_lines.append(stripped)
        elif any(stripped.startswith(prefix) for prefix in STRUCTURAL_LINE_PREFIXES):
            continue
        else:
            intro_lines.append(ln.rstrip())
    return "\n".join(intro_lines).strip(), "\n".join(tip_lines).strip()


def plain_to_body_html(text: str) -> str:
    import html as html_module

    normalized = text.replace("\r\n", "\n").strip()
    if not normalized:
        return ""
    lines = [ln.strip() for ln in normalized.split("\n") if ln.strip()]
    parts: list[str] = []
    for idx, line in enumerate(lines):
        if idx == 0:
            m = re.match(r"^(안녕하세요,?\s*)\{이름\}(님\.?)$", line)
            if m:
                parts.append(
                    '<p style="margin:0 0 8px;font-size:16px;line-height:1.7;color:#0a0a0a;">'
                    f"{html_module.escape(m.group(1))}"
                    f'<strong style="color:#0b3558;">{{이름}}{html_module.escape(m.group(2))}</strong></p>'
                )
                continue
            if line == "안녕하세요.":
                parts.append(
                    '<p style="margin:0 0 8px;font-size:16px;line-height:1.7;color:#0a0a0a;">'
                    f"{html_module.escape(line)}</p>"
                )
                continue
        esc = html_module.escape(line)
        if idx == 0:
            parts.append(
                '<p style="margin:0 0 8px;font-size:16px;line-height:1.7;color:#0a0a0a;">'
                f"{esc}</p>"
            )
        else:
            margin = "0 0 8px" if idx < len(lines) - 1 else "0"
            parts.append(
                f'<p style="margin:{margin};font-size:16px;line-height:1.7;color:#476788;">'
                f"{esc}</p>"
            )
    if len(parts) == 1 and "color:#0a0a0a" not in parts[0]:
        parts[0] = parts[0].replace("color:#476788", "color:#0a0a0a", 1)
    return "".join(parts)


def plain_to_tips_html(text: str) -> str:
    import html as html_module

    lines = [ln.strip() for ln in text.replace("\r\n", "\n").split("\n") if ln.strip()]
    if not lines:
        return ""
    rendered: list[str] = []
    for ln in lines:
        body = ln[1:].strip() if ln.startswith("·") else ln
        rendered.append(f"· {html_module.escape(body)}")
    return "<br>\n          ".join(rendered)


def plain_to_strong_tip_html(text: str) -> str:
    import html as html_module

    line = text.replace("\r\n", "\n").strip()
    if not line:
        return ""
    if line.startswith("·"):
        line = line[1:].strip()
    return f"<strong>{html_module.escape(line)}</strong>"


HK_INTRO_RE = re.compile(r"<!--HK_INTRO-->(.*?)<!--HK_INTRO_END-->", re.S)
HK_TIPS_RE = re.compile(r"<!--HK_TIPS-->(.*?)<!--HK_TIPS_END-->", re.S)
HK_WARN_RE = re.compile(r"<!--HK_WARN-->(.*?)<!--HK_WARN_END-->", re.S)


def _normalize_plain(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\r\n", "\n").strip())


def plain_to_warn_html(text: str) -> str:
    import html as html_module

    lines = [ln.strip().lstrip("·").strip() for ln in text.replace("\r\n", "\n").split("\n") if ln.strip()]
    if not lines:
        return ""
    out = f"<strong>{html_module.escape(lines[0])}</strong>"
    if len(lines) > 1:
        out += f'<br><span style="color:#476788;">{html_module.escape(lines[1])}</span>'
    return out


def strip_hk_markers(html: str) -> str:
    return (
        html.replace("<!--HK_INTRO-->", "")
        .replace("<!--HK_INTRO_END-->", "")
        .replace("<!--HK_TIPS-->", "")
        .replace("<!--HK_TIPS_END-->", "")
        .replace("<!--HK_WARN-->", "")
        .replace("<!--HK_WARN_END-->", "")
    )


def apply_admin_plain_to_design(html: str, plain: str, mail_type: MailType) -> str:
    """export HTML 레이아웃 유지 — 본문(HK_INTRO)만 반영. 안내 박스는 HTML 고정."""
    if "<!--HK_INTRO-->" not in html:
        return html

    default = PLAIN_BODY_DEFAULTS.get(mail_type, "")
    default_intro, _ = split_admin_plain(default)
    intro, _ = split_admin_plain(plain)

    if intro and _normalize_plain(intro) != _normalize_plain(default_intro):
        html = HK_INTRO_RE.sub(plain_to_body_html(intro), html, count=1)

    return strip_hk_markers(html)


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


def _sanitize_outlook_images(html: str) -> str:
    """Legacy templates may still embed SVG data URIs — swap to embedded PNG."""
    if "data:image/svg+xml" not in html:
        return html
    assets = email_asset_data_uris()
    logo_uri = assets.get("logoUrl", "")
    html = re.sub(
        r'<img src="data:image/svg\+xml[^"]*" alt="헬스키퍼"[^>]*>',
        (
            f'<img src="{logo_uri}" alt="헬스키퍼" height="30" '
            'style="display:block;border:0;height:30px;width:auto;max-width:216px;">'
        ),
        html,
    )
    icon_rules: tuple[tuple[str, str, int, str], ...] = (
        (r"rect width='18' height='11'", "iconLockUrl", 28, "margin:0 auto;border:0;"),
        (r"stroke='%231f8a5b'", "iconCheckGreenUrl", 28, "margin:0 auto;border:0;"),
        (r"stroke='%23006bff'[^\"]*path d='M21.801", "iconCheckBlueUrl", 28, "margin:0 auto;border:0;"),
        (r"stroke='%23c2780c'", "iconClockAmberUrl", 28, "margin:0 auto;border:0;"),
        (r"stroke='%23d23f3f'", "iconWarnRedUrl", 20, "border:0;"),
    )
    for needle, key, size, extra in icon_rules:
        uri = assets.get(key, "")
        repl = (
            f'<img src="{uri}" alt="" width="{size}" height="{size}" '
            f'style="display:block;{extra}">'
        )
        html = re.sub(
            rf'<img src="data:image/svg\+xml;utf8,[^"]*{needle}[^"]*" '
            rf'alt="" width="{size}" height="{size}"[^>]*>',
            repl,
            html,
        )
    return html


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


def prepare_html_for_email(html: str) -> str:
    return absolutize_html_assets(_sanitize_outlook_images(html))


def resolve_template_parts(
    mail_type: MailType,
    template: Optional[MailTemplate],
) -> tuple[str, str]:
    subject_tpl = (template.subject_template if template else "") or DEFAULT_SUBJECTS.get(
        mail_type, mail_type.value
    )
    body_tpl = (template.body_template if template else "") or ""
    if _is_html_template(body_tpl):
        return subject_tpl, body_tpl
    design = load_design_html(mail_type)
    if design:
        return subject_tpl, design
    return subject_tpl, resolve_admin_body_plain(template, mail_type)


PREVIEW_CONTEXT: dict[MailType, dict] = {
    MailType.EMAIL_VERIFY: {
        "name": "김민수",
        "verifyUrl": "https://healthkeeper.example.com/사용자/이메일인증.html?token=preview",
        "인증코드": "284913",
    },
    MailType.RESERVE_DONE_NORMAL: {
        "name": "김민수",
        "slotDate": date(2026, 6, 23),
        "slotTime": "15:30 – 16:00",
    },
    MailType.RESERVE_DONE_REAPPLY: {
        "name": "김민수",
        "slotDate": date(2026, 6, 25),
        "slotTime": "14:30 – 15:00",
    },
    MailType.DROP_REAPPLY_NOTICE: {
        "name": "김민수",
        "emptySlots": "화 6/23 · 13:30, 화 6/23 · 15:30, 목 6/25 · 14:30",
        "emptySlotsHtml": (
            '<span style="display:inline-block; margin:0 6px 6px 0; padding:6px 12px; '
            'background:#ffffff; border:1px solid #d4e0ed; border-radius:999px; '
            'font-size:13px; color:#0b3558;">화 6/23 · 13:30</span> '
            '<span style="display:inline-block; margin:0 6px 6px 0; padding:6px 12px; '
            'background:#ffffff; border:1px solid #d4e0ed; border-radius:999px; '
            'font-size:13px; color:#0b3558;">화 6/23 · 15:30</span> '
            '<span style="display:inline-block; margin:0 6px 6px 0; padding:6px 12px; '
            'background:#ffffff; border:1px solid #d4e0ed; border-radius:999px; '
            'font-size:13px; color:#0b3558;">목 6/25 · 14:30</span> '
            '<span style="display:inline-block; margin:0 6px 6px 0; padding:6px 12px; '
            'background:#ffffff; border:1px solid #d4e0ed; border-radius:999px; '
            'font-size:13px; color:#0b3558;">목 6/25 · 16:30</span> '
            '<span style="display:inline-block; margin:0 6px 6px 0; padding:6px 12px; '
            'background:#ffffff; border:1px solid #d4e0ed; border-radius:999px; '
            'font-size:13px; color:#0b3558;">금 6/26 · 13:30</span> '
            '<span style="display:inline-block; margin:0 6px 6px 0; padding:6px 12px; '
            'background:#ffffff; border:1px solid #d4e0ed; border-radius:999px; '
            'font-size:13px; color:#0b3558;">금 6/26 · 15:30</span>'
        ),
        "reapplyOpenAt": "목요일 09:00",
        "reapplyDeadline": "내일(목요일) 17:00",
    },
}


def render_mail_message(
    mail_type: MailType,
    template: Optional[MailTemplate],
    context: dict,
) -> tuple[str, str]:
    subject_tpl, body_tpl = resolve_template_parts(mail_type, template)
    render_ctx = dict(context)
    plain = resolve_admin_body_plain(template, mail_type)

    if _is_html_template(body_tpl):
        if "<!--HK_INTRO-->" in body_tpl:
            body_tpl = apply_admin_plain_to_design(body_tpl, plain, mail_type)
        elif "{본문}" in body_tpl or "{안내}" in body_tpl:
            _, plain_rendered = render_template("", plain, render_ctx)
            intro, tips = split_admin_plain(plain_rendered)
            if "{본문}" in body_tpl:
                render_ctx["본문"] = plain_to_body_html(intro)
            if "{안내}" in body_tpl:
                render_ctx["안내"] = plain_to_tips_html(tips)

    return render_template(subject_tpl, body_tpl, render_ctx)


def preview_mail_template(
    mail_type: MailType,
    subject_template: str,
    body_template: str,
    context: Optional[dict] = None,
) -> tuple[str, str]:
    fake = MailTemplate(
        type=mail_type,
        subject_template=subject_template,
        body_template=body_template,
    )
    ctx = {**PREVIEW_CONTEXT.get(mail_type, {}), **(context or {})}
    subject, body = render_mail_message(mail_type, fake, ctx)
    return subject, body


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
    subject, body = render_mail_message(mail_type, template, context)

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
        body = prepare_html_for_email(msg.body)
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
