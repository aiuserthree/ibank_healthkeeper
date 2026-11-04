"""2인 협동 방 — 초대 → 수락 → 둘 다 준비 → 시작. 방탈출(escape) · 점심 분식집(kitchen) · 말해 봐 맞혀 봐(words)가 함께 쓴다.

방탈출: 두 사람은 서로 다른 쪽을 보고, 자물쇠의 단서는 늘 반대쪽에 있다. 정답은 서버에서만 맞춰 보고,
화면에는 내 쪽에서 보이는 것만 보낸다. 분식집(kitchen_game) · 낱말(word_game)은 시간제 게임 엔진으로 돌아간다.
바뀔 때마다 seq 를 올리고 알려서 상대 화면이 바로 바뀐다.
"""

from __future__ import annotations

import copy
import random
import re
import time
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import raise_app_error
from app.core.time import KST, now_kst, today_kst
from app.models import EscapeRoom, Member, MemberStatus, TeamsMessageType
from app.services import kitchen_game, maze_game, realtime, word_game
from app.services import teams as teams_service
from app.services.escape_rooms import DEFAULT_ROOM, ROOMS, Puzzle, Room

# 협동 방 종류 — 방탈출 방들 + 점심 분식집
ALL_ROOMS = {**ROOMS, **{e.ROOM.key: e.ROOM for e in (kitchen_game, word_game, maze_game)}}
# 시간제 게임 엔진 — start · advance · act · view · score · end_code · summary · START_TEXT 를 갖춘다
ENGINES = {"kitchen": kitchen_game, "words": word_game, "maze": maze_game}


def _engine(room):
    return ENGINES.get(room.game)
from app.services.game import CLOSED_WINDOWS, _give_stamp, ensure_open, is_public_holiday
from app.services.match import _person, _real_person

KIND = "escape"
INVITE_HOURS = 24  # 받은 초대를 기다리는 시간
READY_HOURS = 24  # 수락한 뒤 둘이 들어와 시작하기를 기다리는 시간
MAX_OPEN = 5  # 한 사람이 동시에 걸어 둘 수 있는 방
WAIT_SECONDS = 20
HERE_SECONDS = 30  # 화면을 열어 둔 사람 — 기다리는 요청이 20초마다 다시 오므로 그보다 조금 길게
CHAT_KEEP, LOG_KEEP, CHAT_MAX = 60, 40, 120
TRY_GAP, CHAT_GAP = 1.2, 0.6  # 자물쇠·대화 연타 막기(초)
RANK_SIZE = 20

OPEN = ("PENDING", "READY", "PLAYING")
ENDED = ("CLEAR", "FAILED")


# ── 작은 도구 ─────────────────────────────────────────────────

def _mine(member_id: int):
    return or_(EscapeRoom.host_id == member_id, EscapeRoom.guest_id == member_id)


def _partner_id(r: EscapeRoom, member_id: int) -> int:
    return r.guest_id if r.host_id == member_id else r.host_id


def _room(r: EscapeRoom):
    return ALL_ROOMS[r.room]


def _escape_room(r: EscapeRoom) -> Room:
    room = _room(r)
    if room.game != "escape":
        raise_app_error("ESCAPE_BAD_PUZZLE")
    return room


def _finish_engine(r: EscapeRoom, st: dict, eng) -> None:
    """시간제 게임 끝 — 점수(분식집 매출 · 맞힌 낱말 수)가 기록이 되고, 끝까지 한 판은 모두 순위에 든다."""
    r.status = "CLEAR"
    r.score = eng.score(st)
    r.ranked = True
    r.finished_at = now_kst()
    r.deadline_at = None
    st["end"] = eng.end_code(st)
    _log(st, eng.summary(st))


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.astimezone(KST).isoformat() if dt else None


def _state(r: EscapeRoom) -> dict:
    return copy.deepcopy(r.state or {})


def _save(r: EscapeRoom, st: dict) -> None:
    r.state = st  # JSON 칸은 새 객체를 넣어야 바뀐 줄 안다
    r.seq = (r.seq or 0) + 1


def _log(st: dict, text: str) -> None:
    st["log"] = [*st.get("log", []), {"t": now_kst().isoformat(), "text": text}][-LOG_KEEP:]


def _penalty(room: Room, st: dict) -> int:
    return len(st.get("hints", [])) * room.hint_penalty + int(st.get("wrong", 0)) * room.wrong_penalty


def _met(p: Puzzle, solved: set) -> bool:
    return all(k in solved for k in p.requires)


def _minutes_to_close(now: datetime) -> Optional[int]:
    """오늘 다음 닫히는 시각까지 남은 분 — 닫히지 않으면 None."""
    if get_settings().debug or now.weekday() >= 5 or is_public_holiday(now.date()):
        return None
    minute = now.hour * 60 + now.minute
    ahead = [start - minute for start, _ in CLOSED_WINDOWS if start > minute]
    return min(ahead) if ahead else None


# ── 화면을 열어 둔 사람 ────────────────────────────────────────

async def _here_key(room_id: int, member_id: int):
    from app.database import get_redis

    redis = await get_redis()
    return redis, realtime.channel(redis, "escape-here", f"{room_id}:{member_id}")


async def _touch(room_id: int, member_id: int) -> None:
    """내가 방 화면을 보고 있다고 남긴다. 새로 들어온 거면 상대 화면에 바로 알린다."""
    try:
        redis, key = await _here_key(room_id, member_id)
        if await redis.set(key, "1", ex=HERE_SECONDS, nx=True):
            await realtime.publish(KIND, room_id)
        else:
            await redis.expire(key, HERE_SECONDS)
    except Exception:  # noqa: BLE001 — 있음 표시는 부가 기능
        pass


async def _is_here(room_id: int, member_id: int) -> bool:
    try:
        redis, key = await _here_key(room_id, member_id)
        return bool(await redis.exists(key))
    except Exception:  # noqa: BLE001
        return False


# ── 정리 · 도장 ────────────────────────────────────────────────

async def _stamp_pair(db: AsyncSession, r: EscapeRoom, first_id: int) -> Optional[dict]:
    """끝난 방은 두 사람 모두 오늘 도장을 받는다. 돌려주는 값은 first_id 의 도장."""
    today = today_kst()
    mine = None
    for mid in (first_id, _partner_id(r, first_id)):
        m = await db.get(Member, mid)
        if m is not None:
            got = await _give_stamp(db, m, _room(r).page, today)
            if mid == first_id:
                mine = got
    return mine


async def _sweep(db: AsyncSession, member_id: Optional[int] = None) -> None:
    """기한이 지난 초대·방을 정리한다. 진행 중이던 방은 시간 초과로 끝난다(둘 다 도장은 받는다)."""
    now = now_kst()
    q = select(EscapeRoom).where(EscapeRoom.status.in_(OPEN), EscapeRoom.deadline_at < now)
    if member_id is not None:
        q = q.where(_mine(member_id))
    rows = (await db.execute(q.with_for_update(skip_locked=True))).scalars().all()
    failed = []
    for r in rows:
        st = _state(r)
        eng = _engine(_room(r))
        if r.status == "PLAYING" and eng and "k" in st:
            eng.advance(st, time.time())
            _finish_engine(r, st, eng)
            failed.append(r)
            _save(r, st)
            continue
        if r.status == "PLAYING":
            r.status = "FAILED"
            st["end"] = "TIMEOUT"
            _log(st, "시간이 다 됐어요. 이번에는 탈출하지 못했어요.")
            failed.append(r)
        else:
            r.status = "EXPIRED"
        r.deadline_at = None
        r.finished_at = now
        _save(r, st)
    if rows:
        await db.commit()
        await realtime.publish(KIND, *(r.id for r in rows))
        for r in failed:
            await _stamp_pair(db, r, r.host_id)


async def _get(db: AsyncSession, member: Member, room_id: int, lock: bool = False) -> EscapeRoom:
    q = select(EscapeRoom).where(EscapeRoom.id == room_id, _mine(member.id))
    if lock:
        q = q.with_for_update()
    r = (await db.execute(q)).scalars().first()
    if r is None:
        raise_app_error("ESCAPE_NOT_FOUND", 404)
    return r


async def _playing(db: AsyncSession, member: Member, room_id: int) -> EscapeRoom:
    await _sweep(db, member.id)
    r = await _get(db, member, room_id, lock=True)
    if r.status != "PLAYING":
        raise_app_error("ESCAPE_NOT_PLAYING")
    return r


async def _commit(db: AsyncSession, r: EscapeRoom) -> None:
    await db.commit()
    await realtime.publish(KIND, r.id)


# ── 화면에 보내는 모양 ─────────────────────────────────────────

def _things(room: Room, side: str, st: dict) -> list:
    solved = set(st.get("solved", []))
    hints = set(st.get("hints", []))
    out = []
    for t in room.things:
        if t.side != side:
            continue
        visible = all(k in solved for k in t.requires)
        if not visible and not t.text_locked:
            continue
        item = {"key": t.key, "title": t.title, "icon": t.icon, "text": t.text if visible else t.text_locked,
                "dim": not visible, "art": t.art if visible else None, "lock": None}
        if t.lock:
            p = room.puzzle(t.lock)
            item["lock"] = {
                "key": p.key, "kind": p.kind, "length": p.length, "options": list(p.options),
                "solved": p.key in solved, "open": visible and _met(p, solved),
                "hint": p.hint if p.key in hints else None,
            }
        out.append(item)
    return out


def _progress(room: Room, st: dict, side: Optional[str]) -> list:
    solved = set(st.get("solved", []))
    hints = set(st.get("hints", []))
    return [{
        "key": p.key, "title": p.title, "where": room.sides.get(p.side, "둘이 함께"), "mine": p.side in (None, side),
        "solved": p.key in solved, "open": _met(p, solved), "hint": p.hint if p.key in hints else None,
    } for p in room.puzzles]


def _cards(room: Room, st: dict, member_id: int, partner_id: int) -> dict:
    now = time.time()
    cards = st.get("cards", {})

    def until(mid):
        t = cards.get(str(mid))
        return int((t + room.card_window) * 1000) if t and now - t <= room.card_window else None

    return {"window": room.card_window, "mine": until(member_id), "partner": until(partner_id)}


async def _view(db: AsyncSession, r: EscapeRoom, member: Member, full: bool = True) -> dict:
    room = _room(r)
    st = r.state or {}
    pid = _partner_id(r, member.id)
    partner = await db.get(Member, pid)
    roles = st.get("roles", {})
    side, partner_side = roles.get(str(member.id)), roles.get(str(pid))
    out = {
        "id": r.id,
        "room": room.key,
        "title": room.title,
        "status": r.status,
        "seq": r.seq,
        "isHost": r.host_id == member.id,
        "incoming": r.status == "PENDING" and r.guest_id == member.id,
        "partner": _person(partner),
        "partnerHere": r.status in ("READY", "PLAYING") and await _is_here(r.id, pid),
        "sideName": room.sides.get(side),
        "partnerSideName": room.sides.get(partner_side),
        "deadlineAt": _iso(r.deadline_at),
        "startedAt": _iso(r.started_at),
        "finishedAt": _iso(r.finished_at),
        "recordSec": r.record_sec,
        "score": r.score,
        "game": room.game,
        "label": room.label,
        "ranked": r.ranked,
        "limitSec": room.limit_sec,
        "end": st.get("end"),
    }
    if not full:
        return out
    ready = set(st.get("ready", []))
    chat = st.get("chat", [])
    names = {member.id: member.name, pid: partner.name if partner else "동료"}
    out.update({
        "intro": room.intro,
        "outro": room.outro,
        "ready": {"me": member.id in ready, "partner": pid in ready},
        "chat": [{"me": c["by"] == member.id, "name": names.get(c["by"], ""), "text": c["text"], "t": c["t"]} for c in chat[-40:]],
        "log": st.get("log", [])[-20:],
    })
    eng = _engine(room)
    if eng:
        out[room.game] = eng.view(st, side, time.time()) if "k" in st else None
        return out
    out.update({
        "things": _things(room, side, st) if side and r.status in ("PLAYING", *ENDED) else [],
        "progress": _progress(room, st, side),
        "hints": len(st.get("hints", [])),
        "wrong": int(st.get("wrong", 0)),
        "penaltySec": _penalty(room, st),
        "hintPenalty": room.hint_penalty,
        "wrongPenalty": room.wrong_penalty,
        "cards": _cards(room, st, member.id, pid),
    })
    return out


# ── 목록 ──────────────────────────────────────────────────────

async def _ranking(db: AsyncSession, member: Member, room_key: str) -> dict:
    """방탈출은 빠른 기록 순, 분식집은 매출이 많은 순 — 같은 두 사람은 가장 좋은 판 하나만."""
    by_score = ALL_ROOMS[room_key].game in ENGINES
    order = (EscapeRoom.score.desc(), EscapeRoom.finished_at) if by_score else (EscapeRoom.record_sec, EscapeRoom.finished_at)
    rows = (
        await db.execute(
            select(EscapeRoom)
            .where(EscapeRoom.room == room_key, EscapeRoom.status == "CLEAR", EscapeRoom.ranked.is_(True))
            .order_by(*order)
        )
    ).scalars().all()
    seen_pairs = set()
    ids = {i for r in rows for i in (r.host_id, r.guest_id)}
    people = {m.id: m for m in (await db.execute(select(Member).where(Member.id.in_(ids)))).scalars().all()} if ids else {}
    table, me = [], None
    for i, r in enumerate(rows, 1):
        a, b = people.get(r.host_id), people.get(r.guest_id)
        if not a or not b or a.status != MemberStatus.ACTIVE or b.status != MemberStatus.ACTIVE:
            continue
        pair = frozenset((r.host_id, r.guest_id))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        row = {"rank": len(table) + 1, "sec": r.record_sec, "score": r.score, "team": [_person(a), _person(b)],
               "date": r.finished_at.astimezone(KST).date().isoformat() if r.finished_at else None,
               "mine": member.id in (r.host_id, r.guest_id)}
        table.append(row)
        if row["mine"] and me is None:
            me = row
    return {"top": table[:RANK_SIZE], "me": me}


async def overview(db: AsyncSession, member: Member, room_key: str = DEFAULT_ROOM) -> dict:
    if room_key not in ALL_ROOMS:
        raise_app_error("ESCAPE_NOT_FOUND", 404)
    await _sweep(db, member.id)
    mine = (EscapeRoom.room == room_key, _mine(member.id))
    rows = (await db.execute(select(EscapeRoom).where(EscapeRoom.status.in_(OPEN), *mine).order_by(EscapeRoom.id.desc()))).scalars().all()
    done = (
        await db.execute(
            select(EscapeRoom).where(EscapeRoom.status.in_(ENDED), *mine).order_by(EscapeRoom.finished_at.desc()).limit(10)
        )
    ).scalars().all()
    items = [await _view(db, r, member, full=False) for r in rows]
    room = ALL_ROOMS[room_key]
    return {
        "room": {"key": room.key, "title": room.title, "intro": room.intro, "limitSec": room.limit_sec, "game": room.game, "label": room.label},
        "incoming": [x for x in items if x["incoming"]],
        "sent": [x for x in items if x["status"] == "PENDING" and not x["incoming"]],
        "active": [x for x in items if x["status"] in ("READY", "PLAYING")],
        "recent": [await _view(db, r, member, full=False) for r in done],
        "ranking": await _ranking(db, member, room.key),
    }


async def inbox(db: AsyncSession, member: Member) -> dict:
    """아케이드 알림 — 받은 초대 · 같이 할 방(수락됐거나 진행 중)."""
    await _sweep(db, member.id)
    rows = (await db.execute(select(EscapeRoom).where(EscapeRoom.status.in_(OPEN), _mine(member.id)))).scalars().all()
    games = {}
    for key, room in ALL_ROOMS.items():
        mine = [r for r in rows if r.room == key]
        games[key] = {
            "title": room.title, "page": room.page,
            "incoming": sum(1 for r in mine if r.status == "PENDING" and r.guest_id == member.id),
            "ready": sum(1 for r in mine if r.status in ("READY", "PLAYING")),
        }
    return {
        "incoming": sum(g["incoming"] for g in games.values()),
        "ready": sum(g["ready"] for g in games.values()),
        "rooms": games,
    }


# ── 초대 · 수락 · 나가기 ───────────────────────────────────────

async def invite(db: AsyncSession, member: Member, partner_id: int, room_key: str = DEFAULT_ROOM):
    ensure_open()
    if room_key not in ALL_ROOMS:
        raise_app_error("ESCAPE_NOT_FOUND", 404)
    await _sweep(db, member.id)
    partner = await db.get(Member, partner_id)
    if partner is None or partner.id == member.id or partner.status != MemberStatus.ACTIVE or not _real_person(partner):
        raise_app_error("ESCAPE_BAD_PARTNER")
    rows = (await db.execute(select(EscapeRoom).where(EscapeRoom.status.in_(OPEN), _mine(member.id)))).scalars().all()
    if any(_partner_id(r, member.id) == partner.id and r.room == room_key for r in rows):
        raise_app_error("ESCAPE_ALREADY")
    if len(rows) >= MAX_OPEN:
        raise_app_error("ESCAPE_LIMIT")
    r = EscapeRoom(room=room_key, host_id=member.id, guest_id=partner.id, status="PENDING", state={}, seq=0,
                   deadline_at=now_kst() + timedelta(hours=INVITE_HOURS))
    db.add(r)
    await db.flush()
    room = ALL_ROOMS[room_key]
    notify = await teams_service.enqueue_escape_notice(
        db, kind=TeamsMessageType.ESCAPE_INVITED, to=partner, key=f"escape-invited:{r.id}",
        body=teams_service.render_escape_invited_body(room=room, room_id=r.id, guest=partner, host=member, deadline_at=r.deadline_at),
    )
    await db.commit()
    return await _view(db, r, member), notify


async def accept(db: AsyncSession, member: Member, room_id: int):
    ensure_open()
    await _sweep(db, member.id)
    r = await _get(db, member, room_id, lock=True)
    if r.status != "PENDING" or r.guest_id != member.id:
        raise_app_error("ESCAPE_NOT_PENDING")
    room = _room(r)
    sides = list(room.sides)
    random.shuffle(sides)
    st = {"roles": {str(r.host_id): sides[0], str(r.guest_id): sides[1]}, "ready": [], "solved": [], "hints": [],
          "wrong": 0, "cards": {}, "chat": [], "log": [], "tries": {}, "said": {}}
    _log(st, f"{member.name}님이 초대를 수락했어요. 둘 다 「준비」를 누르면 시작해요.")
    r.status = "READY"
    r.deadline_at = now_kst() + timedelta(hours=READY_HOURS)
    _save(r, st)
    host = await db.get(Member, r.host_id)
    notify = []
    if host is not None:
        notify = await teams_service.enqueue_escape_notice(
            db, kind=TeamsMessageType.ESCAPE_ACCEPTED, to=host, key=f"escape-accepted:{r.id}",
            body=teams_service.render_escape_accepted_body(room=room, room_id=r.id, host=host, guest=member),
        )
    await _commit(db, r)
    return await _view(db, r, member), notify


async def leave(db: AsyncSession, member: Member, room_id: int):
    """초대 거절 · 보낸 초대 취소 · 시작 전 방 나가기 · 진행 중 포기."""
    await _sweep(db, member.id)
    r = await _get(db, member, room_id, lock=True)
    if r.status not in OPEN:
        raise_app_error("ESCAPE_NOT_PENDING")
    room, st = _room(r), _state(r)
    partner = await db.get(Member, _partner_id(r, member.id))
    notify = []
    was = r.status
    if was == "PLAYING":
        r.status = "FAILED"
        st["end"] = "GIVEUP"
        _log(st, f"{member.name}님이 포기했어요.")
    else:
        r.status = "DECLINED"
        st["end"] = "LEFT"
        _log(st, f"{member.name}님이 방을 나갔어요.")
        if partner is not None:
            if was == "PENDING" and member.id == r.guest_id:
                notify = await teams_service.enqueue_escape_notice(
                    db, kind=TeamsMessageType.ESCAPE_DECLINED, to=partner, key=f"escape-declined:{r.id}",
                    body=teams_service.render_escape_declined_body(room=room, host=partner, guest=member),
                )
            else:
                notify = await teams_service.enqueue_escape_notice(
                    db, kind=TeamsMessageType.ESCAPE_CANCELLED, to=partner, key=f"escape-cancelled:{r.id}",
                    body=teams_service.render_escape_cancelled_body(room=room, to=partner, by=member),
                )
    r.deadline_at = None
    r.finished_at = now_kst()
    _save(r, st)
    await _commit(db, r)
    return await _view(db, r, member), notify


async def call(db: AsyncSession, member: Member, room_id: int):
    """방에서 기다리는 동안 상대를 Teams 로 부른다 — 5분에 한 번."""
    await _sweep(db, member.id)
    r = await _get(db, member, room_id, lock=True)
    if r.status not in ("READY", "PLAYING"):
        raise_app_error("ESCAPE_NOT_READY")
    partner = await db.get(Member, _partner_id(r, member.id))
    if partner is None or not partner.entra_oid:
        raise_app_error("ESCAPE_BAD_PARTNER")
    notify = await teams_service.enqueue_escape_notice(
        db, kind=TeamsMessageType.ESCAPE_CALL, to=partner, key=f"escape-call:{r.id}:{partner.id}:{int(time.time() // 300)}",
        body=teams_service.render_escape_call_body(room=_room(r), room_id=r.id, to=partner, by=member),
    )
    if not notify:
        raise_app_error("ESCAPE_CALL_WAIT")
    st = _state(r)
    _log(st, f"{member.name}님이 Teams 로 {partner.name}님을 불렀어요.")
    _save(r, st)
    await _commit(db, r)
    return await _view(db, r, member), notify


# ── 준비 · 시작 ────────────────────────────────────────────────

async def ready(db: AsyncSession, member: Member, room_id: int, on: bool = True) -> dict:
    await _sweep(db, member.id)
    r = await _get(db, member, room_id, lock=True)
    if r.status != "READY":
        raise_app_error("ESCAPE_NOT_READY")
    ensure_open()
    room, st = _room(r), _state(r)
    ready_ids = set(st.get("ready", []))
    if on:
        ready_ids.add(member.id)
    else:
        ready_ids.discard(member.id)
    if {r.host_id, r.guest_id} <= ready_ids:
        now = now_kst()
        left = _minutes_to_close(now)
        if left is not None and left * 60 < room.limit_sec:
            raise_app_error("ESCAPE_CLOSING_SOON")
        r.status = "PLAYING"
        r.started_at = now
        eng = _engine(room)
        if eng:
            eng.start(st, time.time())
            r.deadline_at = now + timedelta(seconds=room.limit_sec + 5)  # 끝은 advance 가 정한다 — 정리는 조금 뒤에
            _log(st, eng.START_TEXT)
        else:
            r.deadline_at = now + timedelta(seconds=room.limit_sec)
            _log(st, f"탈출 시작! {room.limit_sec // 60}분 안에 출입문을 열어요.")
    st["ready"] = sorted(ready_ids)
    _save(r, st)
    await _commit(db, r)
    return await _view(db, r, member)


# ── 자물쇠 · 힌트 · 사원증 · 대화 ─────────────────────────────

def _normalize(p: Puzzle, answer) -> tuple:
    if p.kind == "digits":
        text = re.sub(r"\s", "", str(answer or ""))
        if len(text) != p.length or not text.isdigit():
            raise_app_error("ESCAPE_BAD_ANSWER")
        return (text,)
    if not isinstance(answer, list) or len(answer) != p.length:
        raise_app_error("ESCAPE_BAD_ANSWER")
    if p.kind == "colors":
        if any(a not in p.options for a in answer):
            raise_app_error("ESCAPE_BAD_ANSWER")
        return tuple(answer)
    if p.kind == "switches":
        if any(a not in (0, 1) for a in answer):
            raise_app_error("ESCAPE_BAD_ANSWER")
        return tuple(int(a) for a in answer)
    raise_app_error("ESCAPE_BAD_PUZZLE")


async def solve(db: AsyncSession, member: Member, room_id: int, puzzle_key: str, answer) -> dict:
    r = await _playing(db, member, room_id)
    room, st = _escape_room(r), _state(r)
    p = room.puzzle(puzzle_key)
    side = st.get("roles", {}).get(str(member.id))
    solved = set(st.get("solved", []))
    if p is None or p.kind == "cards" or p.side != side or p.key in solved or not _met(p, solved):
        raise_app_error("ESCAPE_BAD_PUZZLE")
    tries = st.setdefault("tries", {})
    now = time.time()
    if now - tries.get(str(member.id), 0) < TRY_GAP:
        raise_app_error("ESCAPE_TOO_FAST", 429)
    tries[str(member.id)] = now
    ok = _normalize(p, answer) == tuple(p.answer)
    if ok:
        st["solved"] = [*st.get("solved", []), p.key]
        _log(st, f"{member.name}님이 「{p.title}」 자물쇠를 풀었어요!")
    else:
        st["wrong"] = int(st.get("wrong", 0)) + 1
        _log(st, f"{member.name}님이 「{p.title}」에서 틀렸어요. (+{room.wrong_penalty}초)")
    _save(r, st)
    await _commit(db, r)
    return {**(await _view(db, r, member)), "ok": ok}


async def hint(db: AsyncSession, member: Member, room_id: int, puzzle_key: str) -> dict:
    r = await _playing(db, member, room_id)
    room, st = _escape_room(r), _state(r)
    p = room.puzzle(puzzle_key)
    solved = set(st.get("solved", []))
    if p is None or p.key in solved or not _met(p, solved):
        raise_app_error("ESCAPE_BAD_PUZZLE")
    if p.key not in st.get("hints", []):
        st["hints"] = [*st.get("hints", []), p.key]
        _log(st, f"{member.name}님이 「{p.title}」 힌트를 봤어요. (+{room.hint_penalty}초)")
        _save(r, st)
        await _commit(db, r)
    return await _view(db, r, member)


async def card(db: AsyncSession, member: Member, room_id: int) -> dict:
    """마지막 문 — 두 사람이 card_window 초 안에 각자 사원증을 대면 열린다."""
    r = await _playing(db, member, room_id)
    room, st = _escape_room(r), _state(r)
    door = next(p for p in room.puzzles if p.kind == "cards")
    solved = set(st.get("solved", []))
    if door.key in solved or not _met(door, solved):
        raise_app_error("ESCAPE_BAD_PUZZLE")
    now = time.time()
    cards = st.setdefault("cards", {})
    cards[str(member.id)] = now
    other = cards.get(str(_partner_id(r, member.id)))
    stamp = None
    if other and now - other <= room.card_window:
        finished = now_kst()
        st["solved"] = [*st.get("solved", []), door.key]
        st["end"] = "CLEAR"
        _log(st, room.outro)
        r.status = "CLEAR"
        r.finished_at = finished
        r.deadline_at = None
        r.record_sec = int((finished - r.started_at).total_seconds()) + _penalty(room, st)
        pair = (r.host_id, r.guest_id)
        before = await db.scalar(
            select(func.count()).select_from(EscapeRoom).where(
                EscapeRoom.room == r.room, EscapeRoom.status == "CLEAR", EscapeRoom.id != r.id,
                or_(EscapeRoom.host_id.in_(pair), EscapeRoom.guest_id.in_(pair)),
            )
        )
        r.ranked = not before
    else:
        _log(st, f"{member.name}님이 사원증을 댔어요. {room.card_window}초 안에 같이 대 주세요!")
    _save(r, st)
    await _commit(db, r)
    if r.status == "CLEAR":
        stamp = await _stamp_pair(db, r, member.id)
    return {**(await _view(db, r, member)), "stamp": stamp}


async def say(db: AsyncSession, member: Member, room_id: int, text: str) -> dict:
    await _sweep(db, member.id)
    r = await _get(db, member, room_id, lock=True)
    if r.status not in ("READY", "PLAYING", *ENDED):
        raise_app_error("ESCAPE_NOT_READY")
    if r.status == "PLAYING" and _room(r).game == "words":
        raise_app_error("WORDS_CHAT_OFF")  # 대화창에 제시어를 적지 못하게 — 설명은 금지어를 거르는 설명 칸으로
    text = re.sub(r"\s+", " ", (text or "")).strip()[:CHAT_MAX]
    if not text:
        raise_app_error("ESCAPE_CHAT_EMPTY")
    st = _state(r)
    said = st.setdefault("said", {})
    now = time.time()
    if now - said.get(str(member.id), 0) < CHAT_GAP:
        raise_app_error("ESCAPE_TOO_FAST", 429)
    said[str(member.id)] = now
    st["chat"] = [*st.get("chat", []), {"by": member.id, "text": text, "t": now_kst().isoformat()}][-CHAT_KEEP:]
    _save(r, st)
    await _commit(db, r)
    return await _view(db, r, member)


# ── 시간제 게임(점심 분식집 · 말해 봐 맞혀 봐) ──────────────────────

async def engine_act(db: AsyncSession, member: Member, room_id: int, action: str, arg) -> dict:
    """시간제 게임(분식집 · 낱말)의 동작 하나 — 먼저 지금까지의 흐름을 맞추고 나서 한다."""
    r = await _playing(db, member, room_id)
    eng = _engine(_room(r))
    if eng is None:
        raise_app_error("KITCHEN_BAD_ACTION")
    st = _state(r)
    now = time.time()
    eng.advance(st, now)
    if not st["k"]["over"]:
        side = st.get("roles", {}).get(str(member.id))
        eng.act(st, side, member.id, action, arg, now)
    if st["k"]["over"]:
        _finish_engine(r, st, eng)
    _save(r, st)
    await _commit(db, r)
    stamp = await _stamp_pair(db, r, member.id) if r.status == "CLEAR" else None
    return {**(await _view(db, r, member)), "stamp": stamp}


async def engine_tick(db: AsyncSession, member: Member, room_id: int) -> dict:
    """정해 둔 시각(손님 도착 · 떠남 · 결제 · 끝)이 되면 화면이 부른다. 바뀐 게 있으면 저장하고 알린다."""
    await _sweep(db, member.id)
    r = await _get(db, member, room_id, lock=True)
    stamp = None
    eng = _engine(_room(r))
    if r.status == "PLAYING" and eng:
        st = _state(r)
        if eng.advance(st, time.time()):
            if st["k"]["over"]:
                _finish_engine(r, st, eng)
            _save(r, st)
            await _commit(db, r)
            if r.status == "CLEAR":
                stamp = await _stamp_pair(db, r, member.id)
        else:
            await db.commit()
    return {**(await _view(db, r, member)), "stamp": stamp}


kitchen_act, kitchen_tick = engine_act, engine_tick  # 예전 이름


# ── 보기 · 기다리기 ────────────────────────────────────────────

async def detail(db: AsyncSession, member: Member, room_id: int) -> dict:
    await _sweep(db, member.id)
    r = await _get(db, member, room_id)
    await _touch(r.id, member.id)
    return await _view(db, r, member)


async def wait(db: AsyncSession, member: Member, room_id: int, seq: int, here: bool) -> dict:
    """방이 바뀌거나(seq) 상대가 들어오고 나갈 때까지 최대 WAIT_SECONDS 기다렸다가 방을 돌려준다."""
    await _sweep(db, member.id)
    r = await _get(db, member, room_id)
    await _touch(r.id, member.id)
    pid = _partner_id(r, member.id)

    async def unchanged() -> bool:
        now_here = r.status in ("READY", "PLAYING") and await _is_here(r.id, pid)
        same = r.seq == seq and now_here == here
        await db.commit()  # 읽기만 했다 — 기다리는 동안 DB 연결을 쥐고 있지 않게
        return same

    await realtime.wait_for_change(KIND, r.id, unchanged, WAIT_SECONDS)
    await _sweep(db, member.id)
    await db.refresh(r)
    return await _view(db, r, member)
