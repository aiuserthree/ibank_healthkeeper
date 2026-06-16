from __future__ import annotations

from typing import Optional

from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import CycleState


class ReservationCycle(Base):
    __tablename__ = "reservation_cycle"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    target_week_start: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    target_week_end: Mapped[date] = mapped_column(Date, nullable=False)
    open_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    close_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reapply_open_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    reapply_close_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    state: Mapped[CycleState] = mapped_column(
        default=CycleState.BEFORE_OPEN, nullable=False
    )
    batch_close_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reapply_closed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    slots = relationship("Slot", back_populates="cycle", lazy="selectin")
    vacations = relationship("Vacation", back_populates="cycle", lazy="selectin")
    reservations = relationship("Reservation", back_populates="cycle", lazy="selectin")

    __table_args__ = (
        Index("ix_cycle_state", "state"),
        Index("ix_cycle_open_at", "open_at"),
    )
