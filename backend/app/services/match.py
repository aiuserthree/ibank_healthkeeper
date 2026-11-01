"""턴제 대전 — 오목. 직원끼리 또는 컴퓨터와. 수는 아케이드가 열린 시간에만 둘 수 있다."""

from __future__ import annotations

import asyncio
import random
from datetime import timedelta
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.time import KST, now_kst, today_kst
from app.models import GameMatch, Member, MemberStatus
from app.services import gomoku_ai
from app.services.avatar import member_avatar_url
from app.services.game import _give_stamp, ensure_open

GOMOKU = "gomoku"
BOARD = 15
ACCEPT_HOURS = 24  # 받은 도전을 기다리는 시간
MOVE_HOURS = 24  # 한 수를 기다리는 시간 — 넘기면 기한을 넘긴 쪽의 패
MAX_OPEN = 10  # 한 사람이 동시에 걸어 둘 수 있는 대국
MIN_MOVES = 10  # 기권·시간 초과는 이만큼 둔 판만 도장과 순위에 반영 — 바로 기권해 도장·승수를 얻지 못하게
RANK_SIZE = 20
BOT_NAME = {"easy": "컴퓨터 · 쉬움", "normal": "컴퓨터 · 보통", "hard": "컴퓨터 · 어려움"}

OPEN_STATUS = ("PENDING", "ACTIVE")


def _mine(member_id: int):
    return or_(GameMatch.challenger_id == member_id, GameMatch.opponent_id == member_id)


def _rival_id(m: GameMatch, member_id: int) -> Optional[int]:
    return m.opponent_id if m.challenger_id == member_id else m.challenger_id


def _turn_id(m: GameMatch) -> Optional[int]:
    if m.status != "ACTIVE":
        return None
    if m.bot:  # 컴퓨터는 사람이 둔 요청 안에서 바로 두므로 저장된 판은 늘 사람 차례
        return m.challenger_id
    white = m.opponent_id if m.black_id == m.challenger_id else m.challenger_id
    return m.black_id if len(m.moves) % 2 == 0 else white


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
    return m.end_reason in ("FIVE", "DRAW") or len(m.moves) >= MIN_MOVES


def _finish(m: GameMatch, winner_id: Optional[int], reason: str) -> None:
    m.status = "DONE"
    m.winner_id = winner_id
    m.end_reason = reason
    m.deadline_at = None
    m.finished_at = now_kst()


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


async def _people(db: AsyncSession, ids: set[int]) -> dict[int, Member]:
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    return {x.id: x for x in (await db.execute(select(Member).where(Member.id.in_(ids)))).scalars().all()}


def _person(p: Optional[Member]) -> dict:
    if p is None:
        return {"id": None, "name": "(알 수 없음)", "department": "", "avatarUrl": None}
    return {"id": p.id, "name": p.name, "department": p.department or "", "avatarUrl": member_avatar_url(p.id)}


def _payload(m: GameMatch, member_id: int, people: dict[int, Member], board: bool = False) -> dict:
    rival = _rival_id(m, member_id)
    is_black = m.black_id == member_id
    out = {
        "id": m.id,
        "status": m.status,
        "bot": m.bot,
        "opponent": {"id": None, "name": BOT_NAME[m.bot], "department": "연습 상대", "avatarUrl": None} if m.bot else _person(people.get(rival)),
        "incoming": m.status == "PENDING" and m.opponent_id == member_id,
        "myColor": None if m.status == "PENDING" else ("black" if is_black else "white"),
        "myTurn": _turn_id(m) == member_id,
        "moveCount": len(m.moves),
        "result": None if m.status != "DONE" else ("draw" if m.end_reason == "DRAW" else "win" if m.winner_id == member_id else "lose"),
        "endReason": m.end_reason,
        "deadlineAt": m.deadline_at.astimezone(KST).isoformat() if m.deadline_at else None,
        "finishedAt": m.finished_at.astimezone(KST).isoformat() if m.finished_at else None,
    }
    if board:
        out["moves"] = m.moves
        out["size"] = BOARD
    return out


async def _get(db: AsyncSession, member: Member, match_id: int, lock: bool = False) -> GameMatch:
    q = select(GameMatch).where(GameMatch.id == match_id, GameMatch.game == GOMOKU, _mine(member.id))
    if lock:
        q = q.with_for_update()
    m = (await db.execute(q)).scalars().first()
    if m is None:
        raise_app_error("MATCH_NOT_FOUND", 404)
    return m


async def _view(db: AsyncSession, member: Member, m: GameMatch) -> dict:
    return _payload(m, member.id, await _people(db, {m.challenger_id, m.opponent_id}), board=True)


async def search_members(db: AsyncSession, member: Member, q: str) -> list[dict]:
    q = (q or "").strip()[:30]
    stmt = select(Member).where(Member.status == MemberStatus.ACTIVE, Member.id != member.id).order_by(Member.name).limit(20)
    if q:
        like = f"%{q.replace('%', '').replace('_', '')}%"
        stmt = stmt.where(or_(Member.name.ilike(like), Member.department.ilike(like)))
    return [_person(p) for p in (await db.execute(stmt)).scalars().all()]


async def start_bot(db: AsyncSession, member: Member, level: str) -> dict:
    ensure_open()
    if level not in gomoku_ai.LEVELS:
        raise_app_error("MATCH_BAD_LEVEL")
    await _sweep(db, member.id)
    going = (
        await db.execute(
            select(GameMatch).where(
                GameMatch.game == GOMOKU, GameMatch.status == "ACTIVE", GameMatch.challenger_id == member.id, GameMatch.bot.is_not(None)
            )
        )
    ).scalars().first()
    if going is not None:
        return await _view(db, member, going)
    # 흑은 먼저 두는 쪽 — 컴퓨터가 흑이면 black_id 를 비워 두고 첫 수를 바로 둔다
    black = random.random() < 0.5
    moves = [] if black else [await asyncio.to_thread(gomoku_ai.choose, [], level)]
    m = GameMatch(
        game=GOMOKU, challenger_id=member.id, opponent_id=None, bot=level, status="ACTIVE", moves=moves,
        black_id=member.id if black else None, deadline_at=now_kst() + timedelta(hours=MOVE_HOURS),
    )
    db.add(m)
    await db.commit()
    return await _view(db, member, m)


async def create(db: AsyncSession, member: Member, opponent_id: int) -> dict:
    ensure_open()
    await _sweep(db, member.id)
    rival = await db.get(Member, opponent_id)
    if rival is None or rival.id == member.id or rival.status != MemberStatus.ACTIVE:
        raise_app_error("MATCH_BAD_OPPONENT")
    rows = (
        await db.execute(
            select(GameMatch).where(GameMatch.game == GOMOKU, GameMatch.status.in_(OPEN_STATUS), _mine(member.id), GameMatch.bot.is_(None))
        )
    ).scalars().all()
    if any(_rival_id(m, member.id) == rival.id for m in rows):
        raise_app_error("MATCH_ALREADY")
    if len(rows) >= MAX_OPEN:
        raise_app_error("MATCH_LIMIT")
    m = GameMatch(
        game=GOMOKU, challenger_id=member.id, opponent_id=rival.id, status="PENDING", moves=[],
        deadline_at=now_kst() + timedelta(hours=ACCEPT_HOURS),
    )
    db.add(m)
    await db.commit()
    return await _view(db, member, m)


async def accept(db: AsyncSession, member: Member, match_id: int) -> dict:
    ensure_open()
    await _sweep(db, member.id)
    m = await _get(db, member, match_id, lock=True)
    if m.status != "PENDING" or m.opponent_id != member.id:
        raise_app_error("MATCH_NOT_PENDING")
    m.status = "ACTIVE"
    m.black_id = random.choice((m.challenger_id, m.opponent_id))
    m.deadline_at = now_kst() + timedelta(hours=MOVE_HOURS)
    await db.commit()
    return await _view(db, member, m)


async def decline(db: AsyncSession, member: Member, match_id: int) -> dict:
    m = await _get(db, member, match_id, lock=True)
    if m.status != "PENDING":
        raise_app_error("MATCH_NOT_PENDING")
    m.status = "DECLINED"
    m.deadline_at = None
    m.finished_at = now_kst()
    await db.commit()
    return await _view(db, member, m)


async def _stamp_both(db: AsyncSession, m: GameMatch, member: Member) -> Optional[dict]:
    """끝난 판은 두 사람 모두 오늘 도장을 받는다. 돌려주는 값은 방금 둔 사람의 도장."""
    if not _counts(m):
        return None
    today = today_kst()
    mine = await _give_stamp(db, member, GOMOKU, today)
    rival_id = _rival_id(m, member.id)
    rival = await db.get(Member, rival_id) if rival_id else None
    if rival is not None:
        await _give_stamp(db, rival, GOMOKU, today)
    return mine


async def move(db: AsyncSession, member: Member, match_id: int, x: int, y: int, seq: int) -> dict:
    ensure_open()
    await _sweep(db, member.id)
    m = await _get(db, member, match_id, lock=True)
    if m.status != "ACTIVE":
        raise_app_error("MATCH_NOT_ACTIVE")
    if _turn_id(m) != member.id:
        raise_app_error("MATCH_NOT_YOUR_TURN")
    if seq != len(m.moves):
        raise_app_error("MATCH_STALE")
    if not (0 <= x < BOARD and 0 <= y < BOARD) or [x, y] in m.moves:
        raise_app_error("MATCH_BAD_MOVE")
    m.moves = [*m.moves, [x, y]]
    if _five(m.moves, x, y):
        _finish(m, member.id, "FIVE")
    elif len(m.moves) >= BOARD * BOARD:
        _finish(m, None, "DRAW")
    elif m.bot:
        reply = await asyncio.to_thread(gomoku_ai.choose, m.moves, m.bot)
        if reply is None:
            _finish(m, None, "DRAW")
        else:
            m.moves = [*m.moves, reply]
            if _five(m.moves, reply[0], reply[1]):
                _finish(m, None, "FIVE")          # 승자 칸이 비면 컴퓨터가 이긴 판
            elif len(m.moves) >= BOARD * BOARD:
                _finish(m, None, "DRAW")
            else:
                m.deadline_at = now_kst() + timedelta(hours=MOVE_HOURS)
    else:
        m.deadline_at = now_kst() + timedelta(hours=MOVE_HOURS)
    await db.commit()
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
    return {**(await _view(db, member, m)), "stamp": await _stamp_both(db, m, member)}


async def detail(db: AsyncSession, member: Member, match_id: int) -> dict:
    await _sweep(db, member.id)
    return await _view(db, member, await _get(db, member, match_id))


async def inbox(db: AsyncSession, member: Member) -> dict:
    await _sweep(db, member.id)
    rows = (
        await db.execute(
            select(GameMatch).where(GameMatch.game == GOMOKU, GameMatch.status.in_(OPEN_STATUS), _mine(member.id), GameMatch.bot.is_(None))
        )
    ).scalars().all()
    return {
        "myTurn": sum(1 for m in rows if _turn_id(m) == member.id),
        "incoming": sum(1 for m in rows if m.status == "PENDING" and m.opponent_id == member.id),
    }


async def _ranking(db: AsyncSession, member: Member) -> dict:
    """순위 — 승수로 줄을 세운다. 같은 상대에게 하루에 거둔 승은 1승으로 친다 (승수 몰아주기 방지). 컴퓨터전은 넣지 않는다."""
    rows = (
        await db.execute(
            select(GameMatch).where(
                GameMatch.game == GOMOKU, GameMatch.status == "DONE", GameMatch.end_reason != "DRAW", GameMatch.bot.is_(None)
            )
        )
    ).scalars().all()
    wins: dict[int, set] = {}
    losses: dict[int, int] = {}
    for m in rows:
        if not _counts(m) or m.winner_id is None:
            continue
        loser = _rival_id(m, m.winner_id)
        wins.setdefault(m.winner_id, set()).add((loser, m.finished_at.astimezone(KST).date()))
        losses[loser] = losses.get(loser, 0) + 1
    ids = set(wins) | set(losses)
    people = {i: p for i, p in (await _people(db, ids)).items() if p.status == MemberStatus.ACTIVE}
    table = [
        {**_person(p), "wins": len(wins.get(i, ())), "losses": losses.get(i, 0)} for i, p in people.items()
    ]
    table.sort(key=lambda r: (-r["wins"], r["losses"], r["name"]))
    rank, prev = 0, None
    for i, row in enumerate(table, 1):
        if (row["wins"], row["losses"]) != prev:
            rank, prev = i, (row["wins"], row["losses"])
        row["rank"] = rank
    return {"top": table[:RANK_SIZE], "me": next((r for r in table if r["id"] == member.id), None)}


async def overview(db: AsyncSession, member: Member) -> dict:
    await _sweep(db, member.id)
    rows = (
        await db.execute(select(GameMatch).where(GameMatch.game == GOMOKU, GameMatch.status.in_(OPEN_STATUS), _mine(member.id)))
    ).scalars().all()
    done = (
        await db.execute(
            select(GameMatch)
            .where(GameMatch.game == GOMOKU, GameMatch.status == "DONE", _mine(member.id))
            .order_by(GameMatch.finished_at.desc())
            .limit(10)
        )
    ).scalars().all()
    all_rows = [*rows, *done]
    people = await _people(db, {_rival_id(m, member.id) for m in all_rows})
    items = [_payload(m, member.id, people) for m in rows]
    return {
        "incoming": [x for x in items if x["incoming"]],
        "sent": [x for x in items if x["status"] == "PENDING" and not x["incoming"]],
        "myTurn": [x for x in items if x["myTurn"]],
        "waiting": [x for x in items if x["status"] == "ACTIVE" and not x["myTurn"]],
        "recent": [_payload(m, member.id, people) for m in done],
        "ranking": await _ranking(db, member),
    }
