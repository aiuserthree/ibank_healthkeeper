from __future__ import annotations

from typing import Optional

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Index, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import MemberStatus


class Member(Base):
    __tablename__ = "member"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    entra_oid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    position: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[MemberStatus] = mapped_column(
        default=MemberStatus.PENDING, nullable=False
    )
    last_used_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    login_fail_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    verification_tokens = relationship(
        "EmailVerificationToken", back_populates="member", lazy="selectin"
    )
    reservations = relationship("Reservation", back_populates="member", lazy="selectin")

    __table_args__ = (
        Index(
            "uq_member_email_active",
            "email",
            unique=True,
            postgresql_where=text("status <> 'WITHDRAWN'"),
        ),
        Index(
            "uq_member_entra_oid_active",
            "entra_oid",
            unique=True,
            postgresql_where=text("entra_oid IS NOT NULL AND status <> 'WITHDRAWN'"),
        ),
        Index("ix_member_last_used_date", "last_used_date"),
        Index("ix_member_status", "status"),
    )
