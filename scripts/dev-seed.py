#!/usr/bin/env python3
"""개발용 DB 부트스트랩 — 차주 BEFORE_OPEN 사이클 + 상태 동기화 (멱등)."""
from __future__ import annotations

import asyncio
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select

from app.core.time import now_kst
from app.database import AsyncSessionLocal
from app.models import CycleState, ReservationCycle
from app.services.cycle import (
    apply_vacations_to_slots,
    create_cycle_for_week,
    get_active_cycle,
    week_monday,
)
from app.services.scheduler import job_open_cycle, job_precreate_cycle


async def sync_premature_open_cycles(db) -> None:
    """open_at 이전인데 OPEN으로 올라간 사이클을 BEFORE_OPEN으로 되돌림."""
    now = now_kst()
    result = await db.execute(
        select(ReservationCycle).where(ReservationCycle.state == CycleState.OPEN)
    )
    for cycle in result.scalars().all():
        if cycle.open_at > now:
            cycle.state = CycleState.BEFORE_OPEN
            cycle.opened_at = None
            print(f"[dev-seed] Reset cycle #{cycle.id} ({cycle.target_week_start}) to BEFORE_OPEN")


async def ensure_dev_cycles() -> None:
    async with AsyncSessionLocal() as db:
        await sync_premature_open_cycles(db)
        await db.commit()

        await job_precreate_cycle(db)
        await job_open_cycle(db)

        active = await get_active_cycle(db)
        if active:
            print(
                f"[dev-seed] Active cycle #{active.id} "
                f"({active.target_week_start} ~ {active.target_week_end}) state={active.state.value}"
            )
        else:
            vac = await db.execute(
                select(ReservationCycle)
                .where(ReservationCycle.open_at > now_kst())
                .order_by(ReservationCycle.open_at.asc())
                .limit(1)
            )
            upcoming = vac.scalar_one_or_none()
            if upcoming:
                print(
                    f"[dev-seed] Upcoming cycle #{upcoming.id} "
                    f"({upcoming.target_week_start}) opens {upcoming.open_at} state={upcoming.state.value}"
                )

        next_monday = week_monday(now_kst().date() + timedelta(days=14))
        result = await db.execute(
            select(ReservationCycle).where(ReservationCycle.target_week_start == next_monday)
        )
        future = result.scalar_one_or_none()
        if not future:
            cycle = await create_cycle_for_week(db, next_monday, CycleState.BEFORE_OPEN)
            await apply_vacations_to_slots(db, cycle.id)
            await db.commit()
            print(f"[dev-seed] Created BEFORE_OPEN vacation cycle #{cycle.id} for {next_monday}")
        elif future.state == CycleState.BEFORE_OPEN:
            print(f"[dev-seed] Vacation cycle already exists: #{future.id} ({future.target_week_start})")
        else:
            print(f"[dev-seed] Future week cycle exists in state {future.state.value}, skipping")


def main() -> None:
    asyncio.run(ensure_dev_cycles())
    print("[dev-seed] Done.")


if __name__ == "__main__":
    main()
