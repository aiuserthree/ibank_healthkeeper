from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import KST, format_kst_iso, now_kst
from app.models import (
    ConfirmedBy,
    MailMessage,
    MailStatus,
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
from app.services.cycle import admin_assign_window, can_admin_assign
from app.services.avatar import admin_member_avatar_url
from app.services.korean_holidays import is_public_holiday
from app.services.legacy_usage import resolve_legacy_last_used_date
from app.services.reservation import ACTIVE_APPLY_STATUSES, _member_cycle_active_apply


async def recompute_member_last_used_date(db: AsyncSession, member: Member) -> None:
    result = await db.execute(
        select(func.max(Slot.slot_date))
        .join(Reservation, Reservation.slot_id == Slot.id)
        .where(Reservation.member_id == member.id)
        .where(Reservation.status == ReservationStatus.CONFIRMED)
    )
    confirmed_max = result.scalar_one_or_none()
    legacy_max = await resolve_legacy_last_used_date(
        db, email=member.email, name=member.name
    )
    candidates = [d for d in (confirmed_max, legacy_max) if d is not None]
    member.last_used_date = max(candidates) if candidates else None


async def _require_assign_window(db: AsyncSession, cycle_id: int) -> ReservationCycle:
    cycle = await db.get(ReservationCycle, cycle_id)
    if not cycle:
        raise_app_error("NOT_FOUND", 404)
    if not can_admin_assign(cycle):
        raise_app_error("NOT_ADMIN_ASSIGN_PERIOD")
    return cycle


async def _slot_has_active_reservations(db: AsyncSession, slot_id: int) -> bool:
    result = await db.execute(
        select(Reservation.id)
        .where(Reservation.slot_id == slot_id)
        .where(Reservation.status.in_(ACTIVE_APPLY_STATUSES))
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def slot_has_admin_released_vacancy(db: AsyncSession, slot_id: int) -> bool:
    """관리자가 확정·지정을 취소해 비워진 슬롯(취소 이력에 confirmed_at 존재)."""
    result = await db.execute(
        select(Reservation.id)
        .where(Reservation.slot_id == slot_id)
        .where(Reservation.status == ReservationStatus.CANCELLED)
        .where(Reservation.confirmed_at.isnot(None))
        .where(
            Reservation.type.in_(
                (ReservationType.NORMAL, ReservationType.ADMIN_ASSIGN)
            )
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


def _assert_slot_not_past_for_assign(slot: Slot) -> None:
    slot_start = datetime.combine(slot.slot_date, slot.start_time, tzinfo=KST)
    if now_kst() >= slot_start:
        raise_app_error("NOT_ADMIN_ASSIGN_SLOT_PAST")


async def _assert_slot_assignable(db: AsyncSession, slot: Slot) -> None:
    if slot.is_vacation:
        raise_app_error("VACATION_SLOT")
    if is_public_holiday(slot.slot_date):
        raise_app_error("HOLIDAY_SLOT")
    if slot.status == SlotStatus.CONFIRMED:
        raise_app_error("SLOT_ALREADY_CONFIRMED")
    if await _slot_has_active_reservations(db, slot.id):
        raise_app_error("SLOT_NOT_ASSIGNABLE")
    if not await slot_has_admin_released_vacancy(db, slot.id):
        raise_app_error("SLOT_NOT_ADMIN_CANCEL_VACANCY")
    _assert_slot_not_past_for_assign(slot)


async def _get_assignable_slot(
    db: AsyncSession, slot_id: int, cycle_id: int, *, for_update: bool = False
) -> Slot:
    stmt = select(Slot).where(Slot.id == slot_id)
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    slot = result.scalar_one_or_none()
    if not slot or slot.cycle_id != cycle_id:
        raise_app_error("NOT_FOUND", 404)
    await _assert_slot_assignable(db, slot)
    return slot


async def _get_assignable_member(
    db: AsyncSession, member_id: int, cycle_id: int
) -> Member:
    member = await db.get(Member, member_id)
    if not member or member.status != MemberStatus.ACTIVE:
        raise_app_error("NOT_FOUND", 404)
    if await _member_cycle_active_apply(db, member.id, cycle_id):
        raise_app_error("MEMBER_NOT_ASSIGNABLE")
    return member


async def search_assignable_members(
    db: AsyncSession,
    cycle_id: int,
    *,
    q: str = "",
    limit: int = 30,
) -> list[dict]:
    await _require_assign_window(db, cycle_id)

    active_member_ids = select(Reservation.member_id).where(
        Reservation.cycle_id == cycle_id,
        Reservation.status.in_(ACTIVE_APPLY_STATUSES),
    )

    stmt = (
        select(Member)
        .where(Member.status == MemberStatus.ACTIVE)
        .where(Member.id.not_in(active_member_ids))
        .order_by(Member.name)
        .limit(min(max(limit, 1), 50))
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
        }
        for m in result.scalars().all()
    ]


async def _finalize_admin_assign(
    db: AsyncSession,
    reservation: Reservation,
    slot: Slot,
    member: Member,
) -> None:
    slot.status = SlotStatus.CONFIRMED
    slot.confirmed_reservation_id = reservation.id

    if member.last_used_date is None or slot.slot_date > member.last_used_date:
        member.last_used_date = slot.slot_date


async def assign_empty_slot(
    db: AsyncSession, slot_id: int, member_id: int
) -> Reservation:
    slot_result = await db.execute(
        select(Slot).where(Slot.id == slot_id).with_for_update()
    )
    slot = slot_result.scalar_one_or_none()
    if not slot:
        raise_app_error("NOT_FOUND", 404)

    cycle = await _require_assign_window(db, slot.cycle_id)
    await _assert_slot_assignable(db, slot)

    member = await _get_assignable_member(db, member_id, cycle.id)

    now = now_kst()
    reservation = Reservation(
        slot_id=slot.id,
        member_id=member.id,
        cycle_id=cycle.id,
        type=ReservationType.ADMIN_ASSIGN,
        status=ReservationStatus.CONFIRMED,
        applied_at=now,
        confirmed_at=now,
        confirmed_by=ConfirmedBy.ADMIN,
    )
    db.add(reservation)
    await db.flush()

    await _finalize_admin_assign(db, reservation, slot, member)
    await db.commit()
    await db.refresh(reservation)
    return reservation


async def _get_admin_assign_reservation(
    db: AsyncSession, reservation_id: int
) -> tuple[Reservation, Slot, Member]:
    reservation = await db.get(Reservation, reservation_id)
    if not reservation:
        raise_app_error("NOT_FOUND", 404)
    if reservation.type != ReservationType.ADMIN_ASSIGN:
        raise_app_error("NOT_ADMIN_ASSIGN")
    if reservation.status != ReservationStatus.CONFIRMED:
        raise_app_error("NOT_CANCELABLE")

    slot_result = await db.execute(
        select(Slot).where(Slot.id == reservation.slot_id).with_for_update()
    )
    slot = slot_result.scalar_one_or_none()
    if not slot:
        raise_app_error("NOT_FOUND", 404)

    member = await db.get(Member, reservation.member_id)
    if not member:
        raise_app_error("NOT_FOUND", 404)

    await _require_assign_window(db, reservation.cycle_id)
    return reservation, slot, member


async def cancel_admin_assign(db: AsyncSession, reservation_id: int) -> None:
    reservation, slot, member = await _get_admin_assign_reservation(db, reservation_id)

    reservation.status = ReservationStatus.CANCELLED
    reservation.cancelled_at = now_kst()

    slot.status = SlotStatus.OPEN
    slot.confirmed_reservation_id = None

    await recompute_member_last_used_date(db, member)
    await db.commit()


async def change_admin_assign(
    db: AsyncSession,
    reservation_id: int,
    *,
    member_id: Optional[int] = None,
    slot_id: Optional[int] = None,
) -> Reservation:
    if member_id is None and slot_id is None:
        raise_app_error("INVALID_CHANGE")

    reservation, old_slot, old_member = await _get_admin_assign_reservation(
        db, reservation_id
    )
    cycle_id = reservation.cycle_id

    new_member_id = member_id if member_id is not None else old_member.id
    new_slot_id = slot_id if slot_id is not None else old_slot.id

    if new_member_id == old_member.id and new_slot_id == old_slot.id:
        raise_app_error("INVALID_CHANGE")

    reservation.status = ReservationStatus.CANCELLED
    reservation.cancelled_at = now_kst()
    old_slot.status = SlotStatus.OPEN
    old_slot.confirmed_reservation_id = None
    await recompute_member_last_used_date(db, old_member)

    if new_slot_id != old_slot.id:
        await db.execute(
            select(Slot).where(Slot.id == new_slot_id).with_for_update()
        )
    new_slot = await _get_assignable_slot(db, new_slot_id, cycle_id)
    new_member = await _get_assignable_member(db, new_member_id, cycle_id)

    now = now_kst()
    new_reservation = Reservation(
        slot_id=new_slot.id,
        member_id=new_member.id,
        cycle_id=cycle_id,
        type=ReservationType.ADMIN_ASSIGN,
        status=ReservationStatus.CONFIRMED,
        applied_at=now,
        confirmed_at=now,
        confirmed_by=ConfirmedBy.ADMIN,
    )
    db.add(new_reservation)
    await db.flush()
    await _finalize_admin_assign(db, new_reservation, new_slot, new_member)
    await db.commit()
    await db.refresh(new_reservation)
    return new_reservation


def admin_assign_meta(cycle: ReservationCycle) -> dict:
    start, end = admin_assign_window(cycle)
    return {
        "canAdminAssign": can_admin_assign(cycle),
        "adminAssignFrom": format_kst_iso(start),
        "adminAssignUntil": format_kst_iso(end),
    }


async def _get_confirmed_admin_assign(
    db: AsyncSession, reservation_id: int
) -> tuple[Reservation, Slot, Member]:
    reservation = await db.get(Reservation, reservation_id)
    if not reservation:
        raise_app_error("NOT_FOUND", 404)
    if reservation.type != ReservationType.ADMIN_ASSIGN:
        raise_app_error("NOT_ADMIN_ASSIGN")
    if reservation.status != ReservationStatus.CONFIRMED:
        raise_app_error("NOT_CANCELABLE")

    slot = await db.get(Slot, reservation.slot_id)
    member = await db.get(Member, reservation.member_id)
    if not slot or not member:
        raise_app_error("NOT_FOUND", 404)
    return reservation, slot, member


async def admin_assign_mail_status(
    db: AsyncSession, reservation_id: int
) -> str:
    result = await db.execute(
        select(MailMessage)
        .where(MailMessage.reservation_id == reservation_id)
        .where(MailMessage.type == MailType.RESERVE_DONE_NORMAL)
        .order_by(MailMessage.created_at.desc())
        .limit(1)
    )
    mail = result.scalar_one_or_none()
    if not mail:
        return "pending"
    if mail.status == MailStatus.SENT:
        return "success"
    if mail.status in (MailStatus.FAILED, MailStatus.DEAD):
        return "fail"
    return "pending"


async def send_admin_assign_mail(db: AsyncSession, reservation_id: int) -> int:
    from app.services.mail import enqueue_mail

    reservation, slot, member = await _get_confirmed_admin_assign(db, reservation_id)
    dedupe_key = f"done:n:{reservation.id}"

    result = await db.execute(
        select(MailMessage).where(MailMessage.dedupe_key == dedupe_key)
    )
    existing = result.scalar_one_or_none()

    if existing:
        if existing.status == MailStatus.SENT:
            raise_app_error("MAIL_ALREADY_SENT")
        existing.status = MailStatus.PENDING
        mail_id = existing.id
    else:
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
            dedupe_key=dedupe_key,
        )
        if not mail:
            raise_app_error("MAIL_ALREADY_SENT")
        mail_id = mail.id

    await db.commit()
    return mail_id
