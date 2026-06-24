#!/usr/bin/env python3
"""로컬 테스트용 — 예약 신청 기간 임시 OPEN + 해당 주차 신청 데이터 초기화."""
from __future__ import annotations

import asyncio
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import delete, func, select

from app.core.time import now_kst, now_utc, to_kst
from app.database import AsyncSessionLocal
from app.models import CycleState, Member, Reservation, ReservationCycle, ReservationStatus, Slot, SlotStatus
from app.services.cycle import (
    apply_vacations_to_slots,
    create_cycle_for_week,
    get_active_cycle,
    week_monday,
)
from app.services.scheduler import job_open_cycle


async def clear_cycle_reservations(db, cycle_id: int) -> int:
    count_result = await db.execute(
        select(func.count()).select_from(Reservation).where(Reservation.cycle_id == cycle_id)
    )
    count = int(count_result.scalar_one())

    await db.execute(delete(Reservation).where(Reservation.cycle_id == cycle_id))
    slots = await db.execute(select(Slot).where(Slot.cycle_id == cycle_id))
    for slot in slots.scalars().all():
        slot.status = SlotStatus.OPEN
        slot.confirmed_reservation_id = None
    return count


async def force_open_cycle(db) -> ReservationCycle:
    await job_open_cycle(db)
    cycle = await get_active_cycle(db)
    if not cycle:
        monday = week_monday(now_kst().date() + timedelta(days=7))
        result = await db.execute(
            select(ReservationCycle).where(ReservationCycle.target_week_start == monday)
        )
        cycle = result.scalar_one_or_none()
        if not cycle:
            cycle = await create_cycle_for_week(db, monday, CycleState.BEFORE_OPEN)
            await apply_vacations_to_slots(db, cycle.id)

    now = now_kst()
    cycle.state = CycleState.OPEN
    cycle.opened_at = cycle.opened_at or now_utc()
    cycle.closed_at = None
    cycle.reapply_closed_at = None
    cycle.batch_close_done = False
    cycle.open_at = now - timedelta(hours=1)
    cycle.close_at = now + timedelta(days=7)
    cycle.reapply_open_at = now + timedelta(days=7, hours=1)
    cycle.reapply_close_at = now + timedelta(days=14)
    await apply_vacations_to_slots(db, cycle.id)
    await db.commit()
    await db.refresh(cycle)
    return cycle


async def recompute_member_last_used_dates(db) -> int:
    result = await db.execute(
        select(Reservation.member_id, func.max(Slot.slot_date).label("max_date"))
        .join(Slot, Slot.id == Reservation.slot_id)
        .where(Reservation.status == ReservationStatus.CONFIRMED)
        .group_by(Reservation.member_id)
    )
    confirmed_map = {row.member_id: row.max_date for row in result.all()}

    members = await db.execute(select(Member))
    updated = 0
    for member in members.scalars().all():
        new_date = confirmed_map.get(member.id)
        if member.last_used_date != new_date:
            member.last_used_date = new_date
            updated += 1
    return updated


async def reset_active_cycle() -> None:
    async with AsyncSessionLocal() as db:
        cycle = await get_active_cycle(db)
        if not cycle:
            result = await db.execute(
                select(ReservationCycle)
                .where(ReservationCycle.state == CycleState.OPEN)
                .order_by(ReservationCycle.target_week_start.desc())
                .limit(1)
            )
            cycle = result.scalar_one_or_none()
        if not cycle:
            print("[dev-open-reserve] 활성 사이클 없음 — 초기화할 데이터가 없습니다.")
            return

        removed = await clear_cycle_reservations(db, cycle.id)
        updated = await recompute_member_last_used_dates(db)
        await db.commit()

        print(
            f"[dev-open-reserve] cycle #{cycle.id} "
            f"({cycle.target_week_start} ~ {cycle.target_week_end}) state={cycle.state.value}"
        )
        print(f"  · 삭제한 예약: {removed}건")
        print(f"  · 마지막 이용일 재계산: {updated}명")


async def open_and_reset() -> None:
    async with AsyncSessionLocal() as db:
        cycle = await force_open_cycle(db)
        removed = await clear_cycle_reservations(db, cycle.id)
        await db.commit()

        print(
            f"[dev-open-reserve] OPEN cycle #{cycle.id} "
            f"({cycle.target_week_start} ~ {cycle.target_week_end})"
        )
        print(f"  · 신청 마감(임시): {to_kst(cycle.close_at).strftime('%Y-%m-%d %H:%M')} KST")
        print(f"  · 삭제한 예약: {removed}건")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="로컬 테스트용 예약 OPEN / 신청 데이터 초기화")
    parser.add_argument(
        "--reset-only",
        action="store_true",
        help="신청 데이터만 초기화 (기간 설정은 유지)",
    )
    args = parser.parse_args()

    if args.reset_only:
        asyncio.run(reset_active_cycle())
    else:
        asyncio.run(open_and_reset())
    print("[dev-open-reserve] Done.")


if __name__ == "__main__":
    main()
