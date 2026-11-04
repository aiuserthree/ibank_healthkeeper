"""회원 본인 반납 — 확정된 예약을 시작 2시간 전까지 직접 내놓는다.

교환·양도할 사람이 없을 때 쓰는 마지막 방법이다.
- 확정(CONFIRMED) 예약만, 슬롯 시작 2시간 전까지
- 회원 1명당 캘린더 월(KST) 1회 (반납 시각 기준)
- 진행 중인 양도·교환 제안이 걸려 있으면 막는다
- 반납하면 슬롯이 빈자리가 된다: 재신청 기간이면 탈락자가 가져갈 수 있고,
  관리자는 관리자 지정으로 채울 수 있다(관리자 확정 취소와 같은 빈자리로 취급)
- 마지막 이용일을 다시 계산하므로 우선권 불이익은 없다
- 무적 쿠폰은 확정 때 이미 소멸돼 반납해도 돌려주지 않는다
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import KST, now_kst, to_kst
from app.models import (
    Member,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    Slot,
    SlotStatus,
)
from app.services.admin_assign import recompute_member_last_used_date
from app.services.transfer import calendar_month_bounds_kst

RETURN_DEADLINE = timedelta(hours=2)
MONTHLY_RETURN_LIMIT = 1


def return_deadline_dt(slot: Slot) -> datetime:
    return datetime.combine(slot.slot_date, slot.start_time, tzinfo=KST) - RETURN_DEADLINE


def can_return_slot(slot: Slot, now: datetime | None = None) -> bool:
    now = to_kst(now or now_kst())
    return now < return_deadline_dt(slot)


async def count_monthly_returns(
    db: AsyncSession, member_id: int, *, now: datetime | None = None
) -> int:
    start, end = calendar_month_bounds_kst(now)
    result = await db.execute(
        select(func.count())
        .select_from(Reservation)
        .where(Reservation.member_id == member_id)
        .where(Reservation.returned_at.isnot(None))
        .where(Reservation.returned_at >= start)
        .where(Reservation.returned_at < end)
    )
    return int(result.scalar_one() or 0)


async def return_reservation(
    db: AsyncSession, member: Member, reservation_id: int
) -> tuple[Reservation, Slot, list[int]]:
    from app.services.swap import has_pending_swap_involving
    from app.services.teams import enqueue_reservation_returned_admin_notices
    from app.services.transfer import _has_pending_transfer

    row = (
        await db.execute(
            select(Reservation, ReservationCycle)
            .join(ReservationCycle, ReservationCycle.id == Reservation.cycle_id)
            .where(Reservation.id == reservation_id)
            .where(Reservation.member_id == member.id)
            .with_for_update(of=Reservation)
        )
    ).one_or_none()
    if not row:
        raise_app_error("NOT_FOUND", 404)
    reservation, cycle = row

    slot = (
        await db.execute(select(Slot).where(Slot.id == reservation.slot_id).with_for_update())
    ).scalar_one()

    if reservation.status != ReservationStatus.CONFIRMED:
        raise_app_error("NOT_RETURNABLE")
    if slot.confirmed_reservation_id != reservation.id:
        raise_app_error("NOT_RETURNABLE")
    now = now_kst()
    if not can_return_slot(slot, now):
        raise_app_error("RETURN_DEADLINE_PASSED")
    if await _has_pending_transfer(db, reservation.id) or await has_pending_swap_involving(
        db, reservation.id
    ):
        raise_app_error("RETURN_BLOCKED_PENDING")
    if await count_monthly_returns(db, member.id, now=now) >= MONTHLY_RETURN_LIMIT:
        raise_app_error("RETURN_MONTHLY_LIMIT")

    reservation.status = ReservationStatus.CANCELLED
    reservation.cancelled_at = now
    reservation.returned_at = now
    slot.status = SlotStatus.OPEN
    slot.confirmed_reservation_id = None
    await recompute_member_last_used_date(db, member)

    teams_message_ids = await enqueue_reservation_returned_admin_notices(
        db, reservation=reservation, member=member, slot=slot, cycle=cycle, now=now
    )
    await db.commit()
    return reservation, slot, teams_message_ids
