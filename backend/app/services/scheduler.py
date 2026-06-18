from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import now_kst, to_kst
from app.models import (
    ConfirmedBy,
    CycleState,
    MailMessage,
    MailStatus,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    Slot,
    SlotStatus,
)
from app.services.admin import send_reapply_notice
from app.services.confirm import confirm_reservation
from app.services.cycle import (
    apply_vacations_to_slots,
    create_cycle_for_week,
    get_active_cycle,
    get_setting,
    week_monday,
)
from app.services.mail import drain_pending_mails, process_one_mail, retry_failed_mails
from app.services.priority import needs_manual, rank_applicants


async def job_precreate_cycle(db: AsyncSession) -> None:
    """J0: 차주 사이클을 BEFORE_OPEN 상태로 사전 생성 (휴가 등록용)."""
    monday = week_monday(now_kst().date() + timedelta(days=7))
    existing = await db.execute(
        select(ReservationCycle).where(ReservationCycle.target_week_start == monday)
    )
    cycle = existing.scalar_one_or_none()
    if cycle:
        return
    await create_cycle_for_week(db, monday, CycleState.BEFORE_OPEN)
    await db.commit()


async def job_open_cycle(db: AsyncSession) -> None:
    """수 09:00 — 오픈 시각이 지난 BEFORE_OPEN 사이클을 OPEN으로 전환 (재기동 catch-up 포함)."""
    monday = week_monday(now_kst().date() + timedelta(days=7))
    existing = await db.execute(
        select(ReservationCycle).where(ReservationCycle.target_week_start == monday)
    )
    if not existing.scalar_one_or_none():
        await create_cycle_for_week(db, monday, CycleState.BEFORE_OPEN)

    now = now_kst()
    result = await db.execute(
        select(ReservationCycle).where(ReservationCycle.state == CycleState.BEFORE_OPEN)
    )
    changed = False
    for cycle in result.scalars().all():
        if now < to_kst(cycle.open_at):
            continue
        await apply_vacations_to_slots(db, cycle.id)
        cycle.state = CycleState.OPEN
        cycle.opened_at = cycle.opened_at or now
        changed = True
    if changed:
        await db.commit()


async def job_close_batch(db: AsyncSession) -> None:
    cycle = await get_active_cycle(db)
    if not cycle or cycle.batch_close_done:
        return

    cycle.state = CycleState.CLOSED
    cycle.closed_at = now_kst()
    cycle.batch_close_done = True

    confirm_mode = await get_setting(db, "confirm.mode", "MANUAL")

    slots = await db.execute(select(Slot).where(Slot.cycle_id == cycle.id))
    for slot in slots.scalars().all():
        if slot.status == SlotStatus.CONFIRMED or slot.is_vacation:
            continue
        applicants = await rank_applicants(db, slot.id)
        if not applicants:
            continue
        if len(applicants) == 1 and confirm_mode == "AUTO":
            await confirm_reservation(db, slot.id, applicants[0]["reservation_id"], ConfirmedBy.SYSTEM)
            continue
        if len(applicants) >= 2 and confirm_mode == "AUTO" and not await needs_manual(db, slot.id):
            await confirm_reservation(db, slot.id, applicants[0]["reservation_id"], ConfirmedBy.SYSTEM)
            continue
        if len(applicants) >= 2 and await needs_manual(db, slot.id):
            continue
        for app in applicants[1:] if len(applicants) > 1 else []:
            res = await db.get(Reservation, app["reservation_id"])
            if res and res.status == ReservationStatus.REQUESTED:
                res.status = ReservationStatus.DROPPED
                res.dropped_at = now_kst()

    await db.commit()

    for mail_id in drain_pending_mails():
        await process_one_mail(db, mail_id)


async def job_reapply_open(db: AsyncSession) -> None:
    """목 09:00 — 재신청 기간 오픈 + 탈락자 안내 메일 자동 발송."""
    from app.services.cycle import get_active_cycle

    cycle = await get_active_cycle(db)
    if not cycle or not cycle.batch_close_done:
        return
    if now_kst() < to_kst(cycle.reapply_open_at):
        return

    if cycle.state != CycleState.REAPPLY:
        cycle.state = CycleState.REAPPLY
        await db.flush()

    await send_reapply_notice(db, cycle.id)

    for mail_id in drain_pending_mails():
        await process_one_mail(db, mail_id)


async def job_reapply_close(db: AsyncSession) -> None:
    cycle = await get_active_cycle(db)
    if not cycle or cycle.state == CycleState.CLOSED:
        return
    if now_kst() < to_kst(cycle.reapply_close_at):
        return
    cycle.state = CycleState.CLOSED
    cycle.reapply_closed_at = now_kst()
    await db.commit()


async def job_mail_retry(db: AsyncSession) -> None:
    await retry_failed_mails(db)
    result = await db.execute(
        select(MailMessage.id).where(MailMessage.status == MailStatus.PENDING).limit(20)
    )
    for (mail_id,) in result.all():
        await process_one_mail(db, mail_id)
