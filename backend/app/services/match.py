"""턴제 대전 — 오목 · 체스. 직원끼리 또는 컴퓨터와. 수는 아케이드가 열린 시간에만 둘 수 있다."""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import timedelta
from typing import Optional

import chess
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import KST, now_kst, today_kst
from app.models import GameMatch, Member, MemberStatus
from app.services import chess_game, gomoku_ai
from app.services import teams as teams_service
from app.services.avatar import member_avatar_url
from app.services.game import _give_stamp, ensure_open

GOMOKU = "gomoku"
CHESS = "chess"
MATCH_GAMES = (GOMOKU, CHESS)
BOARD = 15
ACCEPT_HOURS = 24  # 받은 도전을 기다리는 시간
MOVE_HOURS = 24  # 한 수를 기다리는 시간 — 넘기면 기한을 넘긴 쪽의 패
MAX_OPEN = 10  # 한 사람이 게임마다 동시에 걸어 둘 수 있는 대국
MIN_MOVES = 10  # 기권·시간 초과는 이만큼 둔 판만 도장과 순위에 반영 — 바로 기권해 도장·승수를 얻지 못하게
RANK_SIZE = 20
WAIT_SECONDS = 20  # 상대 수를 기다리는 한 번의 요청 — 그 안에 판이 바뀌면 바로 돌려준다
BOT_NAME = {"easy": "컴퓨터 · 쉬움", "normal": "컴퓨터 · 보통", "hard": "컴퓨터 · 어려움"}

OPEN_STATUS = ("PENDING", "ACTIVE")
NO_WINNER = ("DRAW", "STALEMATE")      # 승부가 나지 않은 끝
PLAYED_OUT = ("FIVE", "CHECKMATE", *NO_WINNER)


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
    if game not in MATCH_GAMES:
        raise_app_error("MATCH_NOT_FOUND", 404)
    return game


def _mine(member_id: int):
    return or_(GameMatch.challenger_id == member_id, GameMatch.opponent_id == member_id)


def _rival_id(m: GameMatch, member_id: int) -> Optional[int]:
    return m.opponent_id if m.challenger_id == member_id else m.challenger_id


def _turn_id(m: GameMatch) -> Optional[int]:
    """black_id 는 먼저 두는 쪽 — 오목은 흑, 체스는 백이다."""
    if m.status != "ACTIVE":
        return None
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
    return m.end_reason in PLAYED_OUT or len(m.moves) >= MIN_MOVES


def _finish(m: GameMatch, winner_id: Optional[int], reason: str) -> None:
    m.status = "DONE"
    m.winner_id = winner_id
    m.end_reason = reason
    m.deadline_at = None
    m.finished_at = now_kst()


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
        else:
            turn = _turn_id(m)
            _finish(m, m.challenger_id if turn == m.opponent_id else m.opponent_id, "TIMEOUT")
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


def _color(m: GameMatch, member_id: int) -> Optional[str]:
    if m.status == "PENDING" or (m.black_id is None and not m.bot):
        return None
    first = m.black_id == member_id
    if m.game == CHESS:
        return "white" if first else "black"
    return "black" if first else "white"


def _payload(m: GameMatch, member_id: int, people: dict, board: bool = False) -> dict:
    rival = _rival_id(m, member_id)
    out = {
        "id": m.id,
        "game": m.game,
        "status": m.status,
        "bot": m.bot,
        "opponent": {"id": None, "name": BOT_NAME[m.bot], "department": "연습 상대", "avatarUrl": None} if m.bot else _person(people.get(rival)),
        "incoming": m.status == "PENDING" and m.opponent_id == member_id,
        "myColor": _color(m, member_id),
        "myTurn": _turn_id(m) == member_id,
        "moveCount": len(m.moves),
        "result": None if m.status != "DONE" else ("draw" if m.end_reason in NO_WINNER else "win" if m.winner_id == member_id else "lose"),
        "endReason": m.end_reason,
        "deadlineAt": m.deadline_at.astimezone(KST).isoformat() if m.deadline_at else None,
        "finishedAt": m.finished_at.astimezone(KST).isoformat() if m.finished_at else None,
    }
    if board:
        out["moves"] = m.moves
        if m.game == CHESS:
            b = chess_game.board_of(m.moves)
            out["fen"] = b.fen()
            out["check"] = b.is_check()
            out["legal"] = [x.uci() for x in b.legal_moves] if out["myTurn"] else []
        else:
            out["size"] = BOARD
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
    if level not in gomoku_ai.LEVELS:
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
    moves = [] if first else [await asyncio.to_thread(_bot_step, game, [], level)]
    m = GameMatch(
        game=game, challenger_id=member.id, opponent_id=None, bot=level, status="ACTIVE", moves=moves,
        black_id=member.id if first else None, deadline_at=now_kst() + timedelta(hours=MOVE_HOURS),
    )
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


async def move(db: AsyncSession, member: Member, match_id: int, x: Optional[int], y: Optional[int], uci: Optional[str], seq: int) -> dict:
    ensure_open()
    await _sweep(db, member.id)
    m = await _get(db, member, match_id, lock=True)
    if m.status != "ACTIVE":
        raise_app_error("MATCH_NOT_ACTIVE")
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
    """판이 내가 본 것(수 · 상태)과 달라질 때까지 최대 WAIT_SECONDS 기다렸다가 판을 돌려준다.
    상대가 두면 그 즉시 깨어나므로 화면이 바로 바뀐다."""
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
        if len(m.moves) != seq or m.status != status or pubsub is None:
            return await _view(db, member, m)
        await db.commit()  # 읽기만 했다 — 기다리는 동안 DB 연결을 쥐고 있지 않게 끝낸다
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


async def inbox(db: AsyncSession, member: Member) -> dict:
    """게임별 내 차례 · 받은 도전 수 — 컴퓨터전은 알리지 않는다."""
    await _sweep(db, member.id)
    rows = (
        await db.execute(select(GameMatch).where(GameMatch.status.in_(OPEN_STATUS), _mine(member.id), GameMatch.bot.is_(None)))
    ).scalars().all()
    out = {}
    for game in MATCH_GAMES:
        mine = [m for m in rows if m.game == game]
        out[game] = {
            "myTurn": sum(1 for m in mine if _turn_id(m) == member.id),
            "incoming": sum(1 for m in mine if m.status == "PENDING" and m.opponent_id == member.id),
        }
    return out


async def _ranking(db: AsyncSession, member: Member, game: str) -> dict:
    """순위 — 승수로 줄을 세운다. 같은 상대에게 하루에 거둔 승은 1승으로 친다 (승수 몰아주기 방지). 컴퓨터전은 넣지 않는다."""
    rows = (
        await db.execute(select(GameMatch).where(GameMatch.game == game, GameMatch.status == "DONE", GameMatch.bot.is_(None)))
    ).scalars().all()
    wins: dict = {}
    losses: dict = {}
    for m in rows:
        if not _counts(m) or m.winner_id is None:
            continue
        loser = _rival_id(m, m.winner_id)
        wins.setdefault(m.winner_id, set()).add((loser, m.finished_at.astimezone(KST).date()))
        losses[loser] = losses.get(loser, 0) + 1
    people = {i: p for i, p in (await _people(db, set(wins) | set(losses))).items() if p.status == MemberStatus.ACTIVE}
    table = [{**_person(p), "wins": len(wins.get(i, ())), "losses": losses.get(i, 0)} for i, p in people.items()]
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
