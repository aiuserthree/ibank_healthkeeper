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


def can_admin_confirm(cycle: ReservationCycle, now: datetime | None = None) -> bool:
    """일반 신청 마감(close_at) 이후에만 관리자 확정 허용."""
    now = now or now_kst()
    return now >= to_kst(cycle.close_at)


def admin_assign_window(cycle: ReservationCycle) -> tuple[datetime, datetime]:
    """관리자 빈 슬롯 지정 가능 구간: 일반 신청 마감(close_at, 기본 수 17:00) ~ 서비스 주 금요일 16:30."""
    start = to_kst(cycle.close_at)
    end = datetime.combine(cycle.target_week_end, time(16, 30), tzinfo=KST)
    return start, end


def can_admin_assign(cycle: ReservationCycle, now: datetime | None = None) -> bool:
    now = now or now_kst()
    start, end = admin_assign_window(cycle)
    return start <= now <= end


def compute_cycle_state(cycle: ReservationCycle, now: datetime | None = None) -> CycleState:
    """open_at/close_at 등 시각 기준 런타임 상태 (DB cycle.state 와 다를 수 있음)."""
    now = now or now_kst()
    if now < to_kst(cycle.open_at):
        return CycleState.BEFORE_OPEN
    if now < to_kst(cycle.close_at):
        return CycleState.OPEN
    if now < to_kst(cycle.reapply_open_at):
        return CycleState.CLOSED
    if now < to_kst(cycle.reapply_close_at):
        return CycleState.REAPPLY
    return CycleState.CLOSED


async def sync_cycle_state_if_due(db: AsyncSession, cycle: ReservationCycle) -> CycleState:
    """스케줄러 미실행 등으로 DB state 가 뒤처진 경우 보정."""
    computed = compute_cycle_state(cycle)
    now = now_kst()
    if computed == CycleState.OPEN and cycle.state == CycleState.BEFORE_OPEN:
        await apply_vacations_to_slots(db, cycle.id)
        cycle.state = CycleState.OPEN
        cycle.opened_at = cycle.opened_at or now
        await db.commit()
    elif computed != cycle.state and computed in (
        CycleState.CLOSED,
        CycleState.REAPPLY,
    ):
        cycle.state = computed
        await db.commit()
    return computed


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


async def get_prev_cycle_until_next_open(db: AsyncSession) -> Optional[ReservationCycle]:
    """재신청 마감 ~ 다음 오픈 전: 직전 신청 주차 (회원·관리자 공통)."""
    now = now_kst()
    next_result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.open_at > now)
        .order_by(ReservationCycle.open_at.asc())
        .limit(1)
    )
    next_cycle = next_result.scalar_one_or_none()
    if not next_cycle:
        return None
    prev_result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.target_week_start < next_cycle.target_week_start)
        .order_by(ReservationCycle.target_week_start.desc())
        .limit(1)
    )
    prev_cycle = prev_result.scalar_one_or_none()
    if prev_cycle is None:
        return None
    if now >= to_kst(prev_cycle.reapply_close_at) and now < to_kst(next_cycle.open_at):
        return prev_cycle
    return None


async def get_admin_view_cycle(db: AsyncSession) -> Optional[ReservationCycle]:
    """관리자 예약/재신청 화면용 — 진행 중 주차, 없으면 재신청 마감~다음 오픈 전 직전 주차."""
    cycle = await get_active_cycle(db)
    if cycle:
        return cycle
    gap_cycle = await get_prev_cycle_until_next_open(db)
    if gap_cycle:
        return gap_cycle
    return await get_vacation_cycle(db)


async def get_admin_reservation_cycles(db: AsyncSession) -> list[ReservationCycle]:
    """관리자 예약관리 화면에 표시할 사이클 (1~2개).

    신규 사이클 오픈(수 09:00) 후 대상 주 월요일 전까지: [신규 주차, 직전 주차]
    그 외: 단일 주차 (get_admin_view_cycle 과 동일)
    """
    now = now_kst()
    today = now.date()

    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.open_at <= now)
        .where(ReservationCycle.target_week_start > today)
        .order_by(ReservationCycle.target_week_start.asc())
        .limit(1)
    )
    upcoming = result.scalar_one_or_none()
    if upcoming:
        prev_monday = upcoming.target_week_start - timedelta(days=7)
        prev_result = await db.execute(
            select(ReservationCycle)
            .where(ReservationCycle.target_week_start == prev_monday)
            .limit(1)
        )
        prev = prev_result.scalar_one_or_none()
        if prev:
            return [upcoming, prev]
        return [upcoming]

    single = await get_admin_view_cycle(db)
    return [single] if single else []


async def resolve_system_state(db: AsyncSession) -> tuple[CycleState, Optional[ReservationCycle]]:
    """사용자 화면용 — 현재 시각(KST) 기준 표시 상태·대상 사이클."""
    cycle = await get_active_cycle(db)
    if cycle:
        state = await sync_cycle_state_if_due(db, cycle)
        return state, cycle

    now = now_kst()
    gap_cycle = await get_prev_cycle_until_next_open(db)
    if gap_cycle:
        return CycleState.CLOSED, gap_cycle

    next_result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.open_at > now)
        .order_by(ReservationCycle.open_at.asc())
        .limit(1)
    )
    next_cycle = next_result.scalar_one_or_none()
    if next_cycle:
        return CycleState.CLOSED, next_cycle

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
    state = await sync_cycle_state_if_due(db, cycle)
    return state, cycle


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


def _setting_dow(settings: dict[str, str], key: str, default: str) -> int:
    raw = str(settings.get(key, default)).strip().upper()
    return DOW_MAP.get(raw, DOW_MAP[default])


def _application_open_date(target_monday: date, open_dow: int) -> date:
    """대상 주 월요일 직전쪽 신청 오픈일 (예: 차주 월~금 → 직전 수요일)."""
    days_back = (target_monday.weekday() - open_dow) % 7
    if days_back == 0:
        days_back = 7
    open_date = target_monday - timedelta(days=days_back)
    if open_date >= target_monday:
        open_date -= timedelta(days=7)
    return open_date


def compute_cycle_times(target_monday: date, settings: dict[str, str]) -> dict[str, datetime]:
    """operation_setting 기준 해당 주차 오픈/마감/재신청 시각."""
    open_dow = _setting_dow(settings, "open.dow", "WED")
    reapply_start_dow = _setting_dow(settings, "reapply.start.dow", "THU")
    reapply_dow = _setting_dow(settings, "reapply.close.dow", "THU")
    open_time = parse_time(settings.get("open.time", "09:00"))
    close_time = parse_time(settings.get("close.time", "17:00"))
    reapply_start_time = parse_time(settings.get("reapply.start.time", "09:00"))
    reapply_time = parse_time(settings.get("reapply.close.time", "17:00"))

    open_date = _application_open_date(target_monday, open_dow)
    open_at = datetime.combine(open_date, open_time, tzinfo=KST)
    # 일반 신청 마감 = 오픈일과 같은 날 (수 09:00~17:00)
    close_at = datetime.combine(open_date, close_time, tzinfo=KST)
    reapply_open_at = datetime.combine(
        open_date + timedelta(days=(reapply_start_dow - open_dow) % 7 or 1),
        reapply_start_time,
        tzinfo=KST,
    )
    reapply_close_at = datetime.combine(
        open_date + timedelta(days=(reapply_dow - open_dow) % 7 or 1),
        reapply_time,
        tzinfo=KST,
    )
    return {
        "open_at": open_at,
        "close_at": close_at,
        "reapply_open_at": reapply_open_at,
        "reapply_close_at": reapply_close_at,
    }


async def create_cycle_for_week(
    db: AsyncSession,
    target_monday: date,
    state: CycleState = CycleState.BEFORE_OPEN,
) -> ReservationCycle:
    settings = await get_settings_map(db)
    times = compute_cycle_times(target_monday, settings)

    cycle = ReservationCycle(
        target_week_start=target_monday,
        target_week_end=week_friday(target_monday),
        open_at=times["open_at"],
        close_at=times["close_at"],
        reapply_open_at=times["reapply_open_at"],
        reapply_close_at=times["reapply_close_at"],
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
