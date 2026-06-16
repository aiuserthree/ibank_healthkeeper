from __future__ import annotations

from typing import Optional

from datetime import date, datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    Time,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import SlotStatus


class Slot(Base):
    __tablename__ = "slot"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("reservation_cycle.id", ondelete="CASCADE"), nullable=False
    )
    slot_date: Mapped[date] = mapped_column(Date, nullable=False)
    time_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    is_vacation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[SlotStatus] = mapped_column(default=SlotStatus.OPEN, nullable=False)
    confirmed_reservation_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey(
            "reservation.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_slot_confirmed_reservation",
        ),
        unique=True,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    cycle = relationship("ReservationCycle", back_populates="slots")
    reservations = relationship(
        "Reservation",
        back_populates="slot",
        foreign_keys="Reservation.slot_id",
        lazy="selectin",
    )
    confirmed_reservation = relationship(
        "Reservation",
        foreign_keys=[confirmed_reservation_id],
        uselist=False,
    )

    __table_args__ = (
        Index("uq_slot_cycle_date_time", "cycle_id", "slot_date", "time_index", unique=True),
        Index("ix_slot_cycle_date", "cycle_id", "slot_date"),
        Index("ix_slot_status", "status"),
    )
