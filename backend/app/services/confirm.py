from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import KST, now_kst
from app.models import (
    ConfirmedBy,
    MailType,
    Member,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    ReservationType,
    Slot,
    SlotStatus,
)
from app.services.cycle import can_admin_confirm
from app.services.korean_holidays import is_public_holiday
from app.services.legacy_usage import get_member_total_uses
from app.services.mail import enqueue_mail, queue_mail_after_commit
from app.services.priority import rank_applicants
from app.services.admin_assign import recompute_member_last_used_date


async def confirm_reservation(
    db: AsyncSession,
    slot_id: int,
    reservation_id: int,
    confirmed_by: ConfirmedBy = ConfirmedBy.ADMIN,
    *,
    force_designated: bool = False,
) -> Reservation:
    from app.services.designated_slot import is_designated_confirm_slot

    slot_result = await db.execute(select(Slot).where(Slot.id == slot_id).with_for_update())
    slot = slot_result.scalar_one_or_none()
    if not slot:
        raise_app_error("NOT_FOUND", 404)
    if slot.status == SlotStatus.CONFIRMED:
        raise_app_error("SLOT_ALREADY_CONFIRMED")
    if slot.is_vacation:
        raise_app_error("VACATION_SLOT")
    if is_public_holiday(slot.slot_date):
        raise_app_error("HOLIDAY_SLOT")
    if is_designated_confirm_slot(slot) and not force_designated:
        raise_app_error("DESIGNATED_SLOT_CONFIRM_ONLY")

    reservation = await db.get(Reservation, reservation_id)
    if not reservation or reservation.slot_id != slot_id:
        raise_app_error("NOT_FOUND", 404)
    # 지정 확정: 같은 슬롯 탈락자(DROPPED)도 확정 가능
    # (unique(slot, member) 때문에 신규 ADMIN_ASSIGN INSERT 불가)
    if reservation.status == ReservationStatus.DROPPED and force_designated:
        pass
    elif reservation.status != ReservationStatus.REQUESTED:
        raise_app_error("SLOT_ALREADY_CONFIRMED")

    cycle = await db.get(ReservationCycle, reservation.cycle_id)
    if (
        confirmed_by != ConfirmedBy.SYSTEM
        and cycle
        and not can_admin_confirm(cycle)
    ):
        raise_app_error("NOT_CONFIRMABLE_BEFORE_CLOSE")

    reservation.status = ReservationStatus.CONFIRMED
    reservation.confirmed_at = now_kst()
    reservation.confirmed_by = confirmed_by
    reservation.dropped_at = None
    reservation.is_priority = True

    slot.status = SlotStatus.CONFIRMED
    slot.confirmed_reservation_id = reservation.id

    member = await db.get(Member, reservation.member_id)
    if member and (member.last_used_date is None or slot.slot_date > member.last_used_date):
        member.last_used_date = slot.slot_date

    others = await db.execute(
        select(Reservation)
        .where(Reservation.slot_id == slot_id)
        .where(Reservation.id != reservation_id)
        .where(Reservation.status == ReservationStatus.REQUESTED)
    )
    for other in others.scalars().all():
        other.status = ReservationStatus.DROPPED
        other.dropped_at = now_kst()
        other.is_priority = False

    mail_type = (
        MailType.RESERVE_DONE_REAPPLY
        if reservation.type.value == "REAPPLY"
        else MailType.RESERVE_DONE_NORMAL
    )
    prefix = "r" if mail_type == MailType.RESERVE_DONE_REAPPLY else "n"
    if member:
        mail = await enqueue_mail(
            db,
            mail_type=mail_type,
            to_email=member.email,
            to_member_id=member.id,
            reservation_id=reservation.id,
            cycle_id=reservation.cycle_id,
            context={
                "name": member.name,
                "slotDate": slot.slot_date,
                "slotTime": f"{slot.start_time.strftime('%H:%M')} – {slot.end_time.strftime('%H:%M')}",
            },
            dedupe_key=f"done:{prefix}:{reservation.id}",
        )
        if mail:
            queue_mail_after_commit(mail.id)

    await db.commit()
    await db.refresh(reservation)
    return reservation


# 관리자 확정취소 허용 타입 (ADMIN_ASSIGN는 별도 cancel_admin_assign 경로)
_ADMIN_CANCEL_CONFIRMED_TYPES = (
    ReservationType.NORMAL,
    ReservationType.REAPPLY,
    ReservationType.TRANSFER,
)


async def cancel_confirmed_reservation(db: AsyncSession, reservation_id: int) -> None:
    """관리자 — 일반 신청 마감(close_at) 이후 확정 예약 취소 (NORMAL/REAPPLY/TRANSFER)."""
    reservation = await db.get(Reservation, reservation_id)
    if not reservation:
        raise_app_error("NOT_FOUND", 404)
    if reservation.status != ReservationStatus.CONFIRMED:
        raise_app_error("NOT_CANCELABLE")
    if reservation.type == ReservationType.ADMIN_ASSIGN:
        raise_app_error("NOT_ADMIN_ASSIGN")
    if reservation.type not in _ADMIN_CANCEL_CONFIRMED_TYPES:
        raise_app_error("NOT_CANCELABLE")

    cycle = await db.get(ReservationCycle, reservation.cycle_id)
    if not cycle or not can_admin_confirm(cycle):
        raise_app_error("NOT_ADMIN_CANCEL_BEFORE_CLOSE")

    slot_result = await db.execute(
        select(Slot).where(Slot.id == reservation.slot_id).with_for_update()
    )
    slot = slot_result.scalar_one_or_none()
    if not slot or slot.confirmed_reservation_id != reservation.id:
        raise_app_error("NOT_FOUND", 404)

    slot_start = datetime.combine(slot.slot_date, slot.start_time, tzinfo=KST)
    if now_kst() >= slot_start:
        raise_app_error("NOT_ADMIN_CANCEL_SLOT_PAST")

    member = await db.get(Member, reservation.member_id)
    if not member:
        raise_app_error("NOT_FOUND", 404)

    reservation.status = ReservationStatus.CANCELLED
    reservation.cancelled_at = now_kst()
    slot.status = SlotStatus.OPEN
    slot.confirmed_reservation_id = None

    await recompute_member_last_used_date(db, member)
    await db.commit()


async def restore_cancelled_reservation(db: AsyncSession, reservation_id: int) -> Reservation:
    """관리자 — 실수로 확정 취소한 일반(NORMAL) 예약 복구."""
    reservation = await db.get(Reservation, reservation_id)
    if not reservation:
        raise_app_error("NOT_FOUND", 404)
    if reservation.status != ReservationStatus.CANCELLED:
        raise_app_error("NOT_CANCELABLE")
    if reservation.type != ReservationType.NORMAL:
        raise_app_error("NOT_CANCELABLE")
    if not reservation.confirmed_at:
        raise_app_error("NOT_CANCELABLE")

    cycle = await db.get(ReservationCycle, reservation.cycle_id)
    if not cycle or not can_admin_confirm(cycle):
        raise_app_error("NOT_ADMIN_CANCEL_BEFORE_CLOSE")

    slot_result = await db.execute(
        select(Slot).where(Slot.id == reservation.slot_id).with_for_update()
    )
    slot = slot_result.scalar_one_or_none()
    if not slot:
        raise_app_error("NOT_FOUND", 404)
    if slot.status == SlotStatus.CONFIRMED:
        raise_app_error("SLOT_ALREADY_CONFIRMED")

    slot_start = datetime.combine(slot.slot_date, slot.start_time, tzinfo=KST)
    if now_kst() >= slot_start:
        raise_app_error("NOT_ADMIN_CANCEL_SLOT_PAST")

    reservation.status = ReservationStatus.CONFIRMED
    reservation.cancelled_at = None

    slot.status = SlotStatus.CONFIRMED
    slot.confirmed_reservation_id = reservation.id

    member = await db.get(Member, reservation.member_id)
    if member and (member.last_used_date is None or slot.slot_date > member.last_used_date):
        member.last_used_date = slot.slot_date

    await db.commit()
    await db.refresh(reservation)
    return reservation


async def get_slot_detail(db: AsyncSession, slot_id: int) -> dict:
    slot = await db.get(Slot, slot_id)
    if not slot:
        raise_app_error("NOT_FOUND", 404)
    applicants = await rank_applicants(db, slot_id, requested_only=False)
    for applicant in applicants:
        member = await db.get(Member, applicant["member_id"])
        applicant["total_uses"] = await get_member_total_uses(db, member) if member else 0
    from app.services.designated_slot import is_designated_confirm_slot

    cycle = await db.get(ReservationCycle, slot.cycle_id)
    designated = is_designated_confirm_slot(slot)
    return {
        "canConfirm": can_admin_confirm(cycle) if cycle else False,
        "isDesignatedConfirmSlot": designated,
        "slot": {
            "id": slot.id,
            "slotDate": slot.slot_date.isoformat(),
            "timeIndex": slot.time_index,
            "startTime": slot.start_time.strftime("%H:%M"),
            "endTime": slot.end_time.strftime("%H:%M"),
            "status": slot.status.value,
            "isVacation": slot.is_vacation,
            "isHoliday": is_public_holiday(slot.slot_date),
            "isDesignatedConfirmSlot": designated,
        },
        "applicants": applicants,
        # 이력 없음 복수 경합도 applied_at 순으로 자동 순위 — 수동 강제 없음
        "needsManual": False,
    }
