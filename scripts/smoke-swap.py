#!/usr/bin/env python3
"""교환제안 서비스 스모크 테스트 (DB 직접). HTTP/브라우저 없이 핵심 플로우 검증."""
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
    SwapProposalStatus,
)
from app.services.cycle import (
    apply_vacations_to_slots,
    create_cycle_for_week,
    get_active_cycle,
    week_monday,
)
from app.services.scheduler import job_open_cycle
from app.services.swap import (
    accept_swap_proposal,
    cancel_swap_proposal,
    create_swap_proposal,
    reject_swap_proposal,
    search_swap_targets,
)

SMOKE_USERS = [
    {
        "email": "swap.smoke.a@ibank.co.kr",
        "name": "스모크갑",
        "entra_oid": "11111111-1111-1111-1111-111111111111",
    },
    {
        "email": "swap.smoke.b@ibank.co.kr",
        "name": "스모크을",
        "entra_oid": "22222222-2222-2222-2222-222222222222",
    },
]


async def ensure_member(db, spec: dict) -> Member:
    result = await db.execute(select(Member).where(Member.email == spec["email"]))
    m = result.scalar_one_or_none()
    if not m:
        m = Member(
            email=spec["email"],
            name=spec["name"],
            status=MemberStatus.ACTIVE,
            entra_oid=spec["entra_oid"],
            department="QA",
            position="테스터",
        )
        db.add(m)
        await db.flush()
    else:
        m.status = MemberStatus.ACTIVE
        m.entra_oid = spec["entra_oid"]
        m.name = spec["name"]
    return m


async def prepare(db) -> tuple[Member, Member, Reservation, Reservation, Slot, Slot]:
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
    await db.flush()

    a = await ensure_member(db, SMOKE_USERS[0])
    b = await ensure_member(db, SMOKE_USERS[1])

    # cleanup prior smoke reservations/swaps
    result = await db.execute(
        select(Reservation).where(
            Reservation.cycle_id == cycle.id,
            Reservation.member_id.in_([a.id, b.id]),
        )
    )
    old = list(result.scalars().all())
    old_ids = [r.id for r in old]
    if old_ids:
        await db.execute(
            delete(SwapProposal).where(
                or_(
                    SwapProposal.proposer_reservation_id.in_(old_ids),
                    SwapProposal.target_reservation_id.in_(old_ids),
                )
            )
        )
    for r in old:
        slot = await db.get(Slot, r.slot_id)
        await db.delete(r)
        if slot and slot.confirmed_reservation_id == r.id:
            slot.confirmed_reservation_id = None
            slot.status = SlotStatus.OPEN
    await db.flush()

    result = await db.execute(
        select(Slot)
        .where(Slot.cycle_id == cycle.id)
        .where(Slot.is_vacation.is_(False))
        .order_by(Slot.slot_date, Slot.time_index)
    )
    future = []
    for slot in result.scalars().all():
        start = datetime.combine(slot.slot_date, slot.start_time, tzinfo=KST)
        if start > now:
            future.append(slot)
        if len(future) >= 2:
            break
    if len(future) < 2:
        raise RuntimeError("not enough future slots")

    async def confirm(slot: Slot, member: Member) -> Reservation:
        if slot.confirmed_reservation_id:
            prev = await db.get(Reservation, slot.confirmed_reservation_id)
            if prev:
                prev.status = ReservationStatus.CANCELLED
                prev.cancelled_at = now
            slot.confirmed_reservation_id = None
        res = Reservation(
            slot_id=slot.id,
            member_id=member.id,
            cycle_id=cycle.id,
            type=ReservationType.NORMAL,
            status=ReservationStatus.CONFIRMED,
            applied_at=now,
            confirmed_at=now,
            confirmed_by=ConfirmedBy.ADMIN,
        )
        db.add(res)
        await db.flush()
        slot.status = SlotStatus.CONFIRMED
        slot.confirmed_reservation_id = res.id
        return res

    ra = await confirm(future[0], a)
    rb = await confirm(future[1], b)
    await db.commit()
    return a, b, ra, rb, future[0], future[1]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        a, b, ra, rb, sa, sb = await prepare(db)
        print(f"prepared A#{ra.id}@{sa.start_time} B#{rb.id}@{sb.start_time}")

        assert await search_swap_targets(db, a, ra.id) == [], "empty query must return no targets"
        targets = await search_swap_targets(db, a, ra.id, q=b.name)
        ids = {t["reservationId"] for t in targets}
        assert rb.id in ids, f"target missing from candidates: {targets}"
        print("search_ok", len(targets))

        swap, _ = await create_swap_proposal(db, a, ra.id, rb.id)
        assert swap.status == SwapProposalStatus.PENDING
        print("propose_ok", swap.id)

        # reject path then re-propose
        swap, _ = await reject_swap_proposal(db, b, swap.id)
        assert swap.status == SwapProposalStatus.REJECTED
        print("reject_ok")

        swap, _ = await create_swap_proposal(db, a, ra.id, rb.id)
        swap, _ = await cancel_swap_proposal(db, a, swap.id)
        assert swap.status == SwapProposalStatus.CANCELLED
        print("cancel_ok")

        swap, _ = await create_swap_proposal(db, a, ra.id, rb.id)
        swap, _, my_res = await accept_swap_proposal(db, b, swap.id)
        assert swap.status == SwapProposalStatus.ACCEPTED
        await db.refresh(ra)
        await db.refresh(rb)
        assert ra.slot_id == sb.id and rb.slot_id == sa.id
        assert my_res and my_res["id"] == rb.id
        print("accept_ok", "A now", ra.slot_id, "B now", rb.slot_id)
        print("SMOKE_PASS")


if __name__ == "__main__":
    asyncio.run(main())
