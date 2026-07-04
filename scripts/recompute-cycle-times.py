#!/usr/bin/env python3
"""reservation_cycle 오픈/마감 시각 재계산 (operation_setting 기준).

사용법:
  ./scripts/recompute-cycle-times.sh
  ./scripts/recompute-cycle-times.sh --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select

from app.core.time import format_kst_display, to_kst
from app.database import AsyncSessionLocal
from app.models import ReservationCycle
from app.services.cycle import compute_cycle_times, get_settings_map


async def main() -> int:
    parser = argparse.ArgumentParser(description="Recompute reservation_cycle schedule times")
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        settings = await get_settings_map(db)
        result = await db.execute(
            select(ReservationCycle).order_by(ReservationCycle.target_week_start)
        )
        cycles = list(result.scalars().all())
        if not cycles:
            print("No cycles found.")
            return 0

        print(f"open.dow = {settings.get('open.dow', 'WED')!r}")
        updated = 0
        for cycle in cycles:
            times = compute_cycle_times(cycle.target_week_start, settings)
            open_kst = to_kst(times["open_at"])
            close_kst = to_kst(times["close_at"])
            wd = ("월", "화", "수", "목", "금", "토", "일")
            print(
                f"cycle #{cycle.id} week {cycle.target_week_start}~{cycle.target_week_end} "
                f"-> open {format_kst_display(times['open_at'])} ({wd[open_kst.weekday()]}) "
                f"close {close_kst.strftime('%H:%M')}"
            )
            if not args.dry_run:
                cycle.open_at = times["open_at"]
                cycle.close_at = times["close_at"]
                cycle.reapply_open_at = times["reapply_open_at"]
                cycle.reapply_close_at = times["reapply_close_at"]
                updated += 1

        if args.dry_run:
            print(f"\nDry-run — {len(cycles)} cycle(s) previewed.")
            return 0

        await db.commit()
        print(f"\nUpdated {updated} cycle(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
