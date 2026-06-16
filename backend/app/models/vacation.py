from __future__ import annotations

from typing import Optional

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Vacation(Base):
    __tablename__ = "vacation"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("reservation_cycle.id", ondelete="CASCADE"), nullable=False
    )
    vacation_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("admin_user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    cycle = relationship("ReservationCycle", back_populates="vacations")

    __table_args__ = (
        Index("uq_vacation_cycle_date", "cycle_id", "vacation_date", unique=True),
    )
