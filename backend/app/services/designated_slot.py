"""월요일 15:30 — 관리자 지정 확정 전용 슬롯.

회원 화면에는 노출하지 않고, 신청은 누구나 받되 확정은 관리자가
Teams SSO 로그인 회원 중에서 지정한 인원만 처리한다.
미신청자도 지정 가능하며, 지정 시 같은 슬롯의 다른 신청자는 탈락 처리한다.
"""

from __future__ import annotations

from datetime import datetime, time

from sqlalchemy import collate, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import raise_app_error
from app.core.time import KST, now_kst
from app.models import (
    ConfirmedBy,
    MailType,
    Member,
    MemberStatus,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    ReservationType,
    Slot,
    SlotStatus,
)
from app.services.avatar import admin_member_avatar_url
from app.services.cycle import can_admin_confirm
from app.services.korean_holidays import is_public_holiday
from app.services.mail import enqueue_mail, queue_mail_after_commit
from app.services.reservation import ACTIVE_APPLY_STATUSES, _member_cycle_active_apply

_NAME_COLLATION = "ko-KR-x-icu"
DESIGNATED_CONFIRM_DOW = 0  # Monday
DESIGNATED_CONFIRM_START = time(15, 30)

_EXCLUDED_EMAIL_LOCAL = "healthkeeper"
_EXCLUDED_EMAIL_DOMAINS = frozenset({"healthkeeper.local"})


def is_designated_confirm_slot(slot: Slot) -> bool:
    """월요일 15:30 슬롯 여부 (회원 UI에는 노출하지 않음)."""
    return (
        slot.slot_date.weekday() == DESIGNATED_CONFIRM_DOW
        and slot.start_time == DESIGNATED_CONFIRM_START
    )


def _is_mock_entra_oid(entra_oid: str | None) -> bool:
    return bool(entra_oid) and entra_oid.lower().startswith("mock-")


def _excluded_system_emails() -> set[str]:
    settings = get_settings()
    emails = {
        (settings.teams_sender_email or "").strip().lower(),
        (settings.smtp_user or "").strip().lower(),
        (settings.smtp_from or "").strip().lower(),
    }
    return {e for e in emails if e and "@" in e}


def _assert_slot_not_past(slot: Slot) -> None:
    slot_start = datetime.combine(slot.slot_date, slot.start_time, tzinfo=KST)
    if now_kst() >= slot_start:
        raise_app_error("NOT_ADMIN_ASSIGN_SLOT_PAST")


async def search_designatable_members(
    db: AsyncSession,
    slot_id: int,
    *,
    q: str = "",
    limit: int = 50,
) -> list[dict]:
    slot = await db.get(Slot, slot_id)
    if not slot or not is_designated_confirm_slot(slot):
        raise_app_error("NOT_DESIGNATED_CONFIRM_SLOT")

    week_active = await db.execute(
        select(Reservation.member_id, Reservation.status, Reservation.slot_id)
        .where(Reservation.cycle_id == slot.cycle_id)
        .where(Reservation.status.in_(ACTIVE_APPLY_STATUSES))
    )
    applied_ids: set[int] = set()
    confirmed_ids: set[int] = set()
    requested_elsewhere_ids: set[int] = set()
    for member_id, status, res_slot_id in week_active.all():
        if status == ReservationStatus.CONFIRMED:
            confirmed_ids.add(member_id)
        elif status == ReservationStatus.REQUESTED:
            if res_slot_id == slot.id:
                applied_ids.add(member_id)
            else:
                requested_elsewhere_ids.add(member_id)

    excluded = _excluded_system_emails()
    allowed_domains = get_settings().allowed_email_domains()

    stmt = (
        select(Member)
        .where(Member.status == MemberStatus.ACTIVE)
        .where(Member.entra_oid.isnot(None))
        .where(~func.lower(Member.entra_oid).like("mock-%"))
        .where(
            func.lower(func.split_part(Member.email, "@", 1)) != _EXCLUDED_EMAIL_LOCAL
        )
        .where(
            ~func.lower(func.split_part(Member.email, "@", 2)).in_(
                list(_EXCLUDED_EMAIL_DOMAINS)
            )
        )
        .order_by(collate(Member.name, _NAME_COLLATION), Member.id)
        .limit(min(max(limit, 1), 100))
    )
    if excluded:
        stmt = stmt.where(func.lower(Member.email).not_in(excluded))
    if allowed_domains:
        stmt = stmt.where(
            func.lower(func.split_part(Member.email, "@", 2)).in_(allowed_domains)
        )

    query = q.strip()
    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                Member.name.ilike(pattern),
                Member.email.ilike(pattern),
                Member.department.ilike(pattern),
            )
        )

    result = await db.execute(stmt)
    return [
        {
            "id": m.id,
            "name": m.name,
            "email": m.email,
            "department": m.department,
            "position": m.position,
            "lastUsedDate": m.last_used_date.isoformat() if m.last_used_date else None,
            "avatarUrl": admin_member_avatar_url(m.id),
            "appliedToSlot": m.id in applied_ids,
            "confirmedThisWeek": m.id in confirmed_ids,
            "requestedElsewhere": m.id in requested_elsewhere_ids,
            "selectable": m.id not in confirmed_ids and m.id not in requested_elsewhere_ids,
        }
        for m in result.scalars().all()
    ]


async def designate_confirm_slot(
    db: AsyncSession,
    slot_id: int,
    member_id: int,
) -> Reservation:
    """지정 인원 확정. 신청자면 NORMAL 확정, 미신청자면 ADMIN_ASSIGN 확정."""
    slot_result = await db.execute(
        select(Slot).where(Slot.id == slot_id).with_for_update()
    )
    slot = slot_result.scalar_one_or_none()
    if not slot:
        raise_app_error("NOT_FOUND", 404)
    if not is_designated_confirm_slot(slot):
        raise_app_error("NOT_DESIGNATED_CONFIRM_SLOT")
    if slot.status == SlotStatus.CONFIRMED:
        raise_app_error("SLOT_ALREADY_CONFIRMED")
    if slot.is_vacation:
        raise_app_error("VACATION_SLOT")
    if is_public_holiday(slot.slot_date):
        raise_app_error("HOLIDAY_SLOT")

    cycle = await db.get(ReservationCycle, slot.cycle_id)
    if not cycle or not can_admin_confirm(cycle):
        raise_app_error("NOT_CONFIRMABLE_BEFORE_CLOSE")
    _assert_slot_not_past(slot)

    member = await db.get(Member, member_id)
    if not member or member.status != MemberStatus.ACTIVE:
        raise_app_error("NOT_FOUND", 404)
    if not member.entra_oid or _is_mock_entra_oid(member.entra_oid):
        raise_app_error("MEMBER_NOT_SSO")

    existing = await db.execute(
        select(Reservation)
        .where(Reservation.slot_id == slot.id)
        .where(Reservation.member_id == member.id)
        .where(Reservation.status == ReservationStatus.REQUESTED)
        .limit(1)
    )
    requested = existing.scalar_one_or_none()

    if requested:
        from app.services.confirm import confirm_reservation

        return await confirm_reservation(
            db,
            slot.id,
            requested.id,
            ConfirmedBy.ADMIN,
            force_designated=True,
        )

    active = await _member_cycle_active_apply(db, member.id, slot.cycle_id)
    if active:
        raise_app_error("MEMBER_NOT_ASSIGNABLE")

    now = now_kst()
    others = await db.execute(
        select(Reservation)
        .where(Reservation.slot_id == slot.id)
        .where(Reservation.status == ReservationStatus.REQUESTED)
    )
    for other in others.scalars().all():
        other.status = ReservationStatus.DROPPED
        other.dropped_at = now
        other.is_priority = False

    reservation = Reservation(
        slot_id=slot.id,
        member_id=member.id,
        cycle_id=slot.cycle_id,
        type=ReservationType.ADMIN_ASSIGN,
        status=ReservationStatus.CONFIRMED,
        applied_at=now,
        confirmed_at=now,
        confirmed_by=ConfirmedBy.ADMIN,
        is_priority=True,
    )
    db.add(reservation)
    await db.flush()

    slot.status = SlotStatus.CONFIRMED
    slot.confirmed_reservation_id = reservation.id
    if member.last_used_date is None or slot.slot_date > member.last_used_date:
        member.last_used_date = slot.slot_date

    mail = await enqueue_mail(
        db,
        mail_type=MailType.RESERVE_DONE_NORMAL,
        to_email=member.email,
        to_member_id=member.id,
        reservation_id=reservation.id,
        cycle_id=reservation.cycle_id,
        context={
            "name": member.name,
            "slotDate": slot.slot_date,
            "slotTime": f"{slot.start_time.strftime('%H:%M')} – {slot.end_time.strftime('%H:%M')}",
        },
        dedupe_key=f"done:n:{reservation.id}",
    )
    if mail:
        queue_mail_after_commit(mail.id)

    await db.commit()
    await db.refresh(reservation)
    return reservation
