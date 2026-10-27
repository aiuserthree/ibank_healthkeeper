from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_member, get_redis_client
from app.database import get_db
from app.models import Member
from app.services import game as game_service

router = APIRouter(prefix="/play", tags=["play"])


class ScoreRequest(BaseModel):
    score: int
    token: Optional[str] = None


@router.get("/status")
async def status(member: Member = Depends(get_current_active_member)):
    """지금 게임을 할 수 있는 시간인지 — 닫혀 있으면 다시 열리는 시각(HH:MM)."""
    return {"data": game_service.play_window()}


@router.get("/games")
async def games(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """점심 라운지 게임 목록 — 오늘 1위 · 오늘 참가자 수 · 내 최고 기록."""
    return {"data": await game_service.list_games(db, member)}


@router.get("/stamps")
async def stamps(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """이번 달 아케이드 참여 도장 — 찍힌 날짜 · 개수 · 목표 · 이번 달 쿠폰 받았는지."""
    return {"data": await game_service.stamp_status(db, member)}


@router.post("/{game}/run")
async def run(
    game: str,
    fresh: bool = False,
    redis: Redis = Depends(get_redis_client),
    member: Member = Depends(get_current_active_member),
):
    """판 준비·시작 신고 — 도장용 판 길이를 재기 시작한다 (순위와 무관)."""
    await game_service.start_run(redis, member, game, fresh=fresh)
    return {"data": {"ok": True}}


@router.get("/{game}/leaderboard")
async def leaderboard(
    game: str,
    period: str = Query("today"),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await game_service.leaderboard(db, member, game, period)}


@router.post("/{game}/score")
async def submit_score(
    game: str,
    body: ScoreRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_client),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await game_service.submit_score(db, redis, member, game, body.score, body.token)}


@router.post("/{game}/start")
async def start(
    game: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_client),
    member: Member = Depends(get_current_active_member),
):
    """오늘의 도전 시작 신고 — 하루 첫 시작만 순위용 토큰을 준다."""
    return {"data": await game_service.start_daily(db, redis, member, game)}
