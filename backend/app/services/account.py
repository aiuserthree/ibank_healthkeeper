from __future__ import annotations

from datetime import datetime, timedelta

from email_validator import validate_email, EmailNotValidError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import raise_app_error
from app.core.security import generate_token, hash_password, validate_password_strength, verify_password
from app.core.time import format_kst_iso, now_kst
from app.models import (
    EmailVerificationToken,
    Member,
    MemberStatus,
    MailType,
    Reservation,
    ReservationStatus,
)
from app.services.mail import enqueue_mail, queue_mail_after_commit

settings = get_settings()


async def check_email_available(db: AsyncSession, email: str) -> bool:
    result = await db.execute(
        select(Member).where(Member.email == email.lower()).where(Member.status != MemberStatus.WITHDRAWN)
    )
    return result.scalar_one_or_none() is None


async def upsert_member_from_sso(
    db: AsyncSession,
    *,
    oid: str,
    email: str,
    name: str,
    department: str | None = None,
    position: str | None = None,
) -> Member:
    from app.services.sso import validate_allowed_domain

    email = email.strip().lower()
    validate_allowed_domain(email)

    result = await db.execute(
        select(Member)
        .where(Member.entra_oid == oid)
        .where(Member.status != MemberStatus.WITHDRAWN)
    )
    member = result.scalar_one_or_none()
    if not member:
        result = await db.execute(
            select(Member)
            .where(Member.email == email)
            .where(Member.status != MemberStatus.WITHDRAWN)
        )
        member = result.scalar_one_or_none()

    if member:
        member.entra_oid = oid
        member.name = name.strip()
        if email and member.email != email:
            member.email = email
        member.status = MemberStatus.ACTIVE
        member.login_fail_count = 0
        member.locked_until = None
        member.last_login_at = now_kst()
        if department is not None:
            member.department = department.strip() or None
        if position is not None:
            member.position = position.strip() or None
    else:
        member = Member(
            entra_oid=oid,
            email=email,
            name=name.strip(),
            password_hash=None,
            status=MemberStatus.ACTIVE,
            last_login_at=now_kst(),
            department=department.strip() if department else None,
            position=position.strip() if position else None,
        )
        db.add(member)

    await db.commit()
    await db.refresh(member)
    return member


async def signup(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password: str,
    password_confirm: str,
) -> Member:
    email = email.strip().lower()
    try:
        validate_email(email)
    except EmailNotValidError:
        raise_app_error("PASSWORD_MISMATCH")

    if password != password_confirm:
        raise_app_error("PASSWORD_MISMATCH")
    if not validate_password_strength(password):
        raise_app_error("PASSWORD_RULE")

    if not await check_email_available(db, email):
        raise_app_error("EMAIL_DUPLICATED")

    member = Member(
        email=email,
        name=name.strip(),
        password_hash=hash_password(password),
        status=MemberStatus.PENDING,
    )
    db.add(member)
    await db.flush()

    token_str = generate_token(48)
    token = EmailVerificationToken(
        member_id=member.id,
        token=token_str,
        expires_at=now_kst() + timedelta(hours=settings.verify_token_ttl_hours),
    )
    db.add(token)
    await db.flush()

    verify_url = f"{settings.app_base_url}/사용자/이메일인증.html?token={token_str}"
    mail = await enqueue_mail(
        db,
        mail_type=MailType.EMAIL_VERIFY,
        to_email=member.email,
        to_member_id=member.id,
        context={"name": member.name, "verifyUrl": verify_url},
        dedupe_key=f"verify:{token.id}",
    )
    if mail:
        queue_mail_after_commit(mail.id)
    await db.commit()
    return member


async def verify_email(db: AsyncSession, token_str: str) -> None:
    result = await db.execute(
        select(EmailVerificationToken).where(EmailVerificationToken.token == token_str)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise_app_error("TOKEN_INVALID")
    if token.used_at:
        raise_app_error("TOKEN_INVALID")
    if token.expires_at < now_kst():
        raise_app_error("TOKEN_EXPIRED")

    member = await db.get(Member, token.member_id)
    if not member:
        raise_app_error("TOKEN_INVALID")

    member.status = MemberStatus.ACTIVE
    token.used_at = now_kst()
    await db.commit()


async def resend_verification(db: AsyncSession, email: str) -> None:
    email = email.strip().lower()
    result = await db.execute(select(Member).where(Member.email == email))
    member = result.scalar_one_or_none()
    if not member:
        return
    if member.status == MemberStatus.ACTIVE:
        raise_app_error("ALREADY_VERIFIED")

    cooldown = timedelta(minutes=settings.verify_resend_cooldown_minutes)
    recent = await db.execute(
        select(EmailVerificationToken)
        .where(EmailVerificationToken.member_id == member.id)
        .order_by(EmailVerificationToken.created_at.desc())
        .limit(1)
    )
    last = recent.scalar_one_or_none()
    if last and last.created_at + cooldown > now_kst():
        raise_app_error("RESEND_COOLDOWN")

    token_str = generate_token(48)
    token = EmailVerificationToken(
        member_id=member.id,
        token=token_str,
        expires_at=now_kst() + timedelta(hours=settings.verify_token_ttl_hours),
    )
    db.add(token)
    await db.flush()

    verify_url = f"{settings.app_base_url}/사용자/이메일인증.html?token={token_str}"
    mail = await enqueue_mail(
        db,
        mail_type=MailType.EMAIL_VERIFY,
        to_email=member.email,
        to_member_id=member.id,
        context={"name": member.name, "verifyUrl": verify_url},
        dedupe_key=f"verify:{token.id}",
    )
    if mail:
        queue_mail_after_commit(mail.id)
    await db.commit()


async def login(db: AsyncSession, email: str, password: str) -> Member:
    email = email.strip().lower()
    result = await db.execute(select(Member).where(Member.email == email))
    member = result.scalar_one_or_none()
    if not member or member.status == MemberStatus.WITHDRAWN:
        raise_app_error("AUTH_FAILED", 401)
    if member.status == MemberStatus.PENDING:
        raise_app_error("NOT_VERIFIED", 403)

    if member.locked_until and member.locked_until > now_kst():
        raise_app_error("ACCOUNT_LOCKED", 423)

    if not verify_password(password, member.password_hash):
        member.login_fail_count += 1
        if member.login_fail_count >= settings.login_max_failures:
            member.locked_until = now_kst() + timedelta(minutes=settings.login_lock_minutes)
        await db.commit()
        raise_app_error("AUTH_FAILED", 401)

    member.login_fail_count = 0
    member.locked_until = None
    member.last_login_at = now_kst()
    await db.commit()
    return member


async def change_password(
    db: AsyncSession, member: Member, current: str, new_password: str, confirm: str
) -> None:
    if not verify_password(current, member.password_hash):
        raise_app_error("INVALID_CURRENT_PASSWORD")
    if new_password != confirm:
        raise_app_error("PASSWORD_MISMATCH")
    if not validate_password_strength(new_password):
        raise_app_error("PASSWORD_RULE")
    member.password_hash = hash_password(new_password)
    await db.commit()


async def withdraw(db: AsyncSession, member: Member) -> None:
    active = await db.execute(
        select(Reservation)
        .where(Reservation.member_id == member.id)
        .where(Reservation.status.in_([ReservationStatus.REQUESTED, ReservationStatus.CONFIRMED]))
    )
    if active.scalars().first():
        raise_app_error("WITHDRAW_BLOCKED", 409)
    member.status = MemberStatus.WITHDRAWN
    await db.commit()
