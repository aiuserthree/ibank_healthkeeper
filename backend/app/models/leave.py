from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, Index, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MemberLeave(Base):
    """회원 휴가 한 줄 — 그날 쉬는 시간대에는 업무 시간이어도 아케이드가 열린다.

    그룹웨어(사내망)에서 읽어 보내 주는 프로그램(scripts/gw-leave-sync.py)이 /api/internal/leave-sync 로 넣는다.
    시각은 그날 0시부터 센 분(0~1440) — 끝 1440 은 「24:00(그날 끝)」.
    """

    __tablename__ = "member_leave"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    start_min: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    end_min: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # VACATION 휴가 · HALF 반차 · QUARTER 반반차 · SPECIAL 특별휴가
    source: Mapped[str] = mapped_column(String(10), nullable=False, server_default="GW")  # GW 그룹웨어
    doc: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # 그룹웨어 결재 문서 번호
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_member_leave_day_member", "day", "member_id"),
        CheckConstraint("start_min >= 0 AND end_min <= 1440 AND start_min < end_min", name="ck_member_leave_minutes"),
    )
