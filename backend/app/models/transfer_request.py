from __future__ import annotations

from typing import Optional

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import TransferRequestStatus


class TransferRequest(Base):
    __tablename__ = "transfer_request"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    reservation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("reservation.id", ondelete="CASCADE"), nullable=False
    )
    donor_member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    recipient_member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    cycle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("reservation_cycle.id", ondelete="CASCADE"), nullable=False
    )
    slot_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("slot.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[TransferRequestStatus] = mapped_column(
        default=TransferRequestStatus.PENDING, nullable=False
    )
    new_reservation_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("reservation.id", ondelete="SET NULL"), nullable=True
    )
    resolved_by_admin_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("admin_user.id", ondelete="SET NULL"), nullable=True
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    reservation = relationship(
        "Reservation",
        foreign_keys=[reservation_id],
    )
    donor = relationship("Member", foreign_keys=[donor_member_id])
    recipient = relationship("Member", foreign_keys=[recipient_member_id])
    slot = relationship("Slot")
    cycle = relationship("ReservationCycle")

    __table_args__ = (
        Index(
            "uq_transfer_pending_reservation",
            "reservation_id",
            unique=True,
            postgresql_where=(status == TransferRequestStatus.PENDING),
        ),
        Index("ix_transfer_status", "status"),
        Index("ix_transfer_cycle_status", "cycle_id", "status"),
    )
