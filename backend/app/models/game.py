from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GamePlay(Base):
    """점심 라운지 게임 한 판 기록 — 순위는 기간(오늘·이번 주·전체)별 회원 최고 기록으로 계산."""

    __tablename__ = "game_play"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    game: Mapped[str] = mapped_column(String(30), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    # KST 날짜 — 오늘·이번 주 순위 기준
    played_on: Mapped[date] = mapped_column(Date, nullable=False)
    played_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_game_play_game_day", "game", "played_on"),
        Index("ix_game_play_member_game", "member_id", "game"),
    )
