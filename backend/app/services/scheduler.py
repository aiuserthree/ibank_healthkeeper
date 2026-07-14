from __future__ import annotations

import logging
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
from app.services.korean_holidays import is_public_holiday
from app.services.mail import drain_pending_mails, process_one_mail, retry_failed_mails
from app.services.public_holiday_sync import (
    default_sync_years,
    load_holiday_cache_from_db,
    sync_public_holidays_from_api,
)
from app.services.teams import (
    enqueue_due_reminders,
    enqueue_open_notice_broadcast,
    process_pending_teams_messages,
    resolve_scheduled_open_notice_cycle,
)
from app.services.priority import needs_manual, rank_applicants

logger = logging.getLogger(__name__)


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
    from app.services.designated_slot import is_designated_confirm_slot

    cycle = await get_active_cycle(db)
    if not cycle or cycle.batch_close_done:
        return

    cycle.state = CycleState.CLOSED
    cycle.closed_at = now_kst()
    cycle.batch_close_done = True

    confirm_mode = await get_setting(db, "confirm.mode", "MANUAL")

    slots = await db.execute(select(Slot).where(Slot.cycle_id == cycle.id))
    for slot in slots.scalars().all():
        if slot.status == SlotStatus.CONFIRMED or slot.is_vacation or is_public_holiday(slot.slot_date):
            continue
        # 월요일 15:30 — 자동 확정/탈락 없이 관리자 지정 대기
        if is_designated_confirm_slot(slot):
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


async def job_teams_reminder(db: AsyncSession) -> None:
    """확정 예약 시작 N분 전 Teams 1:1 채팅 알림."""
    await enqueue_due_reminders(db)
    await process_pending_teams_messages(db)


async def job_teams_open_notice(db: AsyncSession) -> None:
    """매주 수 08:55 — 차주 예약 오픈 5분 전 전체 회원 Teams 1:1 안내."""
    from app.config import get_settings

    settings = get_settings()
    if not settings.teams_open_notice_ready():
        return

    cycle = await resolve_scheduled_open_notice_cycle(db)
    if not cycle:
        return

    from app.core.time import to_kst

    notice_date = to_kst(cycle.open_at).date()
    enqueued, skipped = await enqueue_open_notice_broadcast(
        db, cycle, notice_date=notice_date
    )
    if enqueued or skipped:
        logger.info(
            "Teams open notice cycle=%s enqueued=%s skipped=%s",
            cycle.id,
            enqueued,
            skipped,
        )
    for _ in range(100):
        sent = await process_pending_teams_messages(db, limit=50)
        if sent == 0:
            break


async def job_sync_public_holidays(db: AsyncSession) -> None:
    """매주 화요일 — 공공데이터포털 공휴일 API 동기화."""
    from app.config import get_settings

    settings = get_settings()
    service_key = settings.public_data_portal_service_key.strip()
    if not service_key:
        logger.warning(
            "PUBLIC_DATA_PORTAL_SERVICE_KEY not set; skip public holiday sync"
        )
        await load_holiday_cache_from_db(db)
        return

    years = default_sync_years()
    try:
        count = await sync_public_holidays_from_api(db, service_key, years)
        logger.info("Public holiday sync complete years=%s count=%s", years, count)
    except Exception:
        logger.exception("Public holiday sync failed; keeping existing cache")
        await load_holiday_cache_from_db(db)


async def bootstrap_public_holidays(db: AsyncSession) -> None:
    """기동 시 DB 캐시 로드, 비어 있으면 API 초기 동기화."""
    from app.config import get_settings

    count = await load_holiday_cache_from_db(db)
    if count > 0:
        logger.info("Loaded %s public holidays from DB", count)
        return

    settings = get_settings()
    if not settings.public_data_portal_service_key.strip():
        logger.warning(
            "Public holiday DB empty and PUBLIC_DATA_PORTAL_SERVICE_KEY not set; "
            "using fallback holiday rules"
        )
        return

    await job_sync_public_holidays(db)
