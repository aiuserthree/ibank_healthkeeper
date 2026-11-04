"""턴제 대전 — 오목 · 체스 · 숫자 야구 · 칸 따먹기 · 1:1 퀴즈 대결. 직원끼리 또는 컴퓨터와. 수는 아케이드가 열린 시간에만 둘 수 있다.

오목 · 체스는 이 파일이 직접 둔다(둔 수는 moves 에 쌓인다). 그 밖의 대전 게임은 「대전 엔진」 모듈
app/services/versus_<게임 키>.py 가 규칙을 맡고, 이 파일은 도전 · 수락 · 거절 · 기한 · 기권 · 도장 · 순위 · Teams 알림 ·
실시간 알림(_publish)을 모든 게임에 똑같이 해 준다. 엔진 게임의 판은 game_match.state(JSON)에 둔다.

── 대전 엔진 규약 ─────────────────────────────────────────────────────────────
엔진은 모듈 하나다(클래스 아님). 이 파일을 import 하지 않는다(순환 import 방지) — 필요한 것은 모두 인자로 받는다.
아래 m 은 GameMatch 한 판: m.challenger_id · m.opponent_id(컴퓨터전이면 None) · m.bot(난이도 또는 None) ·
m.black_id(먼저 하는 사람, 컴퓨터가 먼저면 None) · m.status · m.state(dict) · m.winner_id · m.end_reason · m.deadline_at.
컴퓨터의 id 는 BOT_ID(0)로 다룬다. 사람 id 는 늘 1 이상.
m.state 는 JSON 으로 저장됐다 돌아온다 — dict 키는 문자열이 된다(사람별 값은 str(member_id) 키로), 튜플 · 집합은 쓰지 않는다(리스트로).

  꼭 있어야 하는 것
  KEY: str                      게임 키 — 화면은 web/games/{KEY}.html (Teams 알림 링크도 이 주소)
  NAME: str                     짧은 이름("숫자 야구") — 오목 · 체스처럼
  REASONS: dict[str, str]       끝난 이유(end_reason, 영문 대문자 20자 이하) → 화면 문구.
                                공통 이유 RESIGN(기권) · TIMEOUT(시간 초과) · DRAW(무승부) · TIMEOUT_DRAW 는 여기서 채운다(엔진이 덮어써도 된다)
  start(m, players, rnd) -> dict
                                수락할 때(컴퓨터전은 시작할 때) 한 번. players = (먼저 하는 id, 나중 id) — 컴퓨터는 BOT_ID.
                                rnd 는 random.Random. 돌려준 dict 가 m.state 가 된다. 밑줄(_)로 시작하는 키는 이 파일 몫이라 쓰지 않는다
                                (m.state["_v"] = 지금까지 받아들인 행동 수 — 화면의 seq).
  waiting_for(m) -> set[int]    지금 행동을 기다리는 사람 id 들. 차례제 게임은 한 명, 둘이 따로 푸는 게임은 둘 다일 수 있다.
                                컴퓨터 차례면 BOT_ID. m.status == "ACTIVE" 일 때만 불린다.
  act(m, member_id, data, now) -> None | (winner_id, reason)
                                member_id 의 행동 data(화면이 보낸 dict 그대로 — 모양은 게임마다)를 m.state 에 반영한다.
                                m.state 는 이번 요청만의 복사본이라 그 자리에서 고친다(새 dict 로 바꿔 넣어도 되고,
                                그래도 _v 는 이 파일이 행동 전 값 + 1 로 다시 붙인다). 잘못된 입력은 raise_app_error 로 막는다
                                (그때 바뀐 것은 저장되지 않는다 — 오류 코드는 엔진이 register_messages 로 등록).
                                판이 끝나면 (승자 id, 이유)를 돌려준다 — 튜플(또는 리스트) 두 칸, 이유는 빈 글자가 아닌 str.
                                승자 None = 무승부, 컴퓨터가 이기면 BOT_ID. 모양이 틀리면 그 요청은 실패하고 저장되지 않는다.
                                기한은 이 파일이 다시 잡는다(next_deadline).
  view(m, member_id, board) -> dict
                                member_id 가 볼 화면 내용 — 공통 payload 에 합쳐진다. board=False 는 목록 한 줄(가볍게),
                                True 는 대국 화면(상세 · 둔 뒤 · 기다리기). 상대의 비밀(숨긴 수 · 정답 · 아직 안 보여 줄 답)은
                                끝나기 전(m.status != "DONE")에는 절대 넣지 않는다. PROTECTED 키는 덮어쓸 수 없다(myColor 는 넣어도 된다).
                                m.state 가 없는 판(PENDING · DECLINED · EXPIRED)에는 불리지 않는다.

  있으면 쓰는 것(없으면 기본값)
  DRAWS: tuple[str, ...]        컴퓨터전에서 무승부로 칠 이유 — 사람끼리는 승자가 None 이면 늘 무승부
  MOVE_HOURS: int               행동 하나(또는 판 전체)의 기한 — 기본 24
  MIN_ACTS: int                 기권 · 시간 초과로 끝난 판을 도장 · 순위에 세는 최소 행동 수(_v) — 기본 10
  STALE_CHECK: bool             행동할 때 화면이 본 seq 가 지금 판과 같아야 하는지 — 기본 True.
                                둘이 동시에 푸는 게임은 False 로 두고 data 안의 문제 번호 등으로 직접 확인한다
  counts(m) -> bool             끝난 판을 도장 · 순위에 셀지 직접 정한다(있으면 MIN_ACTS 대신). 컴퓨터전 시간 초과는 늘 안 센다
  next_deadline(m, now) -> datetime | None
                                수락 직후와 행동마다 새 기한. 기본은 now + MOVE_HOURS(한 번 행동할 때마다 다시 24시간).
                                판 전체 기한이면 `return m.deadline_at or now + timedelta(hours=24)` (수락 직후에는 m.deadline_at 이 None)
  on_timeout(m, now) -> (winner_id, reason)
                                기한이 지났을 때. m.state 는 복사본(고쳐도 저장된다). 기본: 기다리던 사람이 한 명이면
                                그 상대가 이김("TIMEOUT"), 둘 다면 무승부("TIMEOUT_DRAW"). 기한으로 끝난 판은 도장을 주지 않는다.
                                오류가 나거나 모양이 틀린 값을 돌려주면 고친 state 는 버리고 (None, "TIMEOUT_DRAW") 로 끝낸다.
                                기한승을 순위에 세려면 counts(m) 또는 MIN_ACTS 를 정한다(TIMEOUT 은 _v < MIN_ACTS 면 안 센다)
  SUPPORTS_BOT: bool            컴퓨터와 두기 — 기본 False
  BOT_LEVELS: tuple[str, ...]   허용 난이도(10자 이하) — 기본 easy · normal · hard
  BOT_NAMES: dict[str, str]     난이도 → 상대 이름("컴퓨터 · 쉬움")
  bot_act(m, level, now) -> None | (winner_id, reason)
                                컴퓨터 차례(BOT_ID in waiting_for)마다 불린다 — act 와 같은 규칙. 스레드에서 돌린다

공통 payload(목록 한 줄 · 대국 화면 모두): id · game · status · bot · opponent · incoming · myColor · myTurn · rivalTurn ·
moveCount · seq · result(win · lose · draw) · endReason · reasonLabel · deadlineAt · finishedAt, 대국 화면이면 me 도.
엔진 게임은 seq = moveCount = m.state["_v"]. 화면은 HKApi.matchMove(id, {data: {...}}, seq) 로 두고
HKApi.matchWait(id, seq, status) 로 기다린다 — 행동 하나마다 seq 가 1 오르고 상대 화면이 바로 깨어난다.
"""

from __future__ import annotations

import asyncio
import copy
import importlib
import logging
import random
from datetime import datetime, timedelta
from typing import Optional

import chess
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error, register_messages
from app.core.time import KST, now_kst, today_kst
from app.models import GameMatch, Member, MemberStatus
from app.services import chess_game, gomoku_ai
from app.services import teams as teams_service
from app.services.avatar import member_avatar_url
from app.services.game import _give_stamp, ensure_open, game_visible

GOMOKU = "gomoku"
CHESS = "chess"
CLASSIC_GAMES = (GOMOKU, CHESS)  # 이 파일이 직접 두는 게임
ENGINE_GAMES = ("baseball", "boxes", "quizduel", "gostop", "memory", "soccer", "volley")  # 대전 엔진 — app/services/versus_<키>.py
MATCH_GAMES = (*CLASSIC_GAMES, *ENGINE_GAMES)
BOARD = 15
ACCEPT_HOURS = 24  # 받은 도전을 기다리는 시간
MOVE_HOURS = 24  # 한 수를 기다리는 시간 — 넘기면 기한을 넘긴 쪽의 패
MAX_OPEN = 10  # 한 사람이 게임마다 동시에 걸어 둘 수 있는 대국
MIN_MOVES = 10  # 기권·시간 초과는 이만큼 둔 판만 도장과 순위에 반영 — 바로 기권해 도장·승수를 얻지 못하게
RANK_SIZE = 20
WAIT_SECONDS = 20  # 상대 수를 기다리는 한 번의 요청 — 그 안에 판이 바뀌면 바로 돌려준다
BOT_NAME = {"easy": "컴퓨터 · 쉬움", "normal": "컴퓨터 · 보통", "hard": "컴퓨터 · 어려움"}
BOT_ID = 0  # 엔진 게임에서 컴퓨터를 가리키는 id — 사람 id 는 1부터
BOT_ACT_LIMIT = 300  # 컴퓨터가 한 요청 안에서 이어 둘 수 있는 최대 횟수(엔진이 차례를 넘기지 않는 실수 막기)

OPEN_STATUS = ("PENDING", "ACTIVE")
NO_WINNER = ("DRAW", "STALEMATE")      # 승부가 나지 않은 끝
PLAYED_OUT = ("FIVE", "CHECKMATE", *NO_WINNER)

# 끝난 이유 → 화면 문구. 오목 · 체스는 화면(match-lobby.js REASON)과 같은 말
CLASSIC_REASONS = {"FIVE": "오목 완성", "CHECKMATE": "체크메이트", "STALEMATE": "스테일메이트", "RESIGN": "기권", "TIMEOUT": "시간 초과", "DRAW": "무승부"}
ENGINE_REASONS = {"RESIGN": "기권", "TIMEOUT": "시간 초과", "DRAW": "무승부", "TIMEOUT_DRAW": "시간 초과 · 무승부"}
ENGINE_DRAWS = ("DRAW", "TIMEOUT_DRAW")
GAVE_UP = ("RESIGN", "TIMEOUT", "TIMEOUT_DRAW")  # 끝까지 두지 않은 끝 — 행동 수가 모자라면 도장 · 순위에 넣지 않는다
# 엔진 view 가 덮어쓸 수 없는 키 — 차례 · 결과 · 상대 정보는 이 파일만 정한다
PROTECTED = frozenset({
    "id", "game", "status", "bot", "opponent", "me", "incoming", "myTurn", "rivalTurn", "moveCount", "seq",
    "result", "endReason", "reasonLabel", "deadlineAt", "finishedAt", "stamp",
})

register_messages({"MATCH_NO_BOT": "이 게임은 컴퓨터와 둘 수 없어요."})


logger = logging.getLogger(__name__)


def _channel(redis, match_id: int) -> str:
    # pub/sub 채널은 Redis DB 번호와 상관없이 서버 전체에서 하나 — 개발·운영이 같은 Redis를 써도 섞이지 않게 DB 번호를 붙인다
    return f"hk:{redis.connection_pool.connection_kwargs.get('db', 0)}:match:{match_id}"


async def _publish(*match_ids: int) -> None:
    """판이 바뀌었다고 기다리는 쪽에 알린다. 알림이 실패해도 수는 이미 저장됐다."""
    try:
        from app.database import get_redis

        redis = await get_redis()
        for match_id in match_ids:
            await redis.publish(_channel(redis, match_id), "1")
    except Exception:  # noqa: BLE001
        logger.warning("match publish failed", exc_info=True)


def _check_game(game: str) -> str:
    if game not in MATCH_GAMES or not game_visible(game):  # 비공개 게임은 운영에서 도전 · 목록을 열지 않는다
        raise_app_error("MATCH_NOT_FOUND", 404)
    return game


def _engine(game: str):
    """대전 엔진 모듈 — 오목 · 체스(이 파일이 직접 두는 게임)는 None.
    처음 쓸 때 불러온다 — 한 게임 모듈에 문제가 있어도 앱과 다른 대전은 그대로 돈다."""
    if game not in ENGINE_GAMES:
        return None
    return importlib.import_module(f"app.services.versus_{game}")


def _mine(member_id: int):
    return or_(GameMatch.challenger_id == member_id, GameMatch.opponent_id == member_id)


def _rival_id(m: GameMatch, member_id: int) -> Optional[int]:
    return m.opponent_id if m.challenger_id == member_id else m.challenger_id


def _seq(m: GameMatch) -> int:
    """화면이 본 판인지 맞춰 보는 번호 — 오목 · 체스는 둔 수, 엔진 게임은 받아들인 행동 수."""
    if m.game in CLASSIC_GAMES:
        return len(m.moves)
    return int((m.state or {}).get("_v", 0))


def _waiting(m: GameMatch) -> set:
    """지금 행동을 기다리는 id 들 — 엔진 게임은 둘 다일 수 있고, 컴퓨터는 BOT_ID."""
    if m.status != "ACTIVE":
        return set()
    eng = _engine(m.game)
    if eng is None:
        turn = _turn_id(m)
        return set() if turn is None else {turn}
    return set(eng.waiting_for(m))


def _turn_id(m: GameMatch) -> Optional[int]:
    """black_id 는 먼저 두는 쪽 — 오목은 흑, 체스는 백이다.
    엔진 게임은 기다리는 사람이 꼭 한 명일 때만 그 사람(둘 다 기다리면 None — 차례는 _waiting 으로 본다)."""
    if m.status != "ACTIVE":
        return None
    eng = _engine(m.game)
    if eng is not None:
        people = set(eng.waiting_for(m)) - {BOT_ID}
        return next(iter(people)) if len(people) == 1 else None
    if m.bot:  # 컴퓨터는 사람이 둔 요청 안에서 바로 두므로 저장된 판은 늘 사람 차례
        return m.challenger_id
    second = m.opponent_id if m.black_id == m.challenger_id else m.challenger_id
    return m.black_id if len(m.moves) % 2 == 0 else second


def _five(moves: list, x: int, y: int) -> bool:
    """방금 둔 수로 같은 색이 다섯 개 이상 이어졌는지."""
    color = (len(moves) - 1) % 2
    mine = {tuple(p) for i, p in enumerate(moves) if i % 2 == color}
    for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
        n = 1
        for sign in (1, -1):
            cx, cy = x + dx * sign, y + dy * sign
            while (cx, cy) in mine:
                n += 1
                cx += dx * sign
                cy += dy * sign
        if n >= 5:
            return True
    return False


def _counts(m: GameMatch) -> bool:
    if m.end_reason == "TIMEOUT" and m.bot:
        return False
    eng = _engine(m.game)
    if eng is None:
        return m.end_reason in PLAYED_OUT or len(m.moves) >= MIN_MOVES
    if hasattr(eng, "counts"):
        return bool(eng.counts(m))
    return m.end_reason not in GAVE_UP or _seq(m) >= getattr(eng, "MIN_ACTS", MIN_MOVES)


def _no_winner(m: GameMatch) -> bool:
    """승부가 나지 않은 끝인지 — 엔진 게임은 승자가 없으면 무승부(컴퓨터전은 컴퓨터가 이겨도 승자 칸이 비므로 이유로 가린다)."""
    eng = _engine(m.game)
    if eng is None:
        return m.end_reason in NO_WINNER
    if m.winner_id is not None:
        return False
    return not m.bot or m.end_reason in (*ENGINE_DRAWS, *getattr(eng, "DRAWS", ()))


def _reason_label(m: GameMatch) -> Optional[str]:
    if not m.end_reason:
        return None
    eng = _engine(m.game)
    if eng is None:
        return CLASSIC_REASONS.get(m.end_reason)
    return getattr(eng, "REASONS", {}).get(m.end_reason) or ENGINE_REASONS.get(m.end_reason)


def _finish(m: GameMatch, winner_id: Optional[int], reason: str) -> None:
    m.status = "DONE"
    m.winner_id = winner_id
    m.end_reason = reason
    m.deadline_at = None
    m.finished_at = now_kst()


def _outcome(raw) -> tuple:
    """엔진이 돌려준 끝이 (승자 id 또는 None, 이유 글자) 모양인지 본다 — 아니면 ValueError(엔진 실수)."""
    if not isinstance(raw, (tuple, list)) or len(raw) != 2 or not isinstance(raw[1], str) or not raw[1]:
        raise ValueError(f"engine outcome must be (winner_id, reason), got {raw!r}")
    return raw[0], raw[1]


def _end(m: GameMatch, outcome) -> None:
    """엔진이 돌려준 끝 (승자 id, 이유) — 컴퓨터가 이긴 판은 오목 · 체스처럼 승자 칸을 비운다."""
    winner, reason = _outcome(outcome)
    if winner == BOT_ID:
        winner = None
    elif winner is not None and winner not in (m.challenger_id, m.opponent_id):
        logger.warning("match %s: engine returned a winner outside the match (%s)", m.id, winner)
        winner = None
    _finish(m, winner, str(reason)[:20])


def _next_deadline(m: GameMatch, eng, now: datetime) -> Optional[datetime]:
    if hasattr(eng, "next_deadline"):
        return eng.next_deadline(m, now)
    return now + timedelta(hours=getattr(eng, "MOVE_HOURS", MOVE_HOURS))


def _start_engine(m: GameMatch, eng, players: tuple) -> None:
    """엔진 게임 판을 차린다 — 수락할 때 · 컴퓨터전을 시작할 때."""
    now = now_kst()
    m.deadline_at = None  # 받은 도전의 기한은 끝 — next_deadline 이 판 기한을 새로 잡는다
    m.state = {**(eng.start(m, tuple(players), random.Random()) or {}), "_v": 0}
    m.deadline_at = _next_deadline(m, eng, now)


def _after_act(m: GameMatch, eng, outcome, now: datetime, v: int) -> None:
    """행동 하나를 받아들인 뒤 — seq 를 올리고, 끝났으면 마무리, 아니면 기한을 다시 잡는다.
    v 는 행동 전에 읽어 둔 seq — 엔진이 m.state 를 새 dict 로 바꿔 _v 가 사라져도 1로 되돌아가지 않게."""
    m.state["_v"] = v + 1
    if outcome:
        _end(m, outcome)
    elif m.status == "ACTIVE":
        m.deadline_at = _next_deadline(m, eng, now)


async def _bot_turns(m: GameMatch, eng) -> None:
    """컴퓨터 차례가 이어지는 동안 컴퓨터가 둔다 — 칸 따먹기처럼 한 사람이 이어 두는 게임도 있다."""
    for _ in range(BOT_ACT_LIMIT):
        if m.status != "ACTIVE" or BOT_ID not in _waiting(m):
            return
        now = now_kst()
        v = _seq(m)
        outcome = await asyncio.to_thread(eng.bot_act, m, m.bot, now)
        _after_act(m, eng, outcome, now, v)
    logger.warning("match %s: bot kept the turn for %s acts", m.id, BOT_ACT_LIMIT)


def _apply(m: GameMatch, step, mover_id: Optional[int]) -> None:
    """수를 판에 더하고 끝났는지 본다. 컴퓨터가 이긴 판은 승자 칸이 빈다."""
    m.moves = [*m.moves, step]
    if m.game == CHESS:
        reason = chess_game.ending(chess_game.board_of(m.moves))
        if reason:
            _finish(m, mover_id if reason == "CHECKMATE" else None, reason)
    elif _five(m.moves, step[0], step[1]):
        _finish(m, mover_id, "FIVE")
    elif len(m.moves) >= BOARD * BOARD:
        _finish(m, None, "DRAW")
    if m.status == "ACTIVE":
        m.deadline_at = now_kst() + timedelta(hours=MOVE_HOURS)


def _bot_step(game: str, moves: list, level: str):
    return (chess_game if game == CHESS else gomoku_ai).choose(moves, level)


async def _bot_reply(m: GameMatch) -> None:
    step = await asyncio.to_thread(_bot_step, m.game, m.moves, m.bot)
    if step is None:
        _finish(m, None, "DRAW")
    else:
        _apply(m, step, None)


def _engine_timeout(m: GameMatch, now: datetime) -> None:
    """엔진 게임의 기한이 지났다 — 엔진이 정한 규칙(없으면 기다리던 쪽의 패, 둘 다 기다렸으면 무승부)으로 끝낸다.
    엔진에 문제가 있어도(오류 · 모양이 틀린 답) 기한 정리는 끝까지 한다 — 이 판은 시간 초과 · 무승부로 끝내고,
    엔진이 반쯤 고친 판은 버린다. 기한 정리는 모든 대전 API 가 맨 먼저 부르므로 여기서 멈추면 오목 · 체스까지 막힌다."""
    saved = m.state
    try:
        eng = _engine(m.game)
        v = _seq(m)
        m.state = copy.deepcopy(saved or {})  # 엔진은 이 복사본을 고친다
        if hasattr(eng, "on_timeout"):
            outcome = eng.on_timeout(m, now)
        else:
            late = _waiting(m) - {BOT_ID}
            outcome = (_rival_id(m, next(iter(late))), "TIMEOUT") if len(late) == 1 else (None, "TIMEOUT_DRAW")
        outcome = _outcome(outcome)
        m.state["_v"] = v  # 엔진이 m.state 를 새 dict 로 바꿨어도 seq 는 그대로
    except Exception:  # noqa: BLE001
        logger.exception("match %s: engine timeout failed", m.id)
        m.state = saved
        outcome = (None, "TIMEOUT_DRAW")
    _end(m, outcome)


async def _sweep(db: AsyncSession, member_id: Optional[int] = None) -> None:
    """기한이 지난 도전과 판을 정리한다. 기한을 넘긴 판은 도장 없이 끝난다."""
    now = now_kst()
    q = select(GameMatch).where(GameMatch.status.in_(OPEN_STATUS), GameMatch.deadline_at < now)
    if member_id is not None:
        q = q.where(_mine(member_id))
    rows = (await db.execute(q.with_for_update(skip_locked=True))).scalars().all()
    for m in rows:
        if m.status == "PENDING":
            m.status = "EXPIRED"
            m.deadline_at = None
            m.finished_at = now
        elif m.game in CLASSIC_GAMES:
            turn = _turn_id(m)
            _finish(m, m.challenger_id if turn == m.opponent_id else m.opponent_id, "TIMEOUT")
        else:
            _engine_timeout(m, now)
    if rows:
        await db.commit()
        await _publish(*(m.id for m in rows))


async def _people(db: AsyncSession, ids: set) -> dict:
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    return {x.id: x for x in (await db.execute(select(Member).where(Member.id.in_(ids)))).scalars().all()}


def _person(p: Optional[Member]) -> dict:
    if p is None:
        return {"id": None, "name": "(알 수 없음)", "department": "", "avatarUrl": None}
    return {"id": p.id, "name": p.name, "department": p.department or "", "avatarUrl": member_avatar_url(p.id)}


def _bot_person(m: GameMatch, eng) -> dict:
    names = getattr(eng, "BOT_NAMES", None) or BOT_NAME
    return {"id": None, "name": names.get(m.bot, "컴퓨터"), "department": "연습 상대", "avatarUrl": None}


def _color(m: GameMatch, member_id: int) -> Optional[str]:
    if m.status == "PENDING" or (m.black_id is None and not m.bot):
        return None
    first = m.black_id == member_id
    if m.game == CHESS:
        return "white" if first else "black"
    return "black" if first else "white"


def _payload(m: GameMatch, member_id: int, people: dict, board: bool = False) -> dict:
    eng = _engine(m.game)
    rival = _rival_id(m, member_id)
    waiting = _waiting(m)
    out = {
        "id": m.id,
        "game": m.game,
        "status": m.status,
        "bot": m.bot,
        "opponent": _bot_person(m, eng) if m.bot else _person(people.get(rival)),
        "incoming": m.status == "PENDING" and m.opponent_id == member_id,
        "myColor": _color(m, member_id) if eng is None else None,
        "myTurn": member_id in waiting,
        "rivalTurn": (BOT_ID if m.bot else rival) in waiting,
        "moveCount": _seq(m),
        "seq": _seq(m),
        "result": None if m.status != "DONE" else ("draw" if _no_winner(m) else "win" if m.winner_id == member_id else "lose"),
        "endReason": m.end_reason,
        "reasonLabel": _reason_label(m),
        "deadlineAt": m.deadline_at.astimezone(KST).isoformat() if m.deadline_at else None,
        "finishedAt": m.finished_at.astimezone(KST).isoformat() if m.finished_at else None,
    }
    if board:
        out["me"] = _person(people.get(member_id))  # 대국 화면 위 「나 vs 상대」
        if eng is None:
            out["moves"] = m.moves
            if m.game == CHESS:
                b = chess_game.board_of(m.moves)
                out["fen"] = b.fen()
                out["check"] = b.is_check()
                out["legal"] = [x.uci() for x in b.legal_moves] if out["myTurn"] else []
            else:
                out["size"] = BOARD
    if eng is not None and m.state is not None:  # 받은 도전 · 거절 · 만료된 판은 아직 판이 없다
        extra = eng.view(m, member_id, board) or {}
        out.update({k: v for k, v in extra.items() if k not in PROTECTED})
    return out


async def _get(db: AsyncSession, member: Member, match_id: int, lock: bool = False) -> GameMatch:
    q = select(GameMatch).where(GameMatch.id == match_id, _mine(member.id))
    if lock:
        q = q.with_for_update()
    m = (await db.execute(q)).scalars().first()
    if m is None:
        raise_app_error("MATCH_NOT_FOUND", 404)
    return m


async def _view(db: AsyncSession, member: Member, m: GameMatch) -> dict:
    return _payload(m, member.id, await _people(db, {m.challenger_id, m.opponent_id}), board=True)


def _real_person(p: Member) -> bool:
    from app.services.transfer import _TRANSFER_EXCLUDED_EMAIL_DOMAINS, _TRANSFER_EXCLUDED_EMAIL_LOCAL

    local, _, domain = (p.email or "").lower().partition("@")
    oid = (p.entra_oid or "").lower()
    return bool(oid) and not oid.startswith("mock-") and local != _TRANSFER_EXCLUDED_EMAIL_LOCAL and domain not in _TRANSFER_EXCLUDED_EMAIL_DOMAINS


async def search_members(db: AsyncSession, member: Member, q: str) -> list:
    q = (q or "").strip()[:30]
    from sqlalchemy import func

    from app.services.transfer import _TRANSFER_EXCLUDED_EMAIL_DOMAINS, _TRANSFER_EXCLUDED_EMAIL_LOCAL

    # 양도 상대 목록과 같은 기준 — 실제 Teams 로그인 직원만. 시연용(mock-*·healthkeeper.local)·발송 계정(healthkeeper@) 제외
    stmt = (
        select(Member)
        .where(Member.status == MemberStatus.ACTIVE, Member.id != member.id)
        .where(Member.entra_oid.is_not(None), ~func.lower(Member.entra_oid).like("mock-%"))
        .where(func.lower(func.split_part(Member.email, "@", 1)) != _TRANSFER_EXCLUDED_EMAIL_LOCAL)
        .where(~func.lower(func.split_part(Member.email, "@", 2)).in_(list(_TRANSFER_EXCLUDED_EMAIL_DOMAINS)))
        .order_by(Member.name)
        .limit(20)
    )
    if q:
        like = f"%{q.replace('%', '').replace('_', '')}%"
        stmt = stmt.where(or_(Member.name.ilike(like), Member.department.ilike(like)))
    return [_person(p) for p in (await db.execute(stmt)).scalars().all()]


async def start_bot(db: AsyncSession, member: Member, level: str, game: str = GOMOKU) -> dict:
    ensure_open()
    _check_game(game)
    eng = _engine(game)
    if eng is not None and not getattr(eng, "SUPPORTS_BOT", False):
        raise_app_error("MATCH_NO_BOT")
    if level not in (gomoku_ai.LEVELS if eng is None else getattr(eng, "BOT_LEVELS", gomoku_ai.LEVELS)):
        raise_app_error("MATCH_BAD_LEVEL")
    await _sweep(db, member.id)
    going = (
        await db.execute(
            select(GameMatch).where(
                GameMatch.game == game, GameMatch.status == "ACTIVE", GameMatch.challenger_id == member.id, GameMatch.bot.is_not(None)
            )
        )
    ).scalars().first()
    if going is not None:
        return await _view(db, member, going)
    # 컴퓨터가 먼저 두는 쪽이면 black_id 를 비워 두고 첫 수를 바로 둔다
    first = random.random() < 0.5
    if eng is None:
        moves = [] if first else [await asyncio.to_thread(_bot_step, game, [], level)]
        m = GameMatch(
            game=game, challenger_id=member.id, opponent_id=None, bot=level, status="ACTIVE", moves=moves,
            black_id=member.id if first else None, deadline_at=now_kst() + timedelta(hours=MOVE_HOURS),
        )
    else:
        m = GameMatch(
            game=game, challenger_id=member.id, opponent_id=None, bot=level, status="ACTIVE", moves=[],
            black_id=member.id if first else None,
        )
        _start_engine(m, eng, (member.id, BOT_ID) if first else (BOT_ID, member.id))
        await _bot_turns(m, eng)
    db.add(m)
    await db.commit()
    return await _view(db, member, m)


async def create(db: AsyncSession, member: Member, opponent_id: int, game: str = GOMOKU) -> dict:
    ensure_open()
    _check_game(game)
    await _sweep(db, member.id)
    rival = await db.get(Member, opponent_id)
    if rival is None or rival.id == member.id or rival.status != MemberStatus.ACTIVE or not _real_person(rival):
        raise_app_error("MATCH_BAD_OPPONENT")
    rows = (
        await db.execute(
            select(GameMatch).where(GameMatch.game == game, GameMatch.status.in_(OPEN_STATUS), _mine(member.id), GameMatch.bot.is_(None))
        )
    ).scalars().all()
    if any(_rival_id(m, member.id) == rival.id for m in rows):
        raise_app_error("MATCH_ALREADY")
    if len(rows) >= MAX_OPEN:
        raise_app_error("MATCH_LIMIT")
    m = GameMatch(
        game=game, challenger_id=member.id, opponent_id=rival.id, status="PENDING", moves=[],
        deadline_at=now_kst() + timedelta(hours=ACCEPT_HOURS),
    )
    db.add(m)
    await db.flush()
    notify = await teams_service.enqueue_match_challenged_notice(
        db, game=game, match_id=m.id, challenger=member, target=rival, deadline_at=m.deadline_at
    )
    await db.commit()
    return await _view(db, member, m), notify


async def accept(db: AsyncSession, member: Member, match_id: int) -> dict:
    ensure_open()
    await _sweep(db, member.id)
    m = await _get(db, member, match_id, lock=True)
    if m.status != "PENDING" or m.opponent_id != member.id:
        raise_app_error("MATCH_NOT_PENDING")
    m.status = "ACTIVE"
    m.black_id = random.choice((m.challenger_id, m.opponent_id))
    m.deadline_at = now_kst() + timedelta(hours=MOVE_HOURS)
    eng = _engine(m.game)
    if eng is not None:  # 엔진 게임은 여기서 판을 차린다 — 먼저 하는 사람은 black_id
        _start_engine(m, eng, (m.black_id, _rival_id(m, m.black_id)))
    challenger = await db.get(Member, m.challenger_id)
    notify = []
    if challenger is not None:
        notify = await teams_service.enqueue_match_accepted_notice(
            db, game=m.game, match_id=m.id, challenger=challenger, opponent=member,
            first=challenger if m.black_id == challenger.id else member,
        )
    await db.commit()
    await _publish(m.id)
    return await _view(db, member, m), notify


async def decline(db: AsyncSession, member: Member, match_id: int) -> dict:
    m = await _get(db, member, match_id, lock=True)
    if m.status != "PENDING":
        raise_app_error("MATCH_NOT_PENDING")
    m.status = "DECLINED"
    m.deadline_at = None
    m.finished_at = now_kst()
    rival = await db.get(Member, _rival_id(m, member.id))
    notify = []
    if rival is not None:
        if member.id == m.opponent_id:  # 받은 사람이 거절
            notify = await teams_service.enqueue_match_declined_notice(db, game=m.game, match_id=m.id, challenger=rival, opponent=member)
        else:  # 건 사람이 신청을 거둠
            notify = await teams_service.enqueue_match_cancelled_notice(db, game=m.game, match_id=m.id, challenger=member, opponent=rival)
    await db.commit()
    await _publish(m.id)
    return await _view(db, member, m), notify


async def _stamp_both(db: AsyncSession, m: GameMatch, member: Member) -> Optional[dict]:
    """끝난 판은 두 사람 모두 오늘 도장을 받는다. 돌려주는 값은 방금 둔 사람의 도장."""
    if not _counts(m):
        return None
    today = today_kst()
    mine = await _give_stamp(db, member, m.game, today)
    rival_id = _rival_id(m, member.id)
    rival = await db.get(Member, rival_id) if rival_id else None
    if rival is not None:
        await _give_stamp(db, rival, m.game, today)
    return mine


def _valid_step(m: GameMatch, x: Optional[int], y: Optional[int], uci: Optional[str]):
    if m.game == CHESS:
        try:
            step = chess.Move.from_uci(uci or "")
        except ValueError:
            raise_app_error("MATCH_BAD_MOVE")
        if step not in chess_game.board_of(m.moves).legal_moves:
            raise_app_error("MATCH_BAD_MOVE")
        return step.uci()
    if x is None or y is None or not (0 <= x < BOARD and 0 <= y < BOARD) or [x, y] in m.moves:
        raise_app_error("MATCH_BAD_MOVE")
    return [x, y]


async def _engine_move(m: GameMatch, eng, member_id: int, seq: int, data: Optional[dict]) -> None:
    """엔진 게임 한 번의 행동 — 차례 · seq 를 확인하고 엔진에 넘긴다. 컴퓨터전이면 컴퓨터 차례까지 이어서."""
    if member_id not in _waiting(m):
        raise_app_error("MATCH_NOT_YOUR_TURN")
    if getattr(eng, "STALE_CHECK", True) and seq != _seq(m):
        raise_app_error("MATCH_STALE")
    now = now_kst()
    v = _seq(m)
    m.state = copy.deepcopy(m.state or {})  # JSON 칸은 새 객체를 넣어야 바뀐 줄 안다 — 엔진은 이 복사본을 고친다
    outcome = eng.act(m, member_id, data if isinstance(data, dict) else {}, now)
    _after_act(m, eng, outcome, now, v)
    if m.bot:
        await _bot_turns(m, eng)


async def move(
    db: AsyncSession, member: Member, match_id: int, x: Optional[int], y: Optional[int], uci: Optional[str], seq: int,
    data: Optional[dict] = None,
) -> dict:
    """한 수 두기 — 오목은 x · y, 체스는 uci, 엔진 게임은 data(게임마다 모양이 다르다). seq 는 화면이 본 판의 번호."""
    ensure_open()
    await _sweep(db, member.id)
    m = await _get(db, member, match_id, lock=True)
    if m.status != "ACTIVE":
        raise_app_error("MATCH_NOT_ACTIVE")
    eng = _engine(m.game)
    if eng is not None:
        await _engine_move(m, eng, member.id, seq, data)
    else:
        if _turn_id(m) != member.id:
            raise_app_error("MATCH_NOT_YOUR_TURN")
        if seq != len(m.moves):
            raise_app_error("MATCH_STALE")
        _apply(m, _valid_step(m, x, y, uci), member.id)
        if m.bot and m.status == "ACTIVE":
            await _bot_reply(m)
    await db.commit()
    if not m.bot:
        await _publish(m.id)
    stamp = await _stamp_both(db, m, member) if m.status == "DONE" else None
    return {**(await _view(db, member, m)), "stamp": stamp}


async def resign(db: AsyncSession, member: Member, match_id: int) -> dict:
    ensure_open()
    await _sweep(db, member.id)
    m = await _get(db, member, match_id, lock=True)
    if m.status != "ACTIVE":
        raise_app_error("MATCH_NOT_ACTIVE")
    _finish(m, _rival_id(m, member.id), "RESIGN")
    await db.commit()
    if not m.bot:
        await _publish(m.id)
    return {**(await _view(db, member, m)), "stamp": await _stamp_both(db, m, member)}


async def detail(db: AsyncSession, member: Member, match_id: int) -> dict:
    await _sweep(db, member.id)
    return await _view(db, member, await _get(db, member, match_id))


async def wait(db: AsyncSession, member: Member, match_id: int, seq: int, status: str) -> dict:
    """판이 내가 본 것(seq · 상태)과 달라질 때까지 최대 WAIT_SECONDS 기다렸다가 판을 돌려준다.
    상대가 두면 그 즉시 깨어나므로 화면이 바로 바뀐다. seq 는 오목 · 체스는 둔 수, 엔진 게임은 행동 수."""
    from app.database import get_redis

    pubsub = None
    try:
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(_channel(redis, match_id))  # 판을 읽기 전에 먼저 귀를 연다 — 그 사이 둔 수도 놓치지 않게
    except Exception:  # noqa: BLE001
        logger.warning("match subscribe failed", exc_info=True)
        pubsub = None
    try:
        await _sweep(db, member.id)
        m = await _get(db, member, match_id)
        if _seq(m) != seq or m.status != status:
            return await _view(db, member, m)
        await db.commit()  # 읽기만 했다 — 기다리는 동안 DB 연결을 쥐고 있지 않게 끝낸다
        if pubsub is None:
            await asyncio.sleep(2)  # 귀를 못 열었다 — 바로 돌려주면 화면이 쉬지 않고 다시 물으니 잠깐 쉬고 판을 다시 읽는다
        else:
            loop = asyncio.get_running_loop()
            end = loop.time() + WAIT_SECONDS
            while (left := end - loop.time()) > 0:
                if await pubsub.get_message(ignore_subscribe_messages=True, timeout=left):
                    break
                await asyncio.sleep(0.05)  # 구독 확인 같은 빈 응답에 헛돌지 않게
        await _sweep(db, member.id)
        m = await _get(db, member, match_id)
        await db.refresh(m)  # 같은 세션에 남은 옛 판이 아니라 방금 저장된 판을 읽는다
        return await _view(db, member, m)
    finally:
        if pubsub is not None:
            try:
                await pubsub.unsubscribe()
                await pubsub.aclose()
            except Exception:  # noqa: BLE001
                pass


def _my_turn_safe(m: GameMatch, member_id: int) -> bool:
    """알림 숫자용 — 한 엔진에 문제가 있어도 다른 게임 알림은 그대로 센다."""
    try:
        return member_id in _waiting(m)
    except Exception:  # noqa: BLE001
        logger.exception("match %s: waiting_for failed", m.id)
        return False


async def inbox(db: AsyncSession, member: Member) -> dict:
    """게임별 내 차례 · 받은 도전 수 — 컴퓨터전은 알리지 않는다."""
    await _sweep(db, member.id)
    rows = (
        await db.execute(select(GameMatch).where(GameMatch.status.in_(OPEN_STATUS), _mine(member.id), GameMatch.bot.is_(None)))
    ).scalars().all()
    out = {}
    for game in MATCH_GAMES:
        if not game_visible(game):
            continue
        mine = [m for m in rows if m.game == game]
        out[game] = {
            "myTurn": sum(1 for m in mine if _my_turn_safe(m, member.id)),
            "incoming": sum(1 for m in mine if m.status == "PENDING" and m.opponent_id == member.id),
        }
    return out


async def _ranking(db: AsyncSession, member: Member, game: str) -> dict:
    """순위 — 승수로 줄을 세운다. 같은 상대에게 하루에 거둔 승은 1승, 당한 패는 1패로 친다 (승수 몰아주기 방지 · 승패를 같은 잣대로). 컴퓨터전은 넣지 않는다."""
    rows = (
        await db.execute(select(GameMatch).where(GameMatch.game == game, GameMatch.status == "DONE", GameMatch.bot.is_(None)))
    ).scalars().all()
    wins: dict = {}
    losses: dict = {}
    for m in rows:
        if not _counts(m) or m.winner_id is None:
            continue
        loser = _rival_id(m, m.winner_id)
        day = m.finished_at.astimezone(KST).date()
        wins.setdefault(m.winner_id, set()).add((loser, day))
        losses.setdefault(loser, set()).add((m.winner_id, day))
    people = {i: p for i, p in (await _people(db, set(wins) | set(losses))).items() if p.status == MemberStatus.ACTIVE}
    table = [{**_person(p), "wins": len(wins.get(i, ())), "losses": len(losses.get(i, ()))} for i, p in people.items()]
    table.sort(key=lambda r: (-r["wins"], r["losses"], r["name"]))
    rank, prev = 0, None
    for i, row in enumerate(table, 1):
        if (row["wins"], row["losses"]) != prev:
            rank, prev = i, (row["wins"], row["losses"])
        row["rank"] = rank
    return {"top": table[:RANK_SIZE], "me": next((r for r in table if r["id"] == member.id), None)}


async def overview(db: AsyncSession, member: Member, game: str = GOMOKU) -> dict:
    _check_game(game)
    await _sweep(db, member.id)
    rows = (
        await db.execute(select(GameMatch).where(GameMatch.game == game, GameMatch.status.in_(OPEN_STATUS), _mine(member.id)))
    ).scalars().all()
    done = (
        await db.execute(
            select(GameMatch)
            .where(GameMatch.game == game, GameMatch.status == "DONE", _mine(member.id))
            .order_by(GameMatch.finished_at.desc())
            .limit(10)
        )
    ).scalars().all()
    people = await _people(db, {_rival_id(m, member.id) for m in [*rows, *done]})
    items = [_payload(m, member.id, people) for m in rows]
    return {
        "incoming": [x for x in items if x["incoming"]],
        "sent": [x for x in items if x["status"] == "PENDING" and not x["incoming"]],
        "myTurn": [x for x in items if x["myTurn"]],
        "waiting": [x for x in items if x["status"] == "ACTIVE" and not x["myTurn"]],
        "recent": [_payload(m, member.id, people) for m in done],
        "ranking": await _ranking(db, member, game),
    }
