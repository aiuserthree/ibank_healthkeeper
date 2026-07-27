from __future__ import annotations

from typing import Optional

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import SwapProposalStatus


class SwapProposal(Base):
    __tablename__ = "swap_proposal"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("reservation_cycle.id", ondelete="CASCADE"), nullable=False
    )
    proposer_member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    target_member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    proposer_reservation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("reservation.id", ondelete="CASCADE"), nullable=False
    )
    target_reservation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("reservation.id", ondelete="CASCADE"), nullable=False
    )
    proposer_slot_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("slot.id", ondelete="CASCADE"), nullable=False
    )
    target_slot_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("slot.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[SwapProposalStatus] = mapped_column(
        default=SwapProposalStatus.PENDING, nullable=False
    )
    fail_reason: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    cycle = relationship("ReservationCycle")
    proposer = relationship("Member", foreign_keys=[proposer_member_id])
    target = relationship("Member", foreign_keys=[target_member_id])
    proposer_reservation = relationship(
        "Reservation", foreign_keys=[proposer_reservation_id]
    )
    target_reservation = relationship(
        "Reservation", foreign_keys=[target_reservation_id]
    )
    proposer_slot = relationship("Slot", foreign_keys=[proposer_slot_id])
    target_slot = relationship("Slot", foreign_keys=[target_slot_id])

    __table_args__ = (
        Index(
            "uq_swap_pending_proposer_res",
            "proposer_reservation_id",
            unique=True,
            postgresql_where=(status == SwapProposalStatus.PENDING),
        ),
        Index(
            "uq_swap_pending_target_res",
            "target_reservation_id",
            unique=True,
            postgresql_where=(status == SwapProposalStatus.PENDING),
        ),
        Index("ix_swap_target_status", "target_member_id", "status"),
        Index("ix_swap_proposer_status", "proposer_member_id", "status"),
        Index("ix_swap_cycle_status", "cycle_id", "status"),
    )
