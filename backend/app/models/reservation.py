from __future__ import annotations

from typing import Optional

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import (
    ConfirmedBy,
    ReservationStatus,
    ReservationType,
)


class Reservation(Base):
    __tablename__ = "reservation"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    slot_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("slot.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    cycle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("reservation_cycle.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[ReservationType] = mapped_column(
        default=ReservationType.NORMAL, nullable=False
    )
    status: Mapped[ReservationStatus] = mapped_column(
        default=ReservationStatus.REQUESTED, nullable=False
    )
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    dropped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    confirmed_by: Mapped[Optional[ConfirmedBy]] = mapped_column(nullable=True)
    is_priority: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    slot = relationship(
        "Slot",
        back_populates="reservations",
        foreign_keys=[slot_id],
    )
    member = relationship("Member", back_populates="reservations")
    cycle = relationship("ReservationCycle", back_populates="reservations")

    __table_args__ = (
        Index(
            "uq_reservation_slot_confirmed",
            "slot_id",
            unique=True,
            postgresql_where=(status == ReservationStatus.CONFIRMED),
        ),
        Index(
            "uq_reservation_slot_member_active",
            "slot_id",
            "member_id",
            unique=True,
            postgresql_where=(status != ReservationStatus.CANCELLED),
        ),
        Index("ix_reservation_slot_status", "slot_id", "status"),
        Index("ix_reservation_cycle_status", "cycle_id", "status"),
        Index("ix_reservation_member_status", "member_id", "status"),
        Index("ix_reservation_applied_at", "applied_at"),
    )
