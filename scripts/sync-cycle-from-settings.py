#!/usr/bin/env python3
"""운영 설정 기준 주차 일정 재계산 + state 동기화 + 신청·메일 초기화."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import delete, func, select

from app.core.time import now_kst, to_kst
from app.database import AsyncSessionLocal
from app.models import (
    CycleState,
    MailMessage,
    Member,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    Slot,
    SlotStatus,
)
from app.services.cycle import (
    apply_vacations_to_slots,
    compute_cycle_state,
    compute_cycle_times,
    get_active_cycle,
    get_settings_map,
)


async def get_target_cycle(db) -> ReservationCycle | None:
    cycle = await get_active_cycle(db)
    if cycle:
        return cycle
    result = await db.execute(
        select(ReservationCycle).order_by(ReservationCycle.target_week_start.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def clear_cycle_data(db, cycle_id: int) -> tuple[int, int]:
    res_count = int(
        (
            await db.execute(
                select(func.count()).select_from(Reservation).where(Reservation.cycle_id == cycle_id)
            )
        ).scalar_one()
    )
    mail_count = int(
        (
            await db.execute(
                select(func.count()).select_from(MailMessage).where(MailMessage.cycle_id == cycle_id)
            )
        ).scalar_one()
    )

    await db.execute(delete(Reservation).where(Reservation.cycle_id == cycle_id))
    await db.execute(delete(MailMessage).where(MailMessage.cycle_id == cycle_id))

    slots = await db.execute(select(Slot).where(Slot.cycle_id == cycle_id))
    for slot in slots.scalars().all():
        slot.status = SlotStatus.OPEN
        slot.confirmed_reservation_id = None

    return res_count, mail_count


async def recompute_member_last_used_dates(db) -> int:
    """확정 예약 기준으로 회원별 마지막 이용일 재계산 (없으면 NULL)."""
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


def sync_cycle_flags(cycle: ReservationCycle, state: CycleState) -> None:
    cycle.state = state
    cycle.batch_close_done = False
    cycle.closed_at = None
    cycle.reapply_closed_at = None
    if state == CycleState.BEFORE_OPEN:
        cycle.opened_at = None
    elif to_kst(cycle.open_at) <= now_kst():
        cycle.opened_at = cycle.open_at


async def sync_cycle_from_settings() -> None:
    async with AsyncSessionLocal() as db:
        cycle = await get_target_cycle(db)
        if not cycle:
            print("[sync-cycle] 대상 사이클 없음")
            return

        settings = await get_settings_map(db)
        times = compute_cycle_times(cycle.target_week_start, settings)

        cycle.open_at = times["open_at"]
        cycle.close_at = times["close_at"]
        cycle.reapply_open_at = times["reapply_open_at"]
        cycle.reapply_close_at = times["reapply_close_at"]

        state = compute_cycle_state(cycle)
        sync_cycle_flags(cycle, state)

        removed_res, removed_mail = await clear_cycle_data(db, cycle.id)
        updated_members = await recompute_member_last_used_dates(db)
        await apply_vacations_to_slots(db, cycle.id)
        await db.commit()

        print(f"[sync-cycle] cycle #{cycle.id} ({cycle.target_week_start} ~ {cycle.target_week_end})")
        print(f"  · state={state.value}")
        print(f"  · open_at={to_kst(cycle.open_at).strftime('%Y-%m-%d %H:%M')} KST")
        print(f"  · close_at={to_kst(cycle.close_at).strftime('%Y-%m-%d %H:%M')} KST")
        print(
            f"  · reapply={to_kst(cycle.reapply_open_at).strftime('%Y-%m-%d %H:%M')}"
            f" ~ {to_kst(cycle.reapply_close_at).strftime('%Y-%m-%d %H:%M')} KST"
        )
        print(f"  · 삭제한 예약: {removed_res}건")
        print(f"  · 삭제한 메일: {removed_mail}건")
        print(f"  · 마지막 이용일 재계산: {updated_members}명")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="주차 일정 동기화 + 신청·메일 초기화")
    parser.add_argument(
        "--last-used-only",
        action="store_true",
        help="회원 마지막 이용일만 확정 예약 기준으로 재계산",
    )
    args = parser.parse_args()

    if args.last_used_only:
        asyncio.run(recompute_last_used_only())
    else:
        asyncio.run(sync_cycle_from_settings())
    print("[sync-cycle] Done.")


async def recompute_last_used_only() -> None:
    async with AsyncSessionLocal() as db:
        updated = await recompute_member_last_used_dates(db)
        await db.commit()
        print(f"[sync-cycle] 마지막 이용일 재계산: {updated}명")


if __name__ == "__main__":
    main()
