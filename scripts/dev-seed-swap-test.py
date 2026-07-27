#!/usr/bin/env python3
"""교환제안 로컬 테스트용 — mock SSO 두 계정에 같은 주 확정 예약 2건을 준비한다.

사용:
  cd backend && .venv/bin/python ../scripts/dev-seed-swap-test.py

전제:
  - SSO_PROVIDER=mock
  - (선택) TRANSFER_WINDOW_BYPASS=1 + DEBUG=true — 수 17:00(close_at) 창을 건너뛰고 싶을 때
  - DB 마이그레이션 적용됨 (0016_swap_proposal)
  - 브라우저에서 mock SSO로 김민수 / 이유나 로그인 가능

이 스크립트는 close_at 을 과거로 당겨 창을 열어 두므로,
bypass 없이도 시드 직후 [교환 제안] 버튼이 활성화된다.
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import delete, or_, select

from app.core.time import KST, now_kst
from app.database import AsyncSessionLocal
from app.models import (
    ConfirmedBy,
    CycleState,
    Member,
    MemberStatus,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    ReservationType,
    Slot,
    SlotStatus,
    SwapProposal,
)
from app.services.cycle import (
    apply_vacations_to_slots,
    create_cycle_for_week,
    get_active_cycle,
    week_monday,
)
from app.services.scheduler import job_open_cycle

MOCK_USERS = [
    {
        "email": "minsu.kim@ibank.co.kr",
        "name": "김민수",
        "entra_oid": "mock-001",
        "department": "디지털혁신부",
        "position": "과장",
    },
    {
        "email": "yuna.lee@ibank.co.kr",
        "name": "이유나",
        "entra_oid": "mock-002",
        "department": "인사팀",
        "position": "대리",
    },
]


async def ensure_member(db, spec: dict) -> Member:
    result = await db.execute(select(Member).where(Member.email == spec["email"]))
    member = result.scalar_one_or_none()
    if not member:
        member = Member(
            email=spec["email"],
            name=spec["name"],
            status=MemberStatus.ACTIVE,
            entra_oid=spec["entra_oid"],
            department=spec.get("department"),
            position=spec.get("position"),
        )
        db.add(member)
        await db.flush()
    else:
        member.name = spec["name"]
        member.status = MemberStatus.ACTIVE
        member.entra_oid = spec["entra_oid"]
        member.department = spec.get("department")
        member.position = spec.get("position")
    return member


async def ensure_cycle_for_swap(db) -> ReservationCycle:
    """교환 창이 열린 사이클 — close_at 과거, 슬롯은 미래."""
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
    # 교환/양도 창 = 수 17:00(close_at) 이후
    if cycle.close_at > now:
        cycle.close_at = now - timedelta(hours=1)
    if cycle.reapply_close_at > now:
        cycle.reapply_close_at = now - timedelta(minutes=5)
    cycle.state = CycleState.CLOSED
    await db.commit()
    await db.refresh(cycle)
    return cycle


async def pick_future_slots(db, cycle: ReservationCycle, need: int = 2) -> list[Slot]:
    now = now_kst()
    result = await db.execute(
        select(Slot)
        .where(Slot.cycle_id == cycle.id)
        .where(Slot.is_vacation.is_(False))
        .order_by(Slot.slot_date, Slot.time_index)
    )
    picked: list[Slot] = []
    for slot in result.scalars().all():
        start = datetime.combine(slot.slot_date, slot.start_time, tzinfo=KST)
        if start <= now:
            continue
        picked.append(slot)
        if len(picked) >= need:
            break
    return picked


async def clear_member_cycle_reservations(db, cycle_id: int, member_ids: list[int]) -> None:
    result = await db.execute(
        select(Reservation).where(
            Reservation.cycle_id == cycle_id,
            Reservation.member_id.in_(member_ids),
        )
    )
    reservations = list(result.scalars().all())
    res_ids = [r.id for r in reservations]
    if res_ids:
        await db.execute(
            delete(SwapProposal).where(
                or_(
                    SwapProposal.proposer_reservation_id.in_(res_ids),
                    SwapProposal.target_reservation_id.in_(res_ids),
                )
            )
        )
    slot_ids = {r.slot_id for r in reservations}
    for r in reservations:
        await db.delete(r)
    await db.flush()
    for slot_id in slot_ids:
        slot = await db.get(Slot, slot_id)
        if not slot:
            continue
        still = await db.execute(
            select(Reservation.id)
            .where(Reservation.slot_id == slot_id)
            .where(Reservation.status == ReservationStatus.CONFIRMED)
            .limit(1)
        )
        if still.scalar_one_or_none() is None:
            slot.status = SlotStatus.OPEN
            slot.confirmed_reservation_id = None


async def confirm_on_slot(db, *, slot: Slot, member: Member) -> Reservation:
    # 기존 확정이 있으면 비움 (테스트 전용)
    if slot.confirmed_reservation_id:
        old = await db.get(Reservation, slot.confirmed_reservation_id)
        if old:
            old.status = ReservationStatus.CANCELLED
            old.cancelled_at = now_kst()
        slot.confirmed_reservation_id = None
        slot.status = SlotStatus.OPEN
        await db.flush()

    now = now_kst()
    reservation = Reservation(
        slot_id=slot.id,
        member_id=member.id,
        cycle_id=slot.cycle_id,
        type=ReservationType.NORMAL,
        status=ReservationStatus.CONFIRMED,
        applied_at=now,
        confirmed_at=now,
        confirmed_by=ConfirmedBy.ADMIN,
    )
    db.add(reservation)
    await db.flush()
    slot.status = SlotStatus.CONFIRMED
    slot.confirmed_reservation_id = reservation.id
    return reservation


async def main() -> None:
    async with AsyncSessionLocal() as db:
        members = [await ensure_member(db, spec) for spec in MOCK_USERS]
        cycle = await ensure_cycle_for_swap(db)
        slots = await pick_future_slots(db, cycle, need=2)
        if len(slots) < 2:
            print(
                "[dev-seed-swap-test] FAIL: 미래 슬롯이 2개 미만입니다. "
                "사이클 주차(target_week)가 이미 지났을 수 있습니다."
            )
            return

        await clear_member_cycle_reservations(
            db, cycle.id, [m.id for m in members]
        )
        r1 = await confirm_on_slot(db, slot=slots[0], member=members[0])
        r2 = await confirm_on_slot(db, slot=slots[1], member=members[1])
        await db.commit()

        def label(slot: Slot) -> str:
            return (
                f"{slot.slot_date.isoformat()} "
                f"{slot.start_time.strftime('%H:%M')}-{slot.end_time.strftime('%H:%M')}"
            )

        print("[dev-seed-swap-test] Ready")
        print(f"  cycle_id={cycle.id}  close_at={cycle.close_at}")
        print(
            f"  {members[0].name} ({members[0].email}) "
            f"reservation#{r1.id} @ {label(slots[0])}"
        )
        print(
            f"  {members[1].name} ({members[1].email}) "
            f"reservation#{r2.id} @ {label(slots[1])}"
        )
        print("  로그인: mock SSO → 김민수 / 이유나")
        print("  마이페이지에서 [교환 제안] → 상대 선택 → 다른 계정으로 수락")


if __name__ == "__main__":
    asyncio.run(main())
