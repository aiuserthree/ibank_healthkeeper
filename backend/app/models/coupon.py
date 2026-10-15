from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CouponSource:
    DROP = "DROP"  # 탈락 주 5회 누적마다
    BADGE = "BADGE"  # 배지 등급 월간 지급 (매월 초기화)
    ADMIN = "ADMIN"  # 관리자 수동 지급


class CouponStatus:
    AVAILABLE = "AVAILABLE"  # 보유
    RESERVED = "RESERVED"  # 신청에 걸려 마감 대기
    USED = "USED"  # 확정되어 소멸
    EXPIRED = "EXPIRED"  # 월간 쿠폰 기한 만료
    REVOKED = "REVOKED"  # 관리자 회수


class Coupon(Base):
    """무적 쿠폰 — 신청 시 사용하면 그 시간대 우선권 1순위 (쿠폰끼리는 신청 시각순)."""

    __tablename__ = "coupon"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=CouponStatus.AVAILABLE)
    grant_month: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    note: Mapped[Optional[str]] = mapped_column(String(200))
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_coupon_member_status", "member_id", "status"),
        Index("ix_coupon_member_source", "member_id", "source", "grant_month"),
    )
