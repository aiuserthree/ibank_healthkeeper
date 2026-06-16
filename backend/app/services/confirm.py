from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import now_kst
from app.models import (
    ConfirmedBy,
    CycleState,
    MailType,
    Member,
    Reservation,
    ReservationStatus,
    Slot,
    SlotStatus,
)
from app.services.mail import enqueue_mail, queue_mail_after_commit
from app.services.priority import rank_applicants


async def confirm_reservation(
    db: AsyncSession,
    slot_id: int,
    reservation_id: int,
    confirmed_by: ConfirmedBy = ConfirmedBy.ADMIN,
) -> Reservation:
    slot_result = await db.execute(select(Slot).where(Slot.id == slot_id).with_for_update())
    slot = slot_result.scalar_one_or_none()
    if not slot:
        raise_app_error("NOT_FOUND", 404)
    if slot.status == SlotStatus.CONFIRMED:
        raise_app_error("SLOT_ALREADY_CONFIRMED")

    reservation = await db.get(Reservation, reservation_id)
    if not reservation or reservation.slot_id != slot_id:
        raise_app_error("NOT_FOUND", 404)
    if reservation.status != ReservationStatus.REQUESTED:
        raise_app_error("SLOT_ALREADY_CONFIRMED")

    reservation.status = ReservationStatus.CONFIRMED
    reservation.confirmed_at = now_kst()
    reservation.confirmed_by = confirmed_by
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
                "slotDate": slot.slot_date.isoformat(),
                "slotTime": f"{slot.start_time.strftime('%H:%M')} – {slot.end_time.strftime('%H:%M')}",
            },
            dedupe_key=f"done:{prefix}:{reservation.id}",
        )
        if mail:
            queue_mail_after_commit(mail.id)

    await db.commit()
    await db.refresh(reservation)
    return reservation


async def get_slot_detail(db: AsyncSession, slot_id: int) -> dict:
    slot = await db.get(Slot, slot_id)
    if not slot:
        raise_app_error("NOT_FOUND", 404)
    applicants = await rank_applicants(db, slot_id, requested_only=False)
    no_history_cnt = sum(1 for a in applicants if a["no_history"])
    needs_manual = len(applicants) >= 2 and no_history_cnt >= 2
    return {
        "slot": {
            "id": slot.id,
            "slotDate": slot.slot_date.isoformat(),
            "timeIndex": slot.time_index,
            "startTime": slot.start_time.strftime("%H:%M"),
            "endTime": slot.end_time.strftime("%H:%M"),
            "status": slot.status.value,
            "isVacation": slot.is_vacation,
        },
        "applicants": applicants,
        "needsManual": needs_manual,
    }
