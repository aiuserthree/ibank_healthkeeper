#!/usr/bin/env python3
"""관리자 예약관리 데모 데이터(샘플 신청·확정) 삭제 및 슬롯 상태 복원."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import delete, select

from app.database import AsyncSessionLocal
from app.models import Member, Reservation, Slot, SlotStatus

DEMO_EMAILS = {
    "demo.minsu@healthkeeper.local",
    "demo.seoyeon@healthkeeper.local",
    "demo.jihoon@healthkeeper.local",
    "demo.yujin@healthkeeper.local",
    "demo.hyunwoo@healthkeeper.local",
    "demo.daeun@healthkeeper.local",
    "demo.jimin@healthkeeper.local",
    "demo.sehoon@healthkeeper.local",
    "demo.areum@healthkeeper.local",
    "demo.taemin@healthkeeper.local",
}


async def reset_demo_reservations() -> None:
    async with AsyncSessionLocal() as db:
        members_result = await db.execute(
            select(Member).where(Member.email.in_(DEMO_EMAILS))
        )
        demo_members = list(members_result.scalars().all())
        if not demo_members:
            print("[reset-demo] 데모 회원 없음 — 이미 초기화됨")
            return

        member_ids = [m.id for m in demo_members]
        res_result = await db.execute(
            select(Reservation).where(Reservation.member_id.in_(member_ids))
        )
        reservations = list(res_result.scalars().all())
        if not reservations:
            print("[reset-demo] 데모 예약 없음 — 이미 초기화됨")
            return

        slot_ids = {r.slot_id for r in reservations}
        cycle_ids = sorted({r.cycle_id for r in reservations})

        await db.execute(delete(Reservation).where(Reservation.member_id.in_(member_ids)))

        slots_result = await db.execute(select(Slot).where(Slot.id.in_(slot_ids)))
        for slot in slots_result.scalars().all():
            slot.status = SlotStatus.OPEN
            slot.confirmed_reservation_id = None

        await db.commit()

        print(
            f"[reset-demo] 삭제: 예약 {len(reservations)}건, "
            f"슬롯 {len(slot_ids)}개 복원, 주차 cycle_id={cycle_ids}"
        )
        for m in demo_members:
            print(f"  · {m.name} ({m.email})")


def main() -> None:
    asyncio.run(reset_demo_reservations())
    print("[reset-demo] Done.")


if __name__ == "__main__":
    main()
