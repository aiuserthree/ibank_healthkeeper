from __future__ import annotations

from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_member, get_redis_client
from app.database import get_db
from app.models import Member
from app.services import raid as raid_service

router = APIRouter(prefix="/play", tags=["play"])


@router.get("/raid")
async def raid(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_client),
    member: Member = Depends(get_current_active_member),
):
    """부서 대항 레이드 — 이번 주 보스 · 부서별 진행 · 내 몫 · 우리 부서 순위 · 지난 4주 1~3위.

    지금은 업무 시간에도 열려 있다(화면이 '업무 시간이라 게임을 쉬어요' 안내와 함께 현황을 보여 준다).
    게임 순위(game.leaderboard)는 업무 시간에 닫히므로, 같은 규칙으로 닫기로 하면 여기서
    game_service.ensure_open(grace=True) 를 부른다 — 그때는 화면도 GAME_CLOSED(403)를 받아 안내해야 한다.
    """
    return {"data": await raid_service.raid_board(db, redis, member)}
