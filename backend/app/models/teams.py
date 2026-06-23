from __future__ import annotations

from typing import Optional

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import MailStatus, TeamsMessageType


class TeamsMessage(Base):
    __tablename__ = "teams_message"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    type: Mapped[TeamsMessageType] = mapped_column(nullable=False)
    to_member_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="SET NULL"), nullable=True
    )
    to_entra_oid: Mapped[str] = mapped_column(String(64), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[MailStatus] = mapped_column(default=MailStatus.PENDING, nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dedupe_key: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    reservation_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("reservation.id", ondelete="SET NULL"), nullable=True
    )
    chat_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    last_tried_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_teams_status", "status"),
        Index("ix_teams_retry_scan", "status", "retry_count", "last_tried_at"),
    )
