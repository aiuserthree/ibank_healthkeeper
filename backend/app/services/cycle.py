from __future__ import annotations

from typing import Optional

import json
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import KST, now_kst, to_kst
from app.models import CycleState, OperationSetting, ReservationCycle, Slot, SlotStatus, Vacation

DEFAULT_SLOT_TIMES = [
    {"i": 1, "s": "13:30", "e": "14:00"},
    {"i": 2, "s": "14:30", "e": "15:00"},
    {"i": 3, "s": "15:30", "e": "16:00"},
    {"i": 4, "s": "16:30", "e": "17:00"},
]

DOW_MAP = {"MON": 0, "TUE": 1, "WED": 2, "THU": 3, "FRI": 4, "SAT": 5, "SUN": 6}


async def get_settings_map(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(OperationSetting))
    return {row.setting_key: row.setting_value for row in result.scalars().all()}


async def get_setting(db: AsyncSession, key: str, default: str = "") -> str:
    settings = await get_settings_map(db)
    return settings.get(key, default)


async def get_slot_times(db: AsyncSession) -> list[dict]:
    raw = await get_setting(db, "slot.times", json.dumps(DEFAULT_SLOT_TIMES))
    return json.loads(raw)


def parse_time(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


def next_weekday(from_dt: datetime, target_dow: int) -> date:
    d = from_dt.date()
    days_ahead = (target_dow - d.weekday()) % 7
    if days_ahead == 0 and from_dt.time() >= time(23, 59):
        days_ahead = 7
    return d + timedelta(days=days_ahead)


def week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def week_friday(monday: date) -> date:
    return monday + timedelta(days=4)


async def get_active_cycle(db: AsyncSession) -> Optional[ReservationCycle]:
    now = now_kst()
    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.state.in_([CycleState.OPEN, CycleState.REAPPLY]))
        .order_by(ReservationCycle.target_week_start.desc())
        .limit(1)
    )
    cycle = result.scalar_one_or_none()
    if cycle:
        return cycle
    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.open_at <= now)
        .where(ReservationCycle.reapply_close_at >= now)
        .order_by(ReservationCycle.target_week_start.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_admin_view_cycle(db: AsyncSession) -> Optional[ReservationCycle]:
    """관리자 예약/휴가 화면용 — OPEN/REAPPLY 중이면 해당 주차, 아니면 다음 오픈 예정 주차."""
    cycle = await get_active_cycle(db)
    if cycle:
        return cycle
    return await get_vacation_cycle(db)


async def resolve_system_state(db: AsyncSession) -> tuple[CycleState, Optional[ReservationCycle]]:
    cycle = await get_active_cycle(db)
    now = now_kst()
    if cycle:
        if now < to_kst(cycle.open_at):
            return CycleState.BEFORE_OPEN, cycle
        if now < to_kst(cycle.close_at):
            return CycleState.OPEN, cycle
        if now < to_kst(cycle.reapply_open_at):
            return CycleState.CLOSED, cycle
        if now < to_kst(cycle.reapply_close_at):
            return CycleState.REAPPLY, cycle
        return CycleState.CLOSED, cycle

    cycle = await get_vacation_cycle(db)
    if not cycle:
        result = await db.execute(
            select(ReservationCycle)
            .order_by(ReservationCycle.target_week_start.desc())
            .limit(1)
        )
        cycle = result.scalar_one_or_none()
    if not cycle:
        return CycleState.BEFORE_OPEN, None
    if now < to_kst(cycle.open_at):
        return CycleState.BEFORE_OPEN, cycle
    if now < to_kst(cycle.close_at):
        return CycleState.OPEN, cycle
    if now < to_kst(cycle.reapply_open_at):
        return CycleState.CLOSED, cycle
    if now < to_kst(cycle.reapply_close_at):
        return CycleState.REAPPLY, cycle
    return CycleState.CLOSED, cycle


def week_dates(monday: date) -> list[str]:
    return [(monday + timedelta(days=i)).isoformat() for i in range(5)]


async def get_vacation_cycle(db: AsyncSession) -> Optional[ReservationCycle]:
    """다음 오픈(수 09:00 KST) 전 휴가 등록 대상 사이클 — open_at이 아직 지나지 않은 가장 가까운 주차."""
    now = now_kst()
    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.state == CycleState.BEFORE_OPEN)
        .order_by(ReservationCycle.target_week_start.asc())
    )
    cycles = list(result.scalars().all())
    for cycle in cycles:
        if now < to_kst(cycle.open_at):
            return cycle
    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.open_at > now)
        .order_by(ReservationCycle.open_at.asc())
        .limit(1)
    )
    cycle = result.scalar_one_or_none()
    if cycle:
        return cycle
    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.state == CycleState.BEFORE_OPEN)
        .order_by(ReservationCycle.open_at.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_cycle_for_week(
    db: AsyncSession,
    target_monday: date,
    state: CycleState = CycleState.BEFORE_OPEN,
) -> ReservationCycle:
    settings = await get_settings_map(db)
    open_dow = DOW_MAP.get(settings.get("open.dow", "WED"), 2)
    reapply_start_dow = DOW_MAP.get(settings.get("reapply.start.dow", "THU"), 3)
    reapply_dow = DOW_MAP.get(settings.get("reapply.close.dow", "THU"), 3)
    open_time = parse_time(settings.get("open.time", "09:00"))
    close_time = parse_time(settings.get("close.time", "17:00"))
    reapply_start_time = parse_time(settings.get("reapply.start.time", "09:00"))
    reapply_time = parse_time(settings.get("reapply.close.time", "17:00"))

    prev_wed = target_monday - timedelta(days=(target_monday.weekday() - open_dow) % 7)
    if prev_wed >= target_monday:
        prev_wed -= timedelta(days=7)
    open_at = datetime.combine(prev_wed, open_time, tzinfo=KST)
    close_at = datetime.combine(prev_wed, close_time, tzinfo=KST)
    reapply_open = datetime.combine(
        prev_wed + timedelta(days=(reapply_start_dow - open_dow) % 7 or 1),
        reapply_start_time,
        tzinfo=KST,
    )
    reapply_close = datetime.combine(
        prev_wed + timedelta(days=(reapply_dow - open_dow) % 7 or 1),
        reapply_time,
        tzinfo=KST,
    )

    cycle = ReservationCycle(
        target_week_start=target_monday,
        target_week_end=week_friday(target_monday),
        open_at=open_at,
        close_at=close_at,
        reapply_open_at=reapply_open,
        reapply_close_at=reapply_close,
        state=state,
    )
    db.add(cycle)
    await db.flush()

    slot_times = await get_slot_times(db)
    for day_offset in range(5):
        slot_date = target_monday + timedelta(days=day_offset)
        for st in slot_times:
            db.add(
                Slot(
                    cycle_id=cycle.id,
                    slot_date=slot_date,
                    time_index=st["i"],
                    start_time=parse_time(st["s"]),
                    end_time=parse_time(st["e"]),
                    is_vacation=False,
                    status=SlotStatus.OPEN,
                )
            )
    await db.flush()
    return cycle


async def apply_vacations_to_slots(db: AsyncSession, cycle_id: int) -> None:
    result = await db.execute(select(Vacation).where(Vacation.cycle_id == cycle_id))
    vacation_dates = {v.vacation_date for v in result.scalars().all()}
    slots = await db.execute(select(Slot).where(Slot.cycle_id == cycle_id))
    for slot in slots.scalars().all():
        slot.is_vacation = slot.slot_date in vacation_dates
