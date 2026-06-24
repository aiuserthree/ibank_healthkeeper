from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import format_kst_iso
from app.models import Member, Reservation, ReservationStatus
from app.services.avatar import admin_member_avatar_url


async def rank_applicants(
    db: AsyncSession,
    slot_id: int,
    *,
    requested_only: bool = True,
) -> list[dict]:
    stmt = (
        select(
            Reservation.id.label("reservation_id"),
            Reservation.member_id,
            Reservation.applied_at,
            Reservation.type,
            Reservation.status,
            Member.name.label("member_name"),
            Member.email.label("member_email"),
            Member.last_used_date,
            func.row_number()
            .over(
                partition_by=Reservation.slot_id,
                order_by=(Member.last_used_date.asc().nulls_first(), Reservation.applied_at.asc()),
            )
            .label("priority_rank"),
        )
        .join(Member, Member.id == Reservation.member_id)
        .where(Reservation.slot_id == slot_id)
        .order_by("priority_rank")
    )
    if requested_only:
        stmt = stmt.where(Reservation.status == ReservationStatus.REQUESTED)
    else:
        stmt = stmt.where(Reservation.status != ReservationStatus.CANCELLED)
    result = await db.execute(stmt)
    rows = []
    for row in result.all():
        rows.append(
            {
                "reservation_id": row.reservation_id,
                "member_id": row.member_id,
                "member_name": row.member_name,
                "member_email": row.member_email,
                "applied_at": format_kst_iso(row.applied_at),
                "last_used_date": row.last_used_date.isoformat() if row.last_used_date else None,
                "no_history": row.last_used_date is None,
                "priority_rank": row.priority_rank,
                "type": row.type.value,
                "status": row.status.value,
                "avatarUrl": admin_member_avatar_url(row.member_id),
            }
        )
    return rows


async def needs_manual(db: AsyncSession, slot_id: int) -> bool:
    applicants = await rank_applicants(db, slot_id)
    if len(applicants) <= 1:
        return False
    no_history = sum(1 for a in applicants if a["no_history"])
    return no_history >= 2
