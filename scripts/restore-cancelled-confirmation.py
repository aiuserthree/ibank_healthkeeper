#!/usr/bin/env python3
"""확정 취소된 예약을 CONFIRMED 로 복구 (운영 긴급 복구용).

예:
  ./scripts/restore-cancelled-confirmation.py --reservation-id 177
  ./scripts/restore-cancelled-confirmation.py --name 이희권 --date 2026-07-13 --time 13:30
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Member, Reservation, Slot
from app.services.confirm import restore_cancelled_reservation


async def _resolve_reservation_id(
    db,
    *,
    reservation_id: int | None,
    name: str | None,
    slot_date: date | None,
    start_time: time | None,
) -> int:
    if reservation_id is not None:
        return reservation_id

    if not name or not slot_date or not start_time:
        raise SystemExit("Provide --reservation-id or (--name, --date, --time)")

    member = (
        await db.execute(select(Member).where(Member.name == name))
    ).scalar_one_or_none()
    if not member:
        raise SystemExit(f"Member not found: {name!r}")

    slot = (
        await db.execute(
            select(Slot)
            .where(Slot.slot_date == slot_date)
            .where(Slot.start_time == start_time)
        )
    ).scalar_one_or_none()
    if not slot:
        raise SystemExit(f"Slot not found: {slot_date} {start_time.strftime('%H:%M')}")

    reservation = (
        await db.execute(
            select(Reservation)
            .where(Reservation.member_id == member.id)
            .where(Reservation.slot_id == slot.id)
            .order_by(Reservation.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not reservation:
        raise SystemExit("No reservation for member/slot")
    return reservation.id


async def main() -> int:
    parser = argparse.ArgumentParser(description="Restore cancelled confirmed reservation")
    parser.add_argument("--reservation-id", type=int)
    parser.add_argument("--name")
    parser.add_argument("--date", type=str, help="YYYY-MM-DD")
    parser.add_argument("--time", type=str, help="HH:MM")
    args = parser.parse_args()

    slot_date = date.fromisoformat(args.date) if args.date else None
    start_time = None
    if args.time:
        h, m = args.time.split(":")
        start_time = time(int(h), int(m))

    async with AsyncSessionLocal() as db:
        rid = await _resolve_reservation_id(
            db,
            reservation_id=args.reservation_id,
            name=args.name,
            slot_date=slot_date,
            start_time=start_time,
        )
        reservation = await restore_cancelled_reservation(db, rid)
        print(
            f"OK reservation #{reservation.id} -> CONFIRMED "
            f"(member_id={reservation.member_id}, slot_id={reservation.slot_id})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
