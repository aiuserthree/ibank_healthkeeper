from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class KoreanPublicHoliday(Base):
    __tablename__ = "korean_public_holiday"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    holiday_date: Mapped[date] = mapped_column(Date, nullable=False)
    date_name: Mapped[str] = mapped_column(String(100), nullable=False)
    sol_year: Mapped[int] = mapped_column(Integer, nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("uq_korean_public_holiday_date", "holiday_date", unique=True),
        Index("ix_korean_public_holiday_sol_year", "sol_year"),
    )
