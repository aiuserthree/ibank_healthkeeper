from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import JSON, BigInteger, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GameMatch(Base):
    """턴제 대전 한 판 — 오목. 직원끼리는 도전 → 수락 → 번갈아 두기, 컴퓨터와는 바로 시작."""

    __tablename__ = "game_match"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    game: Mapped[str] = mapped_column(String(30), nullable=False)
    challenger_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False)
    # 컴퓨터와 두는 판은 비어 있고 bot 에 난이도가 있다
    opponent_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=True)
    bot: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # easy · normal · hard
    # 흑(먼저 두는 쪽) — 수락할 때 무작위로 정한다
    black_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # PENDING · ACTIVE · DONE · DECLINED · EXPIRED
    moves: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # 둔 순서대로 [x, y]
    winner_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    end_reason: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # FIVE · RESIGN · TIMEOUT · DRAW
    # 수락·다음 수의 기한 — 넘기면 도전은 만료, 판은 기한을 넘긴 쪽의 패
    deadline_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_game_match_challenger", "challenger_id", "status"),
        Index("ix_game_match_opponent", "opponent_id", "status"),
        Index("ix_game_match_game_status", "game", "status"),
    )


class GamePlay(Base):
    """점심 라운지 게임 한 판 기록 — 순위는 기간(오늘·이번 주·전체)별 회원 최고 기록으로 계산."""

    __tablename__ = "game_play"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    game: Mapped[str] = mapped_column(String(30), nullable=False)
    # 같은 게임 안의 갈래 — 상식 퀴즈 분야(sci·khist …). 빈 값이 기본 판(오늘의 20문제). 갈래마다 순위·하루 첫 판을 따로 센다
    variant: Mapped[str] = mapped_column(String(20), nullable=False, server_default="")
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


class ArcadeStamp(Base):
    """아케이드 참여 도장 — 하루에 한 판이라도 끝까지 하면 그날 도장 1개 (한 달에 모아 무적 쿠폰)."""

    __tablename__ = "arcade_stamp"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    # KST 날짜 — 하루 하나
    stamp_date: Mapped[date] = mapped_column(Date, nullable=False)
    # 그날 도장을 찍게 한 게임 (참고용)
    game: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (UniqueConstraint("member_id", "stamp_date", name="uq_arcade_stamp_member_day"),)


class GameRequest(Base):
    """아케이드 의견 — 하고 싶은 게임 · 오류 신고 · 개선 의견 (점수 매기는 평가는 받지 않는다)."""

    __tablename__ = "game_request"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("member.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # GAME(하고 싶은 게임) · BUG(오류 신고) · IDEA(개선 의견)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, server_default="GAME")
    # 오류·개선이면 어느 게임인지 (게임 키) · 보낸 기기(휴대폰/PC · 브라우저) — 오류 원인 찾기용
    game: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    device: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # NEW(새 요청) · PLANNED(만들기로 함) · DONE(만듦) · HOLD(보류) — 관리자만 보는 표시
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="NEW")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_game_request_created", "created_at"),)
