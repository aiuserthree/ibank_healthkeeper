from __future__ import annotations

from typing import Optional

from datetime import datetime, timedelta
from string import Template

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.time import now_kst
from app.models import MailMessage, MailStatus, MailTemplate, MailType

settings = get_settings()

_pending_after_commit: list[int] = []


def queue_mail_after_commit(mail_id: int) -> None:
    _pending_after_commit.append(mail_id)


def drain_pending_mails() -> list[int]:
    global _pending_after_commit
    ids = _pending_after_commit[:]
    _pending_after_commit = []
    return ids


async def get_template(db: AsyncSession, mail_type: MailType) -> Optional[MailTemplate]:
    result = await db.execute(select(MailTemplate).where(MailTemplate.type == mail_type))
    return result.scalar_one_or_none()


def render_template(subject_tpl: str, body_tpl: str, context: dict) -> tuple[str, str]:
    subject = Template(subject_tpl).safe_substitute(context)
    body = Template(body_tpl).safe_substitute(context)
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
    if template:
        subject, body = render_template(
            template.subject_template, template.body_template, context
        )
    else:
        subject = mail_type.value
        body = str(context)

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

    email = EmailMessage()
    email["From"] = settings.smtp_from
    email["To"] = msg.to_email
    email["Subject"] = msg.subject
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
