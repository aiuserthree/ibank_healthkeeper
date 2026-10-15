"""무적 쿠폰.

- 탈락 주(그 주에 탈락이 있고 결국 확정 예약이 없는 주) 5회마다 1장. 지난 기록도 소급하며,
  주차는 재신청 마감(목 17:00)이 지나야 확정된다. 월요일 15:30 미지정 자동 탈락도 포함.
- 배지 등급 월간 지급: 명예의 전당(100회) 매월 1장.
  누적되지 않고 매월 초기화(말일까지 쓰지 않으면 만료).
- 신청에 쓰면 그 시간대는 우선권 1순위, 쿠폰끼리는 신청 시각순.
  경합에서 지거나 마감 전에 신청을 취소하면 반환, 확정되면 소멸(확정 후 취소해도 반환 없음).
- 월요일 15:30 지정 슬롯과 재신청에는 쓸 수 없고, 쿠폰으로 얻은 예약은 양도·교환할 수 없다.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import KST, now_kst
from app.models import (
    Coupon,
    CouponSource,
    CouponStatus,
    Member,
    MemberStatus,
    Reservation,
    ReservationCycle,
    ReservationStatus,
)

DROP_WEEKS_PER_COUPON = 5

# (최소 누적 이용, 월간 지급 장수) — 배지 기준(web/_shared/ui.js USAGE_BADGES)과 같다.
BADGE_MONTHLY_QUOTA = ((100, 1),)


def badge_monthly_quota(total_uses: int) -> int:
    for min_uses, quota in BADGE_MONTHLY_QUOTA:
        if total_uses >= min_uses:
            return quota
    return 0


def _month_key(now: datetime) -> str:
    return f"{now.year:04d}-{now.month:02d}"


def _next_month_start(now: datetime) -> datetime:
    if now.month == 12:
        return datetime(now.year + 1, 1, 1, tzinfo=KST)
    return datetime(now.year, now.month + 1, 1, tzinfo=KST)


def _is_expired(coupon: Coupon, now: datetime) -> bool:
    return coupon.expires_at is not None and coupon.expires_at <= now


async def _drop_weeks(db: AsyncSession, member_id: int, *, finalized_only: bool) -> list[int]:
    """탈락 주 cycle id 목록 — 탈락이 있고 같은 주에 확정 예약이 없는 주."""
    now = now_kst()
    stmt = (
        select(Reservation.cycle_id)
        .join(ReservationCycle, ReservationCycle.id == Reservation.cycle_id)
        .where(Reservation.member_id == member_id)
        .where(Reservation.status == ReservationStatus.DROPPED)
        .distinct()
    )
    if finalized_only:
        stmt = stmt.where(ReservationCycle.reapply_close_at <= now)
    dropped = {row[0] for row in (await db.execute(stmt)).all()}
    if not dropped:
        return []
    confirmed = await db.execute(
        select(Reservation.cycle_id)
        .where(Reservation.member_id == member_id)
        .where(Reservation.cycle_id.in_(dropped))
        .where(Reservation.status == ReservationStatus.CONFIRMED)
        .distinct()
    )
    return sorted(dropped - {row[0] for row in confirmed.all()})


async def count_drop_weeks(db: AsyncSession, member_id: int) -> int:
    """확정된(재신청 마감이 지난) 탈락 주 수."""
    return len(await _drop_weeks(db, member_id, finalized_only=True))


async def _count_issued(db: AsyncSession, member_id: int, source: str, grant_month: str | None = None) -> int:
    stmt = (
        select(func.count())
        .select_from(Coupon)
        .where(Coupon.member_id == member_id)
        .where(Coupon.source == source)
    )
    if grant_month is not None:
        stmt = stmt.where(Coupon.grant_month == grant_month)
    return int((await db.execute(stmt)).scalar_one() or 0)


async def sync_member_coupons(db: AsyncSession, member: Member, *, total_uses: int | None = None) -> int:
    """만료 처리 + 탈락 주 쿠폰 + 이번 달 배지 쿠폰 발급. 새로 발급한 장수를 반환(커밋은 호출부)."""
    from app.services.legacy_usage import get_member_total_uses

    now = now_kst()
    expired = await db.execute(
        select(Coupon)
        .where(Coupon.member_id == member.id)
        .where(Coupon.status == CouponStatus.AVAILABLE)
        .where(Coupon.expires_at.isnot(None))
        .where(Coupon.expires_at <= now)
    )
    for coupon in expired.scalars().all():
        coupon.status = CouponStatus.EXPIRED

    issued = 0
    earned = (await count_drop_weeks(db, member.id)) // DROP_WEEKS_PER_COUPON
    for _ in range(max(0, earned - await _count_issued(db, member.id, CouponSource.DROP))):
        db.add(Coupon(member_id=member.id, source=CouponSource.DROP, status=CouponStatus.AVAILABLE, issued_at=now))
        issued += 1

    if total_uses is None:
        total_uses = await get_member_total_uses(db, member)
    month = _month_key(now)
    quota = badge_monthly_quota(total_uses)
    for _ in range(max(0, quota - await _count_issued(db, member.id, CouponSource.BADGE, month))):
        db.add(
            Coupon(
                member_id=member.id,
                source=CouponSource.BADGE,
                status=CouponStatus.AVAILABLE,
                grant_month=month,
                expires_at=_next_month_start(now),
                issued_at=now,
            )
        )
        issued += 1

    if issued:
        await db.flush()
    return issued


async def sync_all_member_coupons(db: AsyncSession) -> int:
    result = await db.execute(select(Member).where(Member.status == MemberStatus.ACTIVE))
    issued = 0
    for member in result.scalars().all():
        issued += await sync_member_coupons(db, member)
    await db.commit()
    return issued


async def _available_coupons(db: AsyncSession, member_id: int) -> list[Coupon]:
    now = now_kst()
    result = await db.execute(
        select(Coupon)
        .where(Coupon.member_id == member_id)
        .where(Coupon.status == CouponStatus.AVAILABLE)
        # 기한 있는 월간 쿠폰부터 쓴다.
        .order_by(Coupon.expires_at.asc().nulls_last(), Coupon.issued_at.asc(), Coupon.id.asc())
    )
    return [c for c in result.scalars().all() if not _is_expired(c, now)]


async def has_available_coupon(db: AsyncSession, member: Member) -> bool:
    await sync_member_coupons(db, member)
    return bool(await _available_coupons(db, member.id))


async def attach_coupon(db: AsyncSession, member: Member, reservation: Reservation) -> Coupon:
    """신청에 쿠폰을 건다 (마감 결과가 나올 때까지 RESERVED)."""
    await sync_member_coupons(db, member)
    coupons = await _available_coupons(db, member.id)
    if not coupons:
        raise_app_error("NO_COUPON")
    coupon = coupons[0]
    coupon.status = CouponStatus.RESERVED
    reservation.coupon_id = coupon.id
    return coupon


async def settle_coupon(db: AsyncSession, reservation: Reservation, *, confirmed: bool) -> None:
    """신청 결과에 따라 쿠폰 정리 — 확정이면 소멸, 탈락·취소면 반환(기한이 지났으면 만료)."""
    if not reservation.coupon_id:
        return
    coupon = await db.get(Coupon, reservation.coupon_id)
    if not coupon or coupon.status != CouponStatus.RESERVED:
        return
    now = now_kst()
    if confirmed:
        coupon.status = CouponStatus.USED
        coupon.used_at = now
    else:
        coupon.status = CouponStatus.EXPIRED if _is_expired(coupon, now) else CouponStatus.AVAILABLE


async def release_unsettled_coupons(db: AsyncSession, cycle_id: int) -> int:
    """주차가 끝났는데 확정·탈락 없이 남은 신청의 쿠폰 반환 (안전장치)."""
    result = await db.execute(
        select(Reservation)
        .where(Reservation.cycle_id == cycle_id)
        .where(Reservation.coupon_id.isnot(None))
        .where(Reservation.status != ReservationStatus.CONFIRMED)
    )
    count = 0
    for reservation in result.scalars().all():
        coupon = await db.get(Coupon, reservation.coupon_id)
        if coupon and coupon.status == CouponStatus.RESERVED:
            await settle_coupon(db, reservation, confirmed=False)
            count += 1
    return count


def _coupon_payload(coupon: Coupon) -> dict:
    from app.core.time import format_kst_iso

    return {
        "id": coupon.id,
        "source": coupon.source,
        "status": coupon.status,
        "grantMonth": coupon.grant_month,
        "expiresAt": format_kst_iso(coupon.expires_at) if coupon.expires_at else None,
        "issuedAt": format_kst_iso(coupon.issued_at) if coupon.issued_at else None,
        "usedAt": format_kst_iso(coupon.used_at) if coupon.used_at else None,
        "note": coupon.note,
    }


async def coupon_summary(db: AsyncSession, member: Member, *, total_uses: int | None = None) -> dict:
    """회원 화면용 — 보유·대기 쿠폰, 탈락 주 진행도, 이번 달 등급 지급 수."""
    from app.services.legacy_usage import get_member_total_uses

    if total_uses is None:
        total_uses = await get_member_total_uses(db, member)
    await sync_member_coupons(db, member, total_uses=total_uses)
    result = await db.execute(
        select(Coupon)
        .where(Coupon.member_id == member.id)
        .where(Coupon.status.in_((CouponStatus.AVAILABLE, CouponStatus.RESERVED)))
        .order_by(Coupon.expires_at.asc().nulls_last(), Coupon.issued_at.asc(), Coupon.id.asc())
    )
    active = list(result.scalars().all())
    used = await db.execute(
        select(func.count())
        .select_from(Coupon)
        .where(Coupon.member_id == member.id)
        .where(Coupon.status == CouponStatus.USED)
    )
    weeks = await count_drop_weeks(db, member.id)
    return {
        "available": sum(1 for c in active if c.status == CouponStatus.AVAILABLE),
        "reserved": sum(1 for c in active if c.status == CouponStatus.RESERVED),
        "used": int(used.scalar_one() or 0),
        "coupons": [_coupon_payload(c) for c in active],
        "dropWeeks": weeks,
        "dropProgress": weeks % DROP_WEEKS_PER_COUPON,
        "dropPerCoupon": DROP_WEEKS_PER_COUPON,
        "badgeMonthlyQuota": badge_monthly_quota(total_uses),
    }


async def drop_mail_coupon_line(db: AsyncSession, member_id: int, *, can_reapply: bool) -> str:
    """탈락 메일 한 줄 — 이번 주 탈락까지 반영한 진행도 (목 09:00 발송 기준)."""
    projected = await count_drop_weeks(db, member_id) + 1
    progress = projected % DROP_WEEKS_PER_COUPON
    if progress == 0:
        if can_reapply:
            return (
                "이번 탈락으로 <b>무적 쿠폰</b> 1장이 쌓일 차례예요. "
                "이번 주에 재신청하지 않으면 재신청 마감(목 17:00) 후 지급돼요."
            )
        return "이번 탈락으로 <b>무적 쿠폰</b> 1장이 지급돼요! (재신청 마감 목 17:00 이후) 다음 신청 때 써 보세요."
    line = (
        f"탈락 {progress}/{DROP_WEEKS_PER_COUPON} · "
        f"<b>무적 쿠폰</b>까지 {DROP_WEEKS_PER_COUPON - progress}회 남았어요."
    )
    if can_reapply:
        line += " 이번 주 재신청으로 이용하시면 이번 탈락은 횟수에서 빠져요."
    return line


# ── 관리자 ──────────────────────────────────────────────


async def admin_coupon_overview(db: AsyncSession) -> list[dict]:
    from app.services.avatar import admin_member_avatar_url
    from app.services.legacy_usage import get_member_total_uses

    members = (
        await db.execute(
            select(Member).where(Member.status == MemberStatus.ACTIVE).order_by(Member.name)
        )
    ).scalars().all()
    rows = []
    for member in members:
        total_uses = await get_member_total_uses(db, member)
        await sync_member_coupons(db, member, total_uses=total_uses)
        counts = dict(
            (
                await db.execute(
                    select(Coupon.status, func.count())
                    .where(Coupon.member_id == member.id)
                    .group_by(Coupon.status)
                )
            ).all()
        )
        weeks = await count_drop_weeks(db, member.id)
        if not counts and not weeks and not badge_monthly_quota(total_uses):
            continue
        rows.append(
            {
                "memberId": member.id,
                "name": member.name,
                "email": member.email,
                "department": member.department,
                "avatarUrl": admin_member_avatar_url(member.id),
                "totalUses": total_uses,
                "dropWeeks": weeks,
                "dropProgress": weeks % DROP_WEEKS_PER_COUPON,
                "badgeMonthlyQuota": badge_monthly_quota(total_uses),
                "available": counts.get(CouponStatus.AVAILABLE, 0),
                "reserved": counts.get(CouponStatus.RESERVED, 0),
                "used": counts.get(CouponStatus.USED, 0),
                "expired": counts.get(CouponStatus.EXPIRED, 0),
                "revoked": counts.get(CouponStatus.REVOKED, 0),
            }
        )
    await db.commit()
    rows.sort(key=lambda r: (-(r["available"] + r["reserved"]), -r["dropWeeks"], r["name"]))
    return rows


async def admin_member_coupons(db: AsyncSession, member_id: int) -> list[dict]:
    result = await db.execute(
        select(Coupon).where(Coupon.member_id == member_id).order_by(Coupon.issued_at.desc(), Coupon.id.desc())
    )
    return [_coupon_payload(c) for c in result.scalars().all()]


async def admin_grant_coupons(db: AsyncSession, member_id: int, count: int, note: str | None) -> int:
    member = await db.get(Member, member_id)
    if not member:
        raise_app_error("NOT_FOUND", 404)
    count = max(1, min(int(count or 1), 10))
    now = now_kst()
    for _ in range(count):
        db.add(
            Coupon(
                member_id=member_id,
                source=CouponSource.ADMIN,
                status=CouponStatus.AVAILABLE,
                note=(note or "").strip()[:200] or None,
                issued_at=now,
            )
        )
    await db.commit()
    return count


async def admin_revoke_coupon(db: AsyncSession, coupon_id: int) -> None:
    coupon = await db.get(Coupon, coupon_id)
    if not coupon:
        raise_app_error("NOT_FOUND", 404)
    if coupon.status != CouponStatus.AVAILABLE:
        raise_app_error("COUPON_NOT_REVOCABLE")
    coupon.status = CouponStatus.REVOKED
    await db.commit()
