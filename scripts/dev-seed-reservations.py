#!/usr/bin/env python3
"""개발용 예약 신청 샘플 데이터 — 관리자 예약관리 화면 테스트용 (멱등)."""
from __future__ import annotations

import asyncio
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import delete, select

from app.core.time import KST, now_kst, now_utc
from app.database import AsyncSessionLocal
from app.models import (
    CycleState,
    Member,
    MemberStatus,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    ReservationType,
    Slot,
    SlotStatus,
)
from app.services.cycle import (
    apply_vacations_to_slots,
    create_cycle_for_week,
    get_active_cycle,
    week_monday,
)
from app.services.scheduler import job_open_cycle

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

DEMO_MEMBERS = [
    ("demo.minsu@healthkeeper.local", "김민수", date(2025, 3, 11)),
    ("demo.seoyeon@healthkeeper.local", "이서연", date(2025, 5, 20)),
    ("demo.jihoon@healthkeeper.local", "박지훈", None),
    ("demo.yujin@healthkeeper.local", "최유진", date(2025, 4, 2)),
    ("demo.hyunwoo@healthkeeper.local", "정현우", date(2025, 4, 28)),
    ("demo.daeun@healthkeeper.local", "강다은", date(2025, 6, 1)),
    ("demo.jimin@healthkeeper.local", "한지민", date(2025, 2, 10)),
    ("demo.sehoon@healthkeeper.local", "오세훈", date(2025, 5, 1)),
    ("demo.areum@healthkeeper.local", "윤아름", date(2025, 5, 3)),
    ("demo.taemin@healthkeeper.local", "송태민", date(2025, 1, 15)),
]


def applied_at(hour: int, minute: int) -> datetime:
    dt = datetime.combine(now_kst().date(), time(hour, minute), tzinfo=KST)
    return dt.astimezone(timezone.utc)


async def ensure_open_cycle(db) -> ReservationCycle:
    await job_open_cycle(db)
    cycle = await get_active_cycle(db)
    if cycle:
        return cycle

    monday = week_monday(now_kst().date() + timedelta(days=7))
    result = await db.execute(
        select(ReservationCycle).where(ReservationCycle.target_week_start == monday)
    )
    cycle = result.scalar_one_or_none()
    if not cycle:
        cycle = await create_cycle_for_week(db, monday, CycleState.BEFORE_OPEN)
        await apply_vacations_to_slots(db, cycle.id)

    cycle.state = CycleState.OPEN
    cycle.opened_at = now_utc()
    if cycle.open_at > now_kst():
        cycle.open_at = now_kst() - timedelta(hours=1)
    await db.commit()
    await db.refresh(cycle)
    print(f"[dev-seed-reservations] Forced OPEN cycle #{cycle.id} ({cycle.target_week_start})")
    return cycle


async def get_or_create_member(db, email: str, name: str, last_used: date | None) -> Member:
    result = await db.execute(select(Member).where(Member.email == email))
    member = result.scalar_one_or_none()
    if not member:
        member = Member(
            email=email,
            name=name,
            status=MemberStatus.ACTIVE,
            last_used_date=last_used,
        )
        db.add(member)
        await db.flush()
    else:
        member.name = name
        member.status = MemberStatus.ACTIVE
        member.last_used_date = last_used
    return member


async def find_slot(db, cycle_id: int, day_offset: int, time_index: int) -> Slot | None:
    cycle = await db.get(ReservationCycle, cycle_id)
    if not cycle:
        return None
    slot_date = cycle.target_week_start + timedelta(days=day_offset)
    result = await db.execute(
        select(Slot)
        .where(Slot.cycle_id == cycle_id)
        .where(Slot.slot_date == slot_date)
        .where(Slot.time_index == time_index)
    )
    return result.scalar_one_or_none()


async def clear_cycle_reservations(db, cycle_id: int) -> None:
    """개발 시드 전 해당 주차 예약·슬롯 상태를 초기화 (슬롯당 확정 1명 규칙 유지)."""
    await db.execute(delete(Reservation).where(Reservation.cycle_id == cycle_id))
    slots = await db.execute(select(Slot).where(Slot.cycle_id == cycle_id))
    for slot in slots.scalars().all():
        slot.status = SlotStatus.OPEN
        slot.confirmed_reservation_id = None


async def add_reservation(
    db,
    *,
    slot: Slot,
    member: Member,
    status: ReservationStatus,
    res_type: ReservationType = ReservationType.NORMAL,
    applied: datetime | None = None,
) -> Reservation:
    reservation = Reservation(
        slot_id=slot.id,
        member_id=member.id,
        cycle_id=slot.cycle_id,
        type=res_type,
        status=status,
        applied_at=applied or now_utc(),
    )
    db.add(reservation)
    await db.flush()
    if status == ReservationStatus.CONFIRMED:
        slot.status = SlotStatus.CONFIRMED
        slot.confirmed_reservation_id = reservation.id
        reservation.confirmed_at = now_utc()
    return reservation


async def seed_reservations() -> None:
    async with AsyncSessionLocal() as db:
        cycle = await ensure_open_cycle(db)
        members = {}
        for email, name, last_used in DEMO_MEMBERS:
            members[email] = await get_or_create_member(db, email, name, last_used)

        await clear_cycle_reservations(db, cycle.id)

        # 월 — 13:30 중복 신청 2명
        slot = await find_slot(db, cycle.id, 0, 1)
        if slot and not slot.is_vacation:
            await add_reservation(
                db, slot=slot, member=members["demo.minsu@healthkeeper.local"],
                status=ReservationStatus.REQUESTED, applied=applied_at(9, 2),
            )
            await add_reservation(
                db, slot=slot, member=members["demo.seoyeon@healthkeeper.local"],
                status=ReservationStatus.REQUESTED, applied=applied_at(9, 5),
            )

        # 월 — 14:30 확정 1명
        slot = await find_slot(db, cycle.id, 0, 2)
        if slot and not slot.is_vacation:
            await add_reservation(
                db, slot=slot, member=members["demo.jihoon@healthkeeper.local"],
                status=ReservationStatus.CONFIRMED, applied=applied_at(9, 1),
            )

        # 월 — 15:30 중복 신청 3명
        slot = await find_slot(db, cycle.id, 0, 3)
        if slot and not slot.is_vacation:
            await add_reservation(
                db, slot=slot, member=members["demo.yujin@healthkeeper.local"],
                status=ReservationStatus.REQUESTED, applied=applied_at(9, 33),
            )
            await add_reservation(
                db, slot=slot, member=members["demo.hyunwoo@healthkeeper.local"],
                status=ReservationStatus.REQUESTED, applied=applied_at(10, 11),
            )
            await add_reservation(
                db, slot=slot, member=members["demo.daeun@healthkeeper.local"],
                status=ReservationStatus.REQUESTED, applied=applied_at(11, 40),
            )

        # 화 — 13:30 재신청 확정
        slot = await find_slot(db, cycle.id, 1, 1)
        if slot and not slot.is_vacation:
            await add_reservation(
                db, slot=slot, member=members["demo.jimin@healthkeeper.local"],
                status=ReservationStatus.CONFIRMED,
                res_type=ReservationType.REAPPLY,
                applied=applied_at(14, 5),
            )

        # 화 — 14:30 중복 신청 2명
        slot = await find_slot(db, cycle.id, 1, 2)
        if slot and not slot.is_vacation:
            await add_reservation(
                db, slot=slot, member=members["demo.sehoon@healthkeeper.local"],
                status=ReservationStatus.REQUESTED, applied=applied_at(9, 12),
            )
            await add_reservation(
                db, slot=slot, member=members["demo.areum@healthkeeper.local"],
                status=ReservationStatus.REQUESTED, applied=applied_at(9, 40),
            )

        # 월 — 16:30 탈락 1명 (재신청 메일 대상 — 탈락만 있는 회원)
        slot = await find_slot(db, cycle.id, 0, 4)
        if slot and not slot.is_vacation:
            await add_reservation(
                db, slot=slot, member=members["demo.taemin@healthkeeper.local"],
                status=ReservationStatus.DROPPED, applied=applied_at(12, 20),
            )

        # 화 — 15:30 취소 1명
        slot = await find_slot(db, cycle.id, 1, 3)
        if slot and not slot.is_vacation:
            res = await add_reservation(
                db, slot=slot, member=members["demo.seoyeon@healthkeeper.local"],
                status=ReservationStatus.CANCELLED, applied=applied_at(10, 0),
            )
            res.cancelled_at = now_utc()

        await db.commit()

        counts = await db.execute(
            select(Reservation.status, Reservation.id)
            .where(Reservation.cycle_id == cycle.id)
            .where(Reservation.member_id.in_([m.id for m in members.values()]))
        )
        rows = counts.all()
        print(
            f"[dev-seed-reservations] Cycle #{cycle.id} "
            f"({cycle.target_week_start} ~ {cycle.target_week_end}) "
            f"— demo reservations: {len(rows)}"
        )
        for status, _ in rows:
            print(f"  · {status.value}")


def main() -> None:
    asyncio.run(seed_reservations())
    print("[dev-seed-reservations] Done.")


if __name__ == "__main__":
    main()
