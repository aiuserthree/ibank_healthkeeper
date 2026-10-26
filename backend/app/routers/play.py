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


@router.get("/games")
async def games(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """점심 라운지 게임 목록 — 오늘 1위 · 오늘 참가자 수 · 내 최고 기록."""
    return {"data": await game_service.list_games(db, member)}


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
