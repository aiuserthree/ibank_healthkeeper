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
from app.services import kitchen_game, maze_game, realtime, sketch_game, spotdiff_game, sync_game, word_game
from app.services import teams as teams_service
from app.services.escape_rooms import DEFAULT_ROOM, ROOMS, Puzzle, Room

# 협동 방 종류 — 방탈출 방들 + 점심 분식집
ALL_ROOMS = {**ROOMS, **{e.ROOM.key: e.ROOM for e in (kitchen_game, word_game, maze_game, sketch_game, sync_game, spotdiff_game)}}
# 시간제 게임 엔진 — start · advance · act · view · score · end_code · summary · START_TEXT 를 갖춘다
ENGINES = {"kitchen": kitchen_game, "words": word_game, "maze": maze_game, "sketch": sketch_game, "sync": sync_game, "spotdiff": spotdiff_game}


def _engine(room):
    return ENGINES.get(room.game)
from app.services.game import CLOSED_WINDOWS, _give_stamp, ensure_open, is_public_holiday
from app.services.match import _person, _real_person

KIND = "escape"
# 하는 동안 대화창을 닫는 게임 — 말해 봐는 설명 칸으로(금지어 검사), 그림 퀴즈 · 통하는 사이는 반응 버튼으로
CHAT_OFF = {"words": "WORDS_CHAT_OFF", "sketch": "SKETCH_CHAT_OFF", "sync": "SYNC_CHAT_OFF"}
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


def _hint_levels(st: dict) -> dict:
    """방탈출 — 자물쇠마다 본 힌트 단계. 기록은 "drawer:2" 처럼 남긴다(예전 방의 "drawer" 는 1단계)."""
    out: dict = {}
    for h in st.get("hints", []):
        key, _, lv = str(h).partition(":")
        out[key] = max(out.get(key, 0), int(lv) if lv.isdigit() else 1)
    return out


def _hint_costs(room: Room, key: str) -> tuple:
    """자물쇠 하나의 힌트 단계별 벌점(초) — 자물쇠가 따로 정했으면(출입문은 0초) 그것, 아니면 방 기본값."""
    p = room.puzzle(key)
    own = tuple(getattr(p, "hint_cost", ()) or ()) if p else ()
    return own or tuple(getattr(room, "hint_penalties", (room.hint_penalty,)))


def _hint_cost(room: Room, key: str, level: int) -> int:
    pens = _hint_costs(room, key)
    return pens[min(level, len(pens)) - 1]


def _hint_sec(room: Room, st: dict) -> int:
    return sum(_hint_cost(room, k, i) for k, lv in _hint_levels(st).items() for i in range(1, lv + 1))


def _paid_hints(room: Room, st: dict) -> int:
    """벌점이 붙은 힌트 단계 수 — 화면의 「힌트 n번」 · 끝 이야기 갈래가 본다(벌점 없는 출입문 요령은 세지 않는다)."""
    return sum(1 for k, lv in _hint_levels(st).items() for i in range(1, lv + 1) if _hint_cost(room, k, i) > 0)


def _penalty(room: Room, st: dict) -> int:
    """벌점(초) — 힌트 단계마다(1단계 30초 · 2단계 60초 더) + 틀릴 때마다."""
    return _hint_sec(room, st) + int(st.get("wrong", 0)) * room.wrong_penalty


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

# ── 방탈출 상태 · 화면 조각 (정답 재료 · 가방 · 물건 쓴 표시 · 인터폰·방송) ──────────
# 방탈출 내용 모듈 — 위 import 줄과 따로 둔다(다른 게임을 등록하는 줄과 겹치지 않게)
from app.services import escape_rooms as _er  # noqa: E402
from sqlalchemy import and_  # noqa: E402

ITEM_GAP = 0.6  # 물건 넘기기 · 쓰기 연타 막기(초)


def _esc_state(room: Room, st: dict, rid: int = 0) -> dict:
    """방탈출 상태 — 정답 재료(p) · 가방(inv) · 해 둔 일(used)이 없으면 채운 새 dict 를 돌려준다(받은 dict 는 그대로).

    수락할 때 판마다 새 정답을 만든다(accept). 정답이 고정이던 때 수락한 방은 방 번호로 정해서
    화면과 서버가 늘 같은 값을 본다.
    """
    if "p" in st and "inv" in st and "used" in st:
        return st
    st = dict(st)
    if "p" not in st:
        st["p"] = _er.make_params(random.Random(f"escape:{rid}"))
    if "inv" not in st:
        inv = {side: [] for side in room.sides}
        for side, items in room.start_items:
            inv.setdefault(side, []).extend(items)
        for key in st.get("solved", []):  # 이미 푼 자물쇠가 준 물건
            p = room.puzzle(key)
            for item, to in (p.gives if p else ()):
                inv.setdefault(to, []).append(item)
        st["inv"] = inv
    st.setdefault("used", [])
    return st


def _esc_current():
    """지금 판(판마다 정답이 바뀌는 판)만 — 정답 재료 p 의 판 번호(v)가 같은 방. 예전 판(p 없음)은 빠진다.

    p 는 수락할 때(accept) 또는 첫 동작 때(_esc_state) 저장되므로 지금 코드로 탈출한 판은 모두 들어온다.
    """
    return EscapeRoom.state[("p", "v")].as_string() == str(_er.PARAMS_VERSION)


def _esc_alive(r: EscapeRoom) -> None:
    """제한 시간이 지난 방은 정리(_sweep)가 다른 요청에 밀렸어도 더는 받지 않는다."""
    dl = r.deadline_at
    if dl is not None:
        if dl.tzinfo is None:
            dl = dl.replace(tzinfo=KST)
        if dl <= now_kst():
            raise_app_error("ESCAPE_NOT_PLAYING")


def _holds(cond: str, solved: set, used: set) -> bool:
    """Thing.variants 조건 하나 — 자물쇠 key · "+표시"(물건을 쓴 표시) · 앞에 "!" 면 아님."""
    neg = cond.startswith("!")
    c = cond[1:] if neg else cond
    ok = (c[1:] in used) if c.startswith("+") else (c in solved)
    return ok != neg


def _ready_to_try(p: Puzzle, solved: set, used: set) -> bool:
    return _met(p, solved) and all(f in used for f in p.needs)


def _why(p: Puzzle, side: Optional[str], solved: set, used: set) -> str:
    """아직 못 여는 까닭 — Puzzle.whys 중 조건이 모두 맞는 첫 글(「@쪽」은 그 쪽 화면만), 없으면 Puzzle.why."""
    for conds, text in getattr(p, "whys", ()):
        if all((c[1:] == side) if c.startswith("@") else _holds(c, solved, used) for c in conds):
            return text
    return p.why


def _thing_on(room: Room, key: Optional[str], side: str):
    return next((t for t in room.things if t.key == key and t.side == side), None) if key else None


def _eul(word: str) -> str:
    """을/를 — 마지막 글자 받침으로 고른다."""
    ch = word[-1:] or "가"
    code = ord(ch) - 0xAC00
    return "을" if 0 <= code < 11172 and code % 28 else "를"


def _things(room: Room, side: str, st: dict) -> list:
    """내 쪽에서 보이는 것 — 단서 그림은 이 쪽 것만(판마다 정한 값으로 그린다), 자물쇠는 정답 없이 모양만."""
    solved, used = set(st.get("solved", [])), set(st.get("used", []))
    levels = _hint_levels(st)
    params = st.get("p") or {}
    bag = list(dict.fromkeys(st.get("inv", {}).get(side, [])))
    out = []
    for t in room.things:
        if t.side != side:
            continue
        visible = all(k in solved for k in t.requires)
        if not visible and not t.text_locked:
            continue
        text = t.text if visible else t.text_locked
        if visible:
            text = next((txt for conds, txt in t.variants if all(_holds(c, solved, used) for c in conds)), text)
        uses = []
        for k in bag:
            it = room.item(k)
            if it and visible and it.use_at == t.key and it.flag and it.flag not in used:
                uses.append({"item": k, "title": it.title, "label": it.use_label})
        item = {"key": t.key, "title": t.title, "icon": t.icon, "text": text, "dim": not visible,
                "art": _er.art(params, t.art) if visible and t.art and params else None, "lock": None,
                "slot": t.slot, "use": uses}
        if t.lock:
            p = room.puzzle(t.lock)
            lv = levels.get(p.key, 0)
            can = visible and _ready_to_try(p, solved, used)
            item["lock"] = {
                "key": p.key, "kind": p.kind, "length": p.length, "options": list(p.options), "max": p.max,
                "solved": p.key in solved, "open": can,
                "why": _why(p, side, solved, used) if visible and not can and p.key not in solved else "",
                "hintLv": lv, "hintMax": len(p.hints), "hints": list(p.hints[:lv]),
                "hintCost": [_hint_cost(room, p.key, i) for i in range(1, len(p.hints) + 1)],
                "canHint": _met(p, solved) and p.key not in solved and lv < len(p.hints),
                "hint": p.hints[lv - 1] if lv else None,
            }
        out.append(item)
    return out


def _progress(room: Room, st: dict, side: Optional[str]) -> list:
    """할 일 — 자물쇠와, 그 사이에 물건을 넘겨 쓰는 일(퓨즈 끼우기 · 덮개 열기). 힌트는 두 사람 모두에게 보인다."""
    solved, used = set(st.get("solved", [])), set(st.get("used", []))
    levels = _hint_levels(st)
    out = []
    for p in room.puzzles:
        lv = levels.get(p.key, 0)
        out.append({
            "key": p.key, "kind": "lock", "title": p.title, "where": room.sides.get(p.side, "둘이 함께"),
            "mine": p.side in (None, side), "solved": p.key in solved, "open": _met(p, solved),
            "hintLv": lv, "hintMax": len(p.hints), "hints": list(p.hints[:lv]),
            "hintCost": [_hint_cost(room, p.key, i) for i in range(1, len(p.hints) + 1)],
            "canHint": _met(p, solved) and p.key not in solved and lv < len(p.hints),
            "hint": p.hints[lv - 1] if lv else None,
        })
        for t in getattr(room, "tasks", ()):
            if t.after and t.after[-1] == p.key:
                out.append({
                    "key": f"+{t.flag}", "kind": "task", "title": t.title, "where": room.sides.get(t.side, ""),
                    "mine": t.side == side, "solved": t.flag in used, "open": all(k in solved for k in t.after),
                    "hintLv": 0, "hintMax": 0, "hints": [], "hintCost": [], "canHint": False, "hint": None,
                })
    return out


def _bag(room: Room, st: dict, side: Optional[str]) -> list:
    """내 가방 — 넘길 수 있는지 · 여기서 쓸 수 있는지(쓸 곳이 건너편이면 elsewhere)."""
    if not side:
        return []
    solved, used = set(st.get("solved", [])), set(st.get("used", []))
    bites = int(st.get("bites", {}).get(side, 0))
    out = []
    for k in st.get("inv", {}).get(side, []):
        it = room.item(k)
        if it is None:
            continue
        here = _thing_on(room, it.use_at, side)
        done = bool(it.flag and it.flag in used)
        out.append({
            "key": k, "title": it.title, "text": it.text, "pass": it.passable,
            "eat": bool(it.edible and (not it.bites or bites < it.bites)), "bite": bool(it.bites),
            "useAt": it.use_at if here else None, "useLabel": it.use_label if here else "",
            "canUse": bool(here and not done and all(q in solved for q in here.requires)),
            "elsewhere": bool(it.use_at and not here),
        })
    return out


def _beats(room: Room, st: dict) -> list:
    """인터폰 · 안내 방송 — 시작할 때 것, 그다음은 자물쇠가 풀린 차례대로."""
    beats = getattr(room, "beats", ())
    picked = [b for b in beats if b.after is None]
    for k in st.get("solved", []):
        picked += [b for b in beats if b.after == k]
    return [{"key": b.key, "who": b.who, "name": b.name, "text": b.text} for b in picked]


def _answers(room: Room, st: dict) -> list:
    """끝난 판의 정답 — 끝난 뒤에만 보낸다(이제 숨길 게 없다)."""
    params = st.get("p") or {}
    if not params:
        return []
    return [{"key": p.key, "title": p.title, "where": room.sides.get(p.side, ""), "answer": _er.answer_text(params, p.key)}
            for p in room.puzzles if p.kind != "cards"]


def _esc_try(room: Room, st: dict, p: Puzzle, answer, name: str) -> bool:
    """자물쇠 한 번 맞춰 보기 — 맞으면 풀고 물건을 주고, 틀리면 벌점. st 를 바꾼다.

    손대지 않은 처음 값(다이얼 0000 · 스위치 모두 아래 · 커피 모두 0)은 정답이 될 수 없으니 벌점 없이 돌려보낸다.
    """
    got, want = _normalize(p, answer), tuple(_er.answer(st["p"], p.key))
    if got == _blank(p) and got != want:
        raise_app_error("ESCAPE_BAD_ANSWER")
    ok = got == want
    if ok:
        st["solved"] = [*st.get("solved", []), p.key]
        inv = st.setdefault("inv", {})
        for item, to in p.gives:
            inv[to] = [*inv.get(to, []), item]
        _log(st, f"{name}님이 「{p.title}」 자물쇠를 풀었어요!")
    else:
        st["wrong"] = int(st.get("wrong", 0)) + 1
        _log(st, f"{name}님이 「{p.title}」에서 틀렸어요. (+{room.wrong_penalty}초)")
    return ok


def _esc_hint(room: Room, st: dict, puzzle_key: str, level: Optional[int], name: str) -> bool:
    """힌트 한 단계 — level 은 보려는 단계(없으면 다음 단계). 이미 본 단계면 바꾸지 않는다(둘이 같이 눌러도 한 번만)."""
    p = room.puzzle(puzzle_key)
    solved = set(st.get("solved", []))
    if p is None or p.key in solved or not _met(p, solved) or not p.hints:
        raise_app_error("ESCAPE_BAD_PUZZLE")
    cur = _hint_levels(st).get(p.key, 0)
    if level is None:
        if cur >= len(p.hints):
            return False
        level = cur + 1
    if level <= cur:
        return False
    if level != cur + 1 or level > len(p.hints):
        raise_app_error("ESCAPE_BAD_HINT")
    st["hints"] = [*st.get("hints", []), f"{p.key}:{level}"]
    cost = _hint_cost(room, p.key, level)
    if len(p.hints) == 1:
        _log(st, f"{name}님이 「{p.title}」 힌트를 봤어요. " + (f"(+{cost}초)" if cost else "(벌점 없음)"))
    else:
        _log(st, f"{name}님이 「{p.title}」 힌트 {level}단계를 봤어요. " + (f"(+{cost}초)" if cost else "(벌점 없음)"))
    return True


def _esc_item(room: Room, st: dict, side: Optional[str], name: str, item_key: str, action: str) -> None:
    """물건 — send(서류 투입구로 건너편 가방에) · use(여기에 쓰기: 퓨즈 끼우기 · 덮개 열기) · eat(김밥). st 를 바꾼다."""
    if side not in room.sides:
        raise_app_error("ESCAPE_BAD_PUZZLE")
    inv = st.setdefault("inv", {})
    bag = list(inv.get(side, []))
    it = room.item(str(item_key or ""))
    if it is None or it.key not in bag:
        raise_app_error("ESCAPE_NO_ITEM")
    if action == "send":
        if not it.passable:
            raise_app_error("ESCAPE_ITEM_STUCK")
        other = next(s for s in room.sides if s != side)
        bag.remove(it.key)
        inv[side], inv[other] = bag, [*inv.get(other, []), it.key]
        st["handoffs"] = int(st.get("handoffs", 0)) + 1
        _log(st, f"{name}님이 서류 투입구로 「{it.title}」{_eul(it.title)} 넘겼어요.")
        return
    if action == "use":
        solved, used = set(st.get("solved", [])), list(st.get("used", []))
        here = _thing_on(room, it.use_at, side)
        if here is None or not it.flag or it.flag in used or not all(k in solved for k in here.requires):
            raise_app_error("ESCAPE_ITEM_HERE")
        bag.remove(it.key)
        inv[side] = bag
        st["used"] = [*used, it.flag]
        _log(st, it.use_log.format(name=name) if it.use_log else f"{name}님이 「{it.title}」{_eul(it.title)} 썼어요.")
        return
    if action == "eat" and it.edible:
        if it.bites:  # 한 조각씩 — 가방에는 남는다(끝 이야기에서 김밥을 들고 퇴근한다)
            bites = dict(st.get("bites", {}))
            if int(bites.get(side, 0)) >= it.bites:
                raise_app_error("ESCAPE_FULL")
            bites[side] = int(bites.get(side, 0)) + 1
            st["bites"] = bites
            st["ate"] = int(st.get("ate", 0)) + 1
            _log(st, f"{name}님이 「{it.title}」에서 한 조각을 먹었어요. 든든해요!")
            return
        bag.remove(it.key)
        inv[side] = bag
        st["ate"] = int(st.get("ate", 0)) + 1
        _log(st, f"{name}님이 「{it.title}」{_eul(it.title)} 먹었어요. 든든해요!")
        return
    raise_app_error("ESCAPE_ITEM_HERE")


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
        "opts": st.get("opts", {}),
    })
    eng = _engine(room)
    if eng:
        out[room.game] = eng.view(st, side, time.time()) if "k" in st else None
        return out
    # 방탈출 — 내 쪽 것만(단서 그림 · 자물쇠 · 가방). 상대 가방은 이름만, 정답은 끝난 뒤에만
    st = _esc_state(room, st, r.id)
    live = bool(side) and r.status in ("PLAYING", *ENDED)
    partner_bag = st.get("inv", {}).get(partner_side, []) if partner_side else []
    out.update({
        "sideKey": side,
        "things": _things(room, side, st) if live else [],
        "bag": _bag(room, st, side) if live else [],
        "partnerBag": [{"key": k, "title": room.item(k).title} for k in partner_bag if room.item(k)] if live else [],
        "used": list(st.get("used", [])) if live else [],
        "power": "breaker" in st.get("solved", []),
        "beats": _beats(room, st) if live else [],
        "progress": _progress(room, st, side),
        "hints": _paid_hints(room, st),  # 벌점이 붙은 힌트 단계 수
        "hintSec": _hint_sec(room, st),
        "wrong": int(st.get("wrong", 0)),
        "penaltySec": _penalty(room, st),
        "hintPenalty": room.hint_penalty,
        "hintPenalties": list(getattr(room, "hint_penalties", (room.hint_penalty,))),
        "wrongPenalty": room.wrong_penalty,
        "cards": _cards(room, st, member.id, pid),
        "handoffs": int(st.get("handoffs", 0)),
        "ate": int(st.get("ate", 0)),
        "pairBest": st.get("pair_best") if r.status == "CLEAR" else None,  # 이 판 전까지 둘의 최고 기록(없으면 첫 탈출)
        "answers": _answers(room, st) if r.status in ENDED else [],
    })
    return out


# ── 목록 ──────────────────────────────────────────────────────

async def _ranking(db: AsyncSession, member: Member, room_key: str) -> dict:
    """방탈출은 빠른 기록 순, 분식집은 매출이 많은 순 — 같은 두 사람은 가장 좋은 판 하나만.

    방탈출은 판마다 정답이 바뀌어서 탈출한 판은 모두 ranked 로 남는다(card) — 같은 두 사람의 모든 탈출 중 가장 빠른 판이
    순위에 오른다. 정답이 고정이던 때의 판(자물쇠 5개 · 물건 넘기기 없음 — 더 짧다)은 지금 판과 겨룰 수 없어 뺀다(_esc_current).
    """
    by_score = ALL_ROOMS[room_key].game in ENGINES
    order = (EscapeRoom.score.desc(), EscapeRoom.finished_at) if by_score else (EscapeRoom.record_sec, EscapeRoom.finished_at)
    q = select(EscapeRoom).where(EscapeRoom.room == room_key, EscapeRoom.status == "CLEAR", EscapeRoom.ranked.is_(True))
    if ALL_ROOMS[room_key].game == "escape":
        q = q.where(_esc_current())
    rows = (await db.execute(q.order_by(*order))).scalars().all()
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


# 협동 시리즈 「오늘도 둘이서」 — 하루를 따라가는 화 순서 (1화 점심 분식집 → 2화 낱말 → 3화 야근 탈출 → 4화 주차장)
CHAPTER_ORDER = ["lunch", "words", "overtime", "parking"]
# 번외편 — 본편 사이 같은 하루의 짧은 이야기(coop-story.js extras). series() 는 본편 뒤에 이어 돌려준다
EXTRA_ORDER = ["sync", "sketch", "spotdiff"]
# 성공이 아닌 끝 — 포기 · 시간 초과 · 나감, 분식집 HEARTS(손님을 너무 놓쳐 가게 문을 일찍 닫음)
# 화면(coop-story.js HKCoopStory.cleared · coop.js)도 같은 규칙으로 끝 이야기 갈래를 고른다
SERIES_FAIL_ENDS = ("HEARTS", "GIVEUP", "TIMEOUT", "LEFT")


def _series_cleared(r, by_score: bool) -> bool:
    """성공한 판인지 — 시간제 게임은 끝나면 늘 CLEAR 라서 점수가 있고 일찍 끝나지 않은 판만 성공으로 센다."""
    if r.status != "CLEAR" or r.end in SERIES_FAIL_ENDS:
        return False
    return not by_score or (r.score or 0) > 0


async def series(db: AsyncSession, member: Member) -> list:
    """협동 시리즈 화마다 내 기록 — 함께하기 페이지 · 협동 방 목록이 쓴다.

    played 끝까지 간 판(성공 · 실패 · 포기) · cleared 성공한 판(_series_cleared — 시간제 게임은 점수 0 · HEARTS 를 뺀다)
    · best 최고 기록(방탈출은 가장 짧은 기록 초, 시간제 게임은 가장 높은 점수 — 0 점은 기록으로 치지 않는다)
    · partners 같이 끝까지 해 본 동료 수 · incoming 받은 초대 · ready 같이 할 방(수락했거나 진행 중).
    """
    await _sweep(db, member.id)
    keys = [k for k in (*CHAPTER_ORDER, *EXTRA_ORDER) if k in ALL_ROOMS]
    rows = (
        await db.execute(
            select(
                EscapeRoom.room, EscapeRoom.status, EscapeRoom.host_id, EscapeRoom.guest_id, EscapeRoom.record_sec, EscapeRoom.score,
                EscapeRoom.state["end"].as_string().label("end"),  # 끝 코드만 꺼낸다(state 전체는 크다)
            )
            .where(EscapeRoom.room.in_(keys), EscapeRoom.status.in_((*OPEN, *ENDED)), _mine(member.id))
        )
    ).all()
    out = []
    for no, key in enumerate(keys, 1):
        room = ALL_ROOMS[key]
        by_score = _engine(room) is not None
        mine = [r for r in rows if r.room == key]
        ended = [r for r in mine if r.status in ENDED]
        marks = [r.score if by_score else r.record_sec for r in mine if r.status == "CLEAR"]
        marks = [m for m in marks if m is not None and (not by_score or m > 0)]
        out.append({
            "key": key, "no": no, "title": room.title, "page": room.page, "game": room.game,
            "bestKind": "score" if by_score else "sec",
            "played": len(ended),
            "cleared": sum(1 for r in ended if _series_cleared(r, by_score)),
            "best": (max(marks) if by_score else min(marks)) if marks else None,
            "partners": len({r.guest_id if r.host_id == member.id else r.host_id for r in ended}),
            "incoming": sum(1 for r in mine if r.status == "PENDING" and r.guest_id == member.id),
            "ready": sum(1 for r in mine if r.status in ("READY", "PLAYING")),
        })
    return out


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
    if room.game == "escape":  # 방탈출 — 판마다 새 정답(생일 · 폴더 색 · 차단기 · 관리자 메뉴 · 회의 순서 · 시계)과 시작 가방
        st = _esc_state(room, {**st, "p": _er.make_params(random.Random())}, r.id)
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
        if any(not isinstance(a, str) or a not in p.options for a in answer):
            raise_app_error("ESCAPE_BAD_ANSWER")
        return tuple(answer)
    if p.kind == "switches":
        if any(isinstance(a, bool) or a not in (0, 1) for a in answer):
            raise_app_error("ESCAPE_BAD_ANSWER")
        return tuple(int(a) for a in answer)
    if p.kind == "counts":  # 커피머신 — 칸마다 0 ~ max
        if any(isinstance(a, bool) or not isinstance(a, int) or not 0 <= a <= p.max for a in answer):
            raise_app_error("ESCAPE_BAD_ANSWER")
        return tuple(int(a) for a in answer)
    raise_app_error("ESCAPE_BAD_PUZZLE")


def _blank(p: Puzzle) -> Optional[tuple]:
    """화면이 처음에 채워 두는 값(손대지 않은 값) — 다이얼 0000 · 스위치 모두 아래 · 커피 모두 0."""
    if p.kind == "digits":
        return ("0" * p.length,)
    if p.kind in ("switches", "counts"):
        return (0,) * p.length
    return None


async def _esc_playing(db: AsyncSession, member: Member, room_id: int):
    """방탈출 진행 중인 방 · 내용 · 상태(정답 재료 · 가방 채움) · 내 쪽."""
    r = await _playing(db, member, room_id)
    _esc_alive(r)
    room = _escape_room(r)
    st = _esc_state(room, _state(r), r.id)
    return r, room, st, st.get("roles", {}).get(str(member.id))


async def solve(db: AsyncSession, member: Member, room_id: int, puzzle_key: str, answer) -> dict:
    r, room, st, side = await _esc_playing(db, member, room_id)
    p = room.puzzle(puzzle_key)
    solved, used = set(st.get("solved", [])), set(st.get("used", []))
    if p is None or p.kind == "cards" or p.side != side or p.key in solved or not _ready_to_try(p, solved, used):
        raise_app_error("ESCAPE_BAD_PUZZLE")
    tries = st.setdefault("tries", {})
    now = time.time()
    if now - tries.get(str(member.id), 0) < TRY_GAP:
        raise_app_error("ESCAPE_TOO_FAST", 429)
    tries[str(member.id)] = now
    ok = _esc_try(room, st, p, answer, member.name)
    _save(r, st)
    await _commit(db, r)
    return {**(await _view(db, r, member)), "ok": ok}


async def hint(db: AsyncSession, member: Member, room_id: int, puzzle_key: str, level: Optional[int] = None) -> dict:
    """힌트 — level(1 살짝 · 2 확실하게)을 주면 그 단계만, 없으면 다음 단계. 이미 본 단계면 그대로 돌려준다."""
    r, room, st, _side = await _esc_playing(db, member, room_id)
    if _esc_hint(room, st, puzzle_key, level, member.name):
        _save(r, st)
        await _commit(db, r)
    else:
        await db.commit()
    return await _view(db, r, member)


async def item(db: AsyncSession, member: Member, room_id: int, item_key: str, action: str) -> dict:
    """물건 — send 서류 투입구로 넘기기 · use 여기에 쓰기(퓨즈 끼우기 · 덮개 열기) · eat 먹기(김밥)."""
    r, room, st, side = await _esc_playing(db, member, room_id)
    tries = st.setdefault("tries", {})
    now = time.time()
    if now - tries.get(f"i{member.id}", 0) < ITEM_GAP:
        raise_app_error("ESCAPE_TOO_FAST", 429)
    tries[f"i{member.id}"] = now
    _esc_item(room, st, side, member.name, item_key, action)
    _save(r, st)
    await _commit(db, r)
    return await _view(db, r, member)


async def card(db: AsyncSession, member: Member, room_id: int) -> dict:
    """마지막 문 — 두 사람이 card_window 초 안에 각자 사원증을 대면 열린다(사원증이 내 가방에 있어야 한다)."""
    r, room, st, side = await _esc_playing(db, member, room_id)
    door = next(p for p in room.puzzles if p.kind == "cards")
    solved = set(st.get("solved", []))
    if door.key in solved or not _met(door, solved) or "card" not in st.get("inv", {}).get(side, []):
        raise_app_error("ESCAPE_BAD_PUZZLE")
    now = time.time()
    cards = st.setdefault("cards", {})
    mine = cards.get(str(member.id))
    if mine and 0 <= now - mine <= room.card_window:
        # 내 5초 창이 아직 열려 있다 — 연타 · 되풀이 요청은 바꾸지 않고 그대로 돌려준다(기록 · 알림도 남기지 않는다)
        await db.commit()
        return {**(await _view(db, r, member)), "stamp": None}
    cards[str(member.id)] = now
    other = cards.get(str(_partner_id(r, member.id)))
    stamp = None
    if other and now - other <= room.card_window:
        a, b = r.host_id, r.guest_id
        # 이 판 전까지 두 사람의 가장 빠른 기록 — 끝 화면의 「둘의 최고 기록」(지금 판끼리만)
        st["pair_best"] = await db.scalar(
            select(func.min(EscapeRoom.record_sec)).where(
                EscapeRoom.room == r.room, EscapeRoom.status == "CLEAR", EscapeRoom.ranked.is_(True), EscapeRoom.id != r.id,
                _esc_current(),
                or_(and_(EscapeRoom.host_id == a, EscapeRoom.guest_id == b), and_(EscapeRoom.host_id == b, EscapeRoom.guest_id == a)),
            )
        )
        finished = now_kst()
        st["solved"] = [*st.get("solved", []), door.key]
        st["end"] = "CLEAR"
        _log(st, room.outro)
        r.status = "CLEAR"
        r.finished_at = finished
        r.deadline_at = None
        r.record_sec = int((finished - r.started_at).total_seconds()) + _penalty(room, st)
        r.ranked = True  # 판마다 정답이 바뀌므로 탈출한 판은 모두 순위 후보 — 같은 두 사람은 가장 빠른 판 하나만(_ranking)
    else:
        # 같은 사람의 지난 「사원증을 댔어요」 줄은 지우고 새로 하나만 — 몇 번을 대도 진행 기록이 이 줄로 밀려나지 않게
        text = f"{member.name}님이 사원증을 댔어요. {room.card_window}초 안에 같이 대 주세요!"
        st["log"] = [x for x in st.get("log", []) if x.get("text") != text]
        _log(st, text)
    _save(r, st)
    await _commit(db, r)
    if r.status == "CLEAR":
        stamp = await _stamp_pair(db, r, member.id)
    return {**(await _view(db, r, member)), "stamp": stamp}


async def set_options(db: AsyncSession, member: Member, room_id: int, opts: dict) -> dict:
    """대기실에서 게임 설정(주제 · 난이도 등)을 고른다. 엔진이 clean_options 로 걸러 받은 것만 남는다.

    설정이 바뀌면 둘 다 다시 「준비」를 눌러야 한다 — 상대가 모르는 설정으로 시작하지 않게.
    엔진은 start(st, now) 에서 st["opts"] 를 읽는다.
    """
    await _sweep(db, member.id)
    r = await _get(db, member, room_id, lock=True)
    if r.status != "READY":
        raise_app_error("ESCAPE_NOT_READY")
    room = _room(r)
    eng = _engine(room) or (room if hasattr(room, "clean_options") else None)
    if eng is None or not hasattr(eng, "clean_options"):
        raise_app_error("COOP_NO_OPTIONS")
    st = _state(r)
    clean = eng.clean_options(opts if isinstance(opts, dict) else {})
    if clean != st.get("opts", {}):
        st["opts"] = clean
        st["ready"] = []
        _log(st, f"{member.name}님이 게임 설정을 바꿨어요. 다시 「준비」를 눌러 주세요.")
        _save(r, st)
        await _commit(db, r)
    else:
        await db.commit()
    return await _view(db, r, member)


async def say(db: AsyncSession, member: Member, room_id: int, text: str) -> dict:
    await _sweep(db, member.id)
    r = await _get(db, member, room_id, lock=True)
    if r.status not in ("READY", "PLAYING", *ENDED):
        raise_app_error("ESCAPE_NOT_READY")
    if r.status == "PLAYING" and _room(r).game in CHAT_OFF:
        raise_app_error(CHAT_OFF[_room(r).game])  # 대화창으로 답 · 제시어를 알려 주지 못하게 — 게임마다 정해 둔 칸 · 버튼으로
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
        # 구독한 뒤에 seq · status 를 DB 에서 다시 읽는다 — _get 과 구독 사이에 저장 · 알림이 끝난 변경도 놓치지 않게
        # (r 은 _get 때 읽은 값 그대로라 그 사이 바뀐 것을 모른다 — 놓치면 상대 화면이 WAIT_SECONDS 동안 멈춘다)
        row = (await db.execute(select(EscapeRoom.seq, EscapeRoom.status).where(EscapeRoom.id == r.id))).first()
        cur_seq, cur_status = (row[0], row[1]) if row else (r.seq, r.status)
        now_here = cur_status in ("READY", "PLAYING") and await _is_here(r.id, pid)
        same = cur_seq == seq and now_here == here
        await db.commit()  # 읽기만 했다 — 기다리는 동안 DB 연결을 쥐고 있지 않게
        return same

    await realtime.wait_for_change(KIND, r.id, unchanged, WAIT_SECONDS)
    await _sweep(db, member.id)
    await db.refresh(r)
    return await _view(db, r, member)
