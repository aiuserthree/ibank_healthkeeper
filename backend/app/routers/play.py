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
from app.services import match as match_service

router = APIRouter(prefix="/play", tags=["play"])


class GameRequestBody(BaseModel):
    body: str
    kind: Optional[str] = None  # GAME · BUG · IDEA
    game: Optional[str] = None
    device: Optional[str] = None


class MatchCreate(BaseModel):
    opponentId: int
    game: str = "gomoku"


class MatchBot(BaseModel):
    level: str  # easy · normal · hard
    game: str = "gomoku"


class MatchMove(BaseModel):
    x: Optional[int] = None  # 오목
    y: Optional[int] = None
    uci: Optional[str] = None  # 체스 — e2e4, 승격은 e7e8q
    seq: int  # 내가 본 판의 수 — 그새 판이 바뀌었으면 두지 않는다


class ScoreRequest(BaseModel):
    score: int
    token: Optional[str] = None
    variant: Optional[str] = None


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


@router.get("/weekly")
async def weekly(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """지난주(월~일) 게임별 1~3위 — 아케이드 '지난주 명예의 전당'."""
    return {"data": await game_service.last_week_board(db)}


@router.get("/stamps")
async def stamps(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """이번 달 아케이드 참여 도장 — 찍힌 날짜 · 개수 · 목표 · 이번 달 쿠폰 받았는지."""
    return {"data": await game_service.stamp_status(db, member)}


@router.post("/requests")
async def request_game(
    body: GameRequestBody,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """아케이드 의견(하고 싶은 게임 · 오류 신고 · 개선 의견) — 업무 시간에도 보낼 수 있다."""
    await game_service.add_game_request(db, member, body.body, body.kind, body.game, body.device)
    return {"data": {"ok": True}}


@router.get("/match")
async def matches(
    game: str = Query("gomoku"),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """내 대국 — 받은 도전 · 진행 중 · 최근 결과 · 순위."""
    return {"data": await match_service.overview(db, member, game)}


@router.get("/match/inbox")
async def match_inbox(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """게임별 내 차례인 판과 받은 도전 수 — 아케이드 알림."""
    return {"data": await match_service.inbox(db, member)}


@router.get("/match/members")
async def match_members(
    q: str = Query(""),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """도전할 직원 찾기."""
    return {"data": await match_service.search_members(db, member, q)}


@router.post("/match")
async def match_create(
    body: MatchCreate,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await match_service.create(db, member, body.opponentId, body.game)}


@router.post("/match/bot")
async def match_bot(
    body: MatchBot,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """컴퓨터와 대국 시작 — 두던 판이 있으면 그 판을 돌려준다."""
    return {"data": await match_service.start_bot(db, member, body.level, body.game)}


@router.get("/match/{match_id}")
async def match_detail(
    match_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await match_service.detail(db, member, match_id)}


@router.post("/match/{match_id}/accept")
async def match_accept(
    match_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await match_service.accept(db, member, match_id)}


@router.post("/match/{match_id}/decline")
async def match_decline(
    match_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """받은 도전 거절 또는 보낸 도전 취소 — 업무 시간에도 할 수 있다."""
    return {"data": await match_service.decline(db, member, match_id)}


@router.post("/match/{match_id}/move")
async def match_move(
    match_id: int,
    body: MatchMove,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await match_service.move(db, member, match_id, body.x, body.y, body.uci, body.seq)}


@router.post("/match/{match_id}/resign")
async def match_resign(
    match_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await match_service.resign(db, member, match_id)}


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
    variant: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await game_service.leaderboard(db, member, game, period, variant)}


@router.post("/{game}/score")
async def submit_score(
    game: str,
    body: ScoreRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_client),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await game_service.submit_score(db, redis, member, game, body.score, body.token, body.variant)}


@router.post("/{game}/start")
async def start(
    game: str,
    variant: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_client),
    member: Member = Depends(get_current_active_member),
):
    """오늘의 도전 시작 신고 — 하루 첫 시작만 순위용 토큰을 준다."""
    return {"data": await game_service.start_daily(db, redis, member, game, variant)}
