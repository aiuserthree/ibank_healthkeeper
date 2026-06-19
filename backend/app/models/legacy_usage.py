from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Date, DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LegacyUsage(Base):
    """2026년 이전 스케줄(엑셀)에서 이관한 이용 이력 — SSO 계정과 매칭해 last_used_date에 반영."""

    __tablename__ = "legacy_usage"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email_local: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)
    usage_start_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    source: Mapped[str] = mapped_column(String(50), default="2026_schedule", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_legacy_usage_email", "email"),
        Index("ix_legacy_usage_email_local", "email_local"),
        Index("ix_legacy_usage_name", "name"),
        Index("ix_legacy_usage_usage_date", "usage_date"),
    )
