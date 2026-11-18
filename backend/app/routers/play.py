from __future__ import annotations

from typing import Optional, Union

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_member, get_redis_client
from app.database import get_db
from app.models import Member
from app.services import game as game_service
from app.services import escape as escape_service
from app.services import match as match_service
from app.services import party as party_service

router = APIRouter(prefix="/play", tags=["play"])


def _deliver(background_tasks: BackgroundTasks, message_ids: list) -> None:
    """대전 신청 · 수락 · 거절 Teams 알림 — 응답을 먼저 주고 뒤에서 보낸다."""
    if message_ids:
        from app.services.teams import deliver_teams_messages

        background_tasks.add_task(deliver_teams_messages, message_ids)


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
    data: Optional[dict] = None  # 그 밖의 대전 게임 — 게임마다 모양이 다르다(숫자 야구 추측 · 칸 따먹기 선 · 퀴즈 답 등)
    seq: int  # 내가 본 판의 수 — 그새 판이 바뀌었으면 두지 않는다


class ScoreRequest(BaseModel):
    score: int
    token: Optional[str] = None
    variant: Optional[str] = None


@router.get("/status")
async def status(member: Member = Depends(get_current_active_member)):
    """지금 게임을 할 수 있는 시간인지 — 닫혀 있으면 다시 열리는 시각(HH:MM).
    휴가 · 반차 · 반반차 · 특별휴가로 업무 시간에 열렸으면 reason "leave" 와 leave {kind, label, until}."""
    return {"data": game_service.play_window(member=member)}


@router.get("/games")
async def games(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """점심 라운지 게임 목록 — 오늘 1위 · 오늘 참가자 수 · 내 최고 기록."""
    return {"data": await game_service.list_games(db, member)}


@router.get("/weekly")
async def weekly(
    period: str = Query("week", pattern="^(week|month|all)$"),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """게임별 1~3위 — 아케이드 '명예의 전당'. week 지난주 · month 이번 달 · all 전체."""
    return {"data": await game_service.hall_of_fame(db, period)}


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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """아케이드 의견(하고 싶은 게임 · 오류 신고 · 개선 의견) — 업무 시간에도 보낼 수 있다.

    저장한 뒤 운영자에게 Teams 알림 — 응답을 먼저 주고 뒤에서 보낸다(알림이 안 돼도 요청은 저장된다).
    """
    message_ids = await game_service.add_game_request(db, member, body.body, body.kind, body.game, body.device)
    _deliver(background_tasks, message_ids)
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


class PartyCreate(BaseModel):
    game: str = "bumpervs"
    memberIds: list[int]
    track: int = 1


class PartyInvite(BaseModel):
    memberIds: list[int]


class PartyStart(BaseModel):
    playerIds: list[int]
    track: int = 1


class PartyReport(BaseModel):
    data: dict


@router.get("/party")
async def party_overview(
    game: str = Query("bumpervs", max_length=30),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """여러 명 대전 — 받은 초대 · 내 대기실 · 최근 끝난 판."""
    return {"data": await party_service.overview(db, member, game)}


@router.post("/party")
async def party_create(
    body: PartyCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    data, notify = await party_service.create(db, member, body.game, body.memberIds, body.track)
    _deliver(background_tasks, notify)
    return {"data": data}


@router.get("/party/{party_id}")
async def party_detail(party_id: int, db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    return {"data": await party_service.detail(db, member, party_id)}


@router.post("/party/{party_id}/invite")
async def party_invite(
    party_id: int,
    body: PartyInvite,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    data, notify = await party_service.invite(db, member, party_id, body.memberIds)
    _deliver(background_tasks, notify)
    return {"data": data}


@router.post("/party/{party_id}/accept")
async def party_accept(party_id: int, db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    return {"data": await party_service.accept(db, member, party_id)}


@router.post("/party/{party_id}/decline")
async def party_decline(party_id: int, db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    """초대 거절 · 대기실 나가기 · (연 사람이면) 대기실 닫기 — 업무 시간에도 할 수 있다."""
    return {"data": await party_service.decline(db, member, party_id)}


@router.post("/party/{party_id}/start")
async def party_start(party_id: int, body: PartyStart, db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    return {"data": await party_service.start(db, member, party_id, body.playerIds, body.track)}


@router.post("/party/{party_id}/report")
async def party_report(party_id: int, body: PartyReport, db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    return {"data": await party_service.report(db, member, party_id, body.data)}


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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    data, notify = await match_service.create(db, member, body.opponentId, body.game)
    _deliver(background_tasks, notify)
    return {"data": data}


@router.post("/match/bot")
async def match_bot(
    body: MatchBot,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """컴퓨터와 대국 시작 — 두던 판이 있으면 그 판을 돌려준다."""
    return {"data": await match_service.start_bot(db, member, body.level, body.game)}


@router.get("/match/{match_id}/wait")
async def match_wait(
    match_id: int,
    seq: int = Query(..., ge=0),
    status: str = Query(..., max_length=16),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """상대 차례일 때 화면이 거는 요청 — 판이 바뀌면 그 즉시, 아니면 20초 뒤에 판을 돌려준다."""
    return {"data": await match_service.wait(db, member, match_id, seq, status)}


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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    data, notify = await match_service.accept(db, member, match_id)
    _deliver(background_tasks, notify)
    return {"data": data}


@router.post("/match/{match_id}/decline")
async def match_decline(
    match_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    """받은 도전 거절 또는 보낸 도전 취소 — 업무 시간에도 할 수 있다."""
    data, notify = await match_service.decline(db, member, match_id)
    _deliver(background_tasks, notify)
    return {"data": data}


@router.post("/match/{match_id}/move")
async def match_move(
    match_id: int,
    body: MatchMove,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await match_service.move(db, member, match_id, body.x, body.y, body.uci, body.seq, data=body.data)}


@router.post("/match/{match_id}/resign")
async def match_resign(
    match_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    return {"data": await match_service.resign(db, member, match_id)}


# ── 2인 협동 방탈출 ──

class EscapeInvite(BaseModel):
    partnerId: int
    room: str = "overtime"


class EscapeReady(BaseModel):
    on: bool = True


class EscapeSolve(BaseModel):
    puzzle: str
    answer: Union[str, list, None] = None


class EscapeHint(BaseModel):
    puzzle: str


class EscapeSay(BaseModel):
    text: str


class KitchenAct(BaseModel):
    action: str  # 분식집: seat · send · serve · clean · cook · take · roll · toss / 낱말: clue · guess · pass
    arg: Union[int, dict, str, None] = None


@router.get("/coop")
@router.get("/escape")
async def escape_overview(
    room: str = Query("overtime", max_length=20),
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    return {"data": await escape_service.overview(db, member, room)}


@router.get("/coop/inbox")
@router.get("/escape/inbox")
async def escape_inbox(db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    return {"data": await escape_service.inbox(db, member)}


# /coop/{room_id} 보다 먼저 둔다 — 뒤에 두면 "series" 가 방 번호로 읽혀 422 가 난다
@router.get("/coop/series")
async def coop_series(db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    """협동 시리즈 「오늘도 둘이서」 화마다 내 기록 — 함께하기 페이지 · 협동 방 목록."""
    return {"data": await escape_service.series(db, member)}


@router.post("/coop")
@router.post("/escape")
async def escape_invite(
    body: EscapeInvite, background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    data, notify = await escape_service.invite(db, member, body.partnerId, body.room)
    _deliver(background_tasks, notify)
    return {"data": data}


@router.get("/coop/{room_id}")
@router.get("/escape/{room_id}")
async def escape_detail(room_id: int, db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    return {"data": await escape_service.detail(db, member, room_id)}


@router.get("/coop/{room_id}/wait")
@router.get("/escape/{room_id}/wait")
async def escape_wait(
    room_id: int, seq: int = Query(..., ge=0), here: bool = Query(False),
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    """방 화면이 거는 요청 — 방이 바뀌거나 상대가 들어오고 나가면 그 즉시, 아니면 20초 뒤에 돌려준다."""
    return {"data": await escape_service.wait(db, member, room_id, seq, here)}


@router.post("/coop/{room_id}/accept")
@router.post("/escape/{room_id}/accept")
async def escape_accept(
    room_id: int, background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    data, notify = await escape_service.accept(db, member, room_id)
    _deliver(background_tasks, notify)
    return {"data": data}


@router.post("/coop/{room_id}/leave")
@router.post("/escape/{room_id}/leave")
async def escape_leave(
    room_id: int, background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    """초대 거절 · 보낸 초대 취소 · 시작 전 나가기 · 진행 중 포기 — 업무 시간에도 할 수 있다."""
    data, notify = await escape_service.leave(db, member, room_id)
    _deliver(background_tasks, notify)
    return {"data": data}


@router.post("/coop/{room_id}/call")
@router.post("/escape/{room_id}/call")
async def escape_call(
    room_id: int, background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    data, notify = await escape_service.call(db, member, room_id)
    _deliver(background_tasks, notify)
    return {"data": data}


class CoopOptions(BaseModel):
    opts: dict


@router.post("/coop/{room_id}/options")
async def coop_options(
    room_id: int, body: CoopOptions,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    """대기실 게임 설정 — 주제 · 난이도 등(게임마다 다름). 바뀌면 둘 다 다시 준비."""
    return {"data": await escape_service.set_options(db, member, room_id, body.opts)}


@router.post("/coop/{room_id}/ready")
@router.post("/escape/{room_id}/ready")
async def escape_ready(
    room_id: int, body: EscapeReady,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    return {"data": await escape_service.ready(db, member, room_id, body.on)}


@router.post("/coop/{room_id}/solve")
@router.post("/escape/{room_id}/solve")
async def escape_solve(
    room_id: int, body: EscapeSolve,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    return {"data": await escape_service.solve(db, member, room_id, body.puzzle, body.answer)}


@router.post("/coop/{room_id}/hint")
@router.post("/escape/{room_id}/hint")
async def escape_hint(
    room_id: int, body: EscapeHint,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    return {"data": await escape_service.hint(db, member, room_id, body.puzzle)}


@router.post("/coop/{room_id}/card")
@router.post("/escape/{room_id}/card")
async def escape_card(room_id: int, db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    return {"data": await escape_service.card(db, member, room_id)}


@router.post("/coop/{room_id}/hint/{level}")
async def escape_hint_level(
    room_id: int, level: int, body: EscapeHint,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    """방탈출 힌트 한 단계(1 살짝 · 2 확실하게) — 이미 본 단계면 그대로라 둘이 같이 눌러도 벌점은 한 번."""
    return {"data": await escape_service.hint(db, member, room_id, body.puzzle, level)}


class EscapeItem(BaseModel):
    item: str  # fuse · panelkey · card · kimbap
    action: str  # send 서류 투입구로 넘기기 · use 여기에 쓰기 · eat 먹기


@router.post("/coop/{room_id}/item")
async def escape_item(
    room_id: int, body: EscapeItem,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    """방탈출 물건 — 서류 투입구로 넘기기 · 퓨즈 끼우기 같은 쓰기 · 김밥 먹기."""
    return {"data": await escape_service.item(db, member, room_id, body.item, body.action)}


@router.post("/coop/{room_id}/say")
@router.post("/escape/{room_id}/say")
async def escape_say(
    room_id: int, body: EscapeSay,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    return {"data": await escape_service.say(db, member, room_id, body.text)}


@router.post("/coop/{room_id}/act")
async def coop_act(
    room_id: int, body: KitchenAct,
    db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member),
):
    """시간제 협동 게임(점심 분식집 · 말해 봐 맞혀 봐) — 동작 하나."""
    return {"data": await escape_service.engine_act(db, member, room_id, body.action, body.arg)}


@router.post("/coop/{room_id}/tick")
async def coop_tick(room_id: int, db: AsyncSession = Depends(get_db), member: Member = Depends(get_current_active_member)):
    """시간제 협동 게임 — 손님 도착·떠남·결제·끝 같은 시간 일을 맞춘다."""
    return {"data": await escape_service.engine_tick(db, member, room_id)}


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


@router.post("/{game}/stage")
async def stage_clear(
    game: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_client),
    member: Member = Depends(get_current_active_member),
):
    """판 중간 도장 — 한 판이 긴 게임(통통 짐볼)에서 스테이지 하나를 통과했을 때."""
    return {"data": await game_service.stage_stamp(db, redis, member, game)}


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
