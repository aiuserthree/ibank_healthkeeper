from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import now_kst
from app.models import (
    ConfirmedBy,
    CycleState,
    Member,
    Reservation,
    ReservationStatus,
    ReservationType,
    Slot,
    SlotStatus,
    MailType,
)
from app.services.cycle import get_active_cycle, resolve_system_state
from app.services.legacy_usage import get_member_apply_total
from app.services.mail import enqueue_mail, queue_mail_after_commit

ACTIVE_APPLY_STATUSES = (ReservationStatus.REQUESTED, ReservationStatus.CONFIRMED)


async def _member_cycle_active_apply(
    db: AsyncSession, member_id: int, cycle_id: int
) -> Reservation | None:
    result = await db.execute(
        select(Reservation)
        .where(Reservation.member_id == member_id)
        .where(Reservation.cycle_id == cycle_id)
        .where(Reservation.status.in_(ACTIVE_APPLY_STATUSES))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_calendar(db: AsyncSession, member: Member) -> dict:
    state, cycle = await resolve_system_state(db)
    if not cycle:
        return {"state": state.value, "cycleId": None, "weekApplied": False, "appliedSlotId": None, "slots": []}

    slots_result = await db.execute(
        select(Slot)
        .where(Slot.cycle_id == cycle.id)
        .order_by(Slot.slot_date, Slot.time_index)
    )
    slots = list(slots_result.scalars().all())

    res_result = await db.execute(
        select(Reservation)
        .where(Reservation.cycle_id == cycle.id)
        .where(Reservation.status.in_([ReservationStatus.REQUESTED, ReservationStatus.CONFIRMED]))
    )
    reservations = list(res_result.scalars().all())

    active_apply = await _member_cycle_active_apply(db, member.id, cycle.id)

    by_slot: dict[int, list[Reservation]] = {}
    for r in reservations:
        by_slot.setdefault(r.slot_id, []).append(r)

    items = []
    for slot in slots:
        slot_res = by_slot.get(slot.id, [])
        request_cnt = sum(1 for r in slot_res if r.status == ReservationStatus.REQUESTED)
        mine = any(
            r.member_id == member.id and r.status in ACTIVE_APPLY_STATUSES for r in slot_res
        )
        items.append(
            {
                "id": slot.id,
                "slotDate": slot.slot_date.isoformat(),
                "timeIndex": slot.time_index,
                "startTime": slot.start_time.strftime("%H:%M"),
                "endTime": slot.end_time.strftime("%H:%M"),
                "isVacation": slot.is_vacation,
                "status": slot.status.value,
                "requestCount": request_cnt,
                "mine": mine,
                "confirmed": slot.status == SlotStatus.CONFIRMED,
            }
        )
    return {
        "state": state.value,
        "cycleId": cycle.id,
        "weekApplied": active_apply is not None,
        "appliedSlotId": active_apply.slot_id if active_apply else None,
        "slots": items,
    }


async def apply_slot(db: AsyncSession, member: Member, slot_id: int) -> Reservation:
    state, cycle = await resolve_system_state(db)
    if state != CycleState.OPEN:
        raise_app_error("NOT_OPEN")

    slot = await db.get(Slot, slot_id)
    if not slot or not cycle or slot.cycle_id != cycle.id:
        raise_app_error("NOT_FOUND", 404)
    if slot.is_vacation:
        raise_app_error("VACATION_SLOT")
    if slot.status == SlotStatus.CONFIRMED:
        raise_app_error("SLOT_ALREADY_CONFIRMED")

    dup = await db.execute(
        select(Reservation)
        .where(Reservation.slot_id == slot_id)
        .where(Reservation.member_id == member.id)
        .where(Reservation.status != ReservationStatus.CANCELLED)
    )
    if dup.scalar_one_or_none():
        raise_app_error("DUPLICATE_APPLY")

    if await _member_cycle_active_apply(db, member.id, cycle.id):
        raise_app_error("WEEK_APPLY_LIMIT")

    reservation = Reservation(
        slot_id=slot_id,
        member_id=member.id,
        cycle_id=cycle.id,
        type=ReservationType.NORMAL,
        status=ReservationStatus.REQUESTED,
        applied_at=now_kst(),
    )
    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)
    return reservation


async def cancel_reservation(db: AsyncSession, member: Member, reservation_id: int) -> None:
    state, _ = await resolve_system_state(db)
    if state != CycleState.OPEN:
        raise_app_error("NOT_CANCELABLE")

    reservation = await db.get(Reservation, reservation_id)
    if not reservation or reservation.member_id != member.id:
        raise_app_error("NOT_FOUND", 404)
    if reservation.status != ReservationStatus.REQUESTED:
        raise_app_error("NOT_CANCELABLE")
    if reservation.type == ReservationType.REAPPLY:
        raise_app_error("NOT_CANCELABLE")

    reservation.status = ReservationStatus.CANCELLED
    reservation.cancelled_at = now_kst()
    await db.commit()


async def is_dropped_member(db: AsyncSession, member_id: int, cycle_id: int) -> bool:
    result = await db.execute(
        select(Reservation)
        .where(Reservation.member_id == member_id)
        .where(Reservation.cycle_id == cycle_id)
        .where(Reservation.status == ReservationStatus.DROPPED)
    )
    return result.scalar_one_or_none() is not None


async def get_empty_slots(db: AsyncSession, cycle_id: int) -> list[Slot]:
    result = await db.execute(
        select(Slot)
        .where(Slot.cycle_id == cycle_id)
        .where(Slot.is_vacation.is_(False))
        .where(Slot.status != SlotStatus.CONFIRMED)
        .order_by(Slot.slot_date, Slot.time_index)
    )
    return list(result.scalars().all())


async def reapply_slot(db: AsyncSession, member: Member, slot_id: int) -> Reservation:
    state, cycle = await resolve_system_state(db)
    if state != CycleState.REAPPLY or not cycle:
        raise_app_error("NOT_REAPPLY_PERIOD")
    if not await is_dropped_member(db, member.id, cycle.id):
        raise_app_error("NOT_DROPPED_USER", 403)

    slot_result = await db.execute(
        select(Slot).where(Slot.id == slot_id).with_for_update()
    )
    slot = slot_result.scalar_one_or_none()
    if not slot or slot.cycle_id != cycle.id:
        raise_app_error("NOT_FOUND", 404)
    if slot.is_vacation or slot.status == SlotStatus.CONFIRMED:
        raise_app_error("SLOT_ALREADY_CONFIRMED")

    if await _member_cycle_active_apply(db, member.id, cycle.id):
        raise_app_error("WEEK_APPLY_LIMIT")

    reservation = Reservation(
        slot_id=slot.id,
        member_id=member.id,
        cycle_id=cycle.id,
        type=ReservationType.REAPPLY,
        status=ReservationStatus.CONFIRMED,
        applied_at=now_kst(),
        confirmed_at=now_kst(),
        confirmed_by=ConfirmedBy.REAPPLY,
    )
    db.add(reservation)
    await db.flush()

    slot.status = SlotStatus.CONFIRMED
    slot.confirmed_reservation_id = reservation.id

    if member.last_used_date is None or slot.slot_date > member.last_used_date:
        member.last_used_date = slot.slot_date

    mail = await enqueue_mail(
        db,
        mail_type=MailType.RESERVE_DONE_REAPPLY,
        to_email=member.email,
        to_member_id=member.id,
        reservation_id=reservation.id,
        cycle_id=cycle.id,
        context={
            "name": member.name,
            "slotDate": slot.slot_date,
            "slotTime": f"{slot.start_time.strftime('%H:%M')} – {slot.end_time.strftime('%H:%M')}",
        },
        dedupe_key=f"done:r:{reservation.id}",
    )
    if mail:
        queue_mail_after_commit(mail.id)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise_app_error("SLOT_ALREADY_CONFIRMED")

    await db.refresh(reservation)
    return reservation


async def list_my_reservations(
    db: AsyncSession,
    member: Member,
    *,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 50)
    offset = (page - 1) * page_size

    total_result = await db.execute(
        select(func.count())
        .select_from(Reservation)
        .where(Reservation.member_id == member.id)
    )
    total = int(total_result.scalar_one())

    active_total = await get_member_apply_total(db, member)

    result = await db.execute(
        select(Reservation, Slot)
        .join(Slot, Slot.id == Reservation.slot_id)
        .where(Reservation.member_id == member.id)
        .order_by(Slot.slot_date.desc(), Slot.time_index.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = []
    state, _ = await resolve_system_state(db)
    for reservation, slot in result.all():
        cancelable = (
            state == CycleState.OPEN
            and reservation.status == ReservationStatus.REQUESTED
            and reservation.type == ReservationType.NORMAL
        )
        items.append(
            {
                "id": reservation.id,
                "slotDate": slot.slot_date.isoformat(),
                "timeIndex": slot.time_index,
                "startTime": slot.start_time.strftime("%H:%M"),
                "endTime": slot.end_time.strftime("%H:%M"),
                "type": reservation.type.value,
                "status": reservation.status.value,
                "cancelable": cancelable,
            }
        )

    total_pages = (total + page_size - 1) // page_size if total else 0
    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": total_pages,
        "activeTotal": active_total,
    }
