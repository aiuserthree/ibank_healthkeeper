from __future__ import annotations

from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import format_kst_iso, now_kst
from app.models import (
    ConfirmedBy,
    CycleState,
    Member,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    ReservationType,
    Slot,
    SlotStatus,
    MailType,
)
from app.services.cycle import get_active_cycle, resolve_system_state
from app.services.korean_holidays import is_public_holiday
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
    from app.services.cycle import can_admin_confirm
    from app.services.designated_slot import is_designated_confirm_slot

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
    # 월 15:30 지정확정 슬롯: 수 17:00 마감 후에는 미지정이어도 캘린더에 확정됨으로 표시
    after_close = can_admin_confirm(cycle)

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
        holiday = is_public_holiday(slot.slot_date)
        confirmed = slot.status == SlotStatus.CONFIRMED
        if (
            not confirmed
            and after_close
            and is_designated_confirm_slot(slot)
            and not slot.is_vacation
            and not holiday
        ):
            confirmed = True
        items.append(
            {
                "id": slot.id,
                "slotDate": slot.slot_date.isoformat(),
                "timeIndex": slot.time_index,
                "startTime": slot.start_time.strftime("%H:%M"),
                "endTime": slot.end_time.strftime("%H:%M"),
                "isVacation": slot.is_vacation,
                "isHoliday": holiday,
                "status": slot.status.value,
                "requestCount": request_cnt,
                "mine": mine,
                "confirmed": confirmed,
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
    if is_public_holiday(slot.slot_date):
        raise_app_error("HOLIDAY_SLOT")
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
    """재신청 가능 빈 슬롯. 월요일 15:30 지정 확정 전용은 제외."""
    from app.services.designated_slot import is_designated_confirm_slot

    result = await db.execute(
        select(Slot)
        .where(Slot.cycle_id == cycle_id)
        .where(Slot.is_vacation.is_(False))
        .where(Slot.status != SlotStatus.CONFIRMED)
        .order_by(Slot.slot_date, Slot.time_index)
    )
    return [
        s
        for s in list(result.scalars().all())
        if not is_public_holiday(s.slot_date) and not is_designated_confirm_slot(s)
    ]


async def reapply_slot(db: AsyncSession, member: Member, slot_id: int) -> Reservation:
    from app.services.designated_slot import is_designated_confirm_slot

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
    if is_designated_confirm_slot(slot):
        raise_app_error("DESIGNATED_SLOT_CONFIRM_ONLY")
    if slot.is_vacation:
        raise_app_error("VACATION_SLOT")
    if is_public_holiday(slot.slot_date):
        raise_app_error("HOLIDAY_SLOT")
    if slot.status == SlotStatus.CONFIRMED:
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

    visible = Reservation.status != ReservationStatus.CANCELLED

    total_result = await db.execute(
        select(func.count())
        .select_from(Reservation)
        .where(Reservation.member_id == member.id)
        .where(visible)
    )
    total = int(total_result.scalar_one())

    active_total = await get_member_apply_total(db, member)

    result = await db.execute(
        select(Reservation, Slot, ReservationCycle)
        .join(Slot, Slot.id == Reservation.slot_id)
        .join(ReservationCycle, ReservationCycle.id == Reservation.cycle_id)
        .where(Reservation.member_id == member.id)
        .where(visible)
        .order_by(
            case((Reservation.status == ReservationStatus.REQUESTED, 0), else_=1),
            Reservation.applied_at.desc(),
            Slot.slot_date.desc(),
            Slot.time_index.desc(),
        )
        .offset(offset)
        .limit(page_size)
    )
    rows = result.all()
    confirmed_ids = [
        r.id
        for r, _, _ in rows
        if r.status == ReservationStatus.CONFIRMED
        and r.type in (ReservationType.NORMAL, ReservationType.REAPPLY)
    ]
    from app.services.transfer import (
        can_transfer_slot,
        get_pending_transfer_map,
        slot_start_dt,
        transfer_window_start,
    )

    pending_map = await get_pending_transfer_map(db, confirmed_ids)
    items = []
    state, active_cycle = await resolve_system_state(db)
    in_reapply = state == CycleState.REAPPLY
    active_cycle_id = active_cycle.id if active_cycle else None
    now = now_kst()
    for reservation, slot, cycle in rows:
        cancelable = (
            state == CycleState.OPEN
            and reservation.status == ReservationStatus.REQUESTED
            and reservation.type == ReservationType.NORMAL
        )
        pending = pending_map.get(reservation.id)
        # 양도 가능 대상(확정 + 일반/재신청 + 대기중인 양도 없음) — 시점(양도 창) 무관
        transfer_candidate = (
            reservation.status == ReservationStatus.CONFIRMED
            and reservation.type in (ReservationType.NORMAL, ReservationType.REAPPLY)
            and not pending
        )
        transferable = (
            transfer_candidate
            and can_transfer_slot(cycle, slot, now)
        )
        # 확정되었지만 양도 창(목 17:00)이 아직 열리지 않은 경우 —
        # 버튼은 노출하되 비활성 + 안내 문구로 언제부터 가능한지 보여준다 (정책 변경 없음, UX만)
        transfer_opens_at = None
        if transfer_candidate and not transferable:
            window_start = transfer_window_start(cycle)
            if now < window_start and now < slot_start_dt(slot):
                transfer_opens_at = format_kst_iso(window_start)
        reapply_available = (
            in_reapply
            and reservation.status == ReservationStatus.DROPPED
            and active_cycle_id is not None
            and reservation.cycle_id == active_cycle_id
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
                "transferable": transferable,
                "transferOpensAt": transfer_opens_at,
                "transferPending": bool(pending),
                "transferRecipientName": pending["recipientName"] if pending else None,
                "reapplyAvailable": reapply_available,
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
