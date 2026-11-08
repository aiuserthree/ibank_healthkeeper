from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_member
from app.database import get_db
from app.models import Member
from app.services import mgmt as mgmt_service

router = APIRouter(prefix="/play/mgmt", tags=["play"])


class MgmtSaveBody(BaseModel):
    state: dict
    version: int  # 내가 불러온(또는 마지막으로 저장한) 버전 — 다르면 MGMT_STALE(409)


@router.get("")
async def mgmt_games(db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    """매니지먼트 게임 목록 — 업무 시간에도 볼 수 있다(들어가 하는 것만 닫힌다)."""
    return {"data": await mgmt_service.list_games(db, member)}


@router.get("/{game}")
async def mgmt_load(game: str, db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    """내 진행 상태 — state 가 null 이면 처음. now · savedAt 은 서버 시각."""
    return {"data": await mgmt_service.load(db, member, game)}


@router.put("/{game}")
async def mgmt_save(
    game: str,
    body: MgmtSaveBody,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await mgmt_service.save(db, member, game, body.state, body.version)}


@router.post("/{game}/reset")
async def mgmt_reset(game: str, db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    """처음부터 다시."""
    return {"data": await mgmt_service.reset(db, member, game)}
