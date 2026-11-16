"""여러 명 대전 — 선다운 범퍼스 대전(bumpervs) · 한밤의 두뇌 저택(mansion) · 꿀꺽 젤리 숲 대전(jellyvs).
주인이 동료를 최대 5명 초대해 6자리가 함께 한다(빈자리는 컴퓨터).

흐름
  1. 만들기(create) — 주인 + 초대한 사람들(1 ~ 5명). 초대 받은 사람에게 Teams 알림. 판은 OPEN(대기실).
  2. 초대 받은 사람이 들어오기(accept) · 거절(decline). 주인은 더 초대(invite) · 판 닫기(cancel), 들어온 사람은 나가기(leave).
  3. 대기실은 실시간 통로(app/routers/realtime_party.py, /api/play/prt/{판 id})로 — 들어온 사람(주인 · JOINED)만 붙는다.
  4. 주인이 출발(start) — 그때 대기실에 있는 사람들로 달릴 사람이 정해진다(주인 포함 2명 이상). 판은 RACING.
     차 번호: 0 = 주인, 1 … = players 순서, 그 뒤로 컴퓨터(bots).
  5. 경주가 끝나면 달린 사람마다 결과를 보낸다(report) — 주인 화면이 경주를 계산하고 끝 소식을 모두에게 보내니 결과는 같아야 한다.
     과반이 같은 결과(1등 차 · 트랙)를 보냈으면 그 결과로 끝(DONE). 1등이 사람이면 그 사람 1승, 컴퓨터면 승 없음.
     같은 결과를 보낸 사람은 오늘 참여 도장. 다 보내지 않아도 첫 보고 뒤 REPORT_WAIT_MIN 이 지나면 그때까지 온 것으로 판정한다.
  순위 — match._ranking(bumpervs · jellyvs)에 더해진다: 1등만 1승(같은 사람들과 하루에 여러 번 이겨도 1승), 패는 세지 않는다.
  두뇌 저택은 1:1 이 없어 overview 의 ranking 으로 따로 보여 준다.
  젤리 숲 — 6마리가 2분 동안 먹고 자란다. 삼켜진 젤리는 3초 뒤 처음 크기로 다시 태어난다. 끝났을 때 가장 큰 젤리 1등만 1승
  (1 · 2등 크기 차가 1.02배 미만이면 승자 없음). 판 화면은 web/games/jellyvs.html · 엔진 web/_shared/jellyvs-vs.js.

판(state)
  track: 대기실 트랙(1 ~ 13) — 젤리 숲은 숲(맵) 번호(1 ~ 6) · players: [달리는 사람 id …](주인이 0번) · bots: [컴퓨터 차 번호 …] · at: 출발 시각(epoch ms)
  rep: {str(id): {"winner", "order", "dist", "track", "sec", "at"}} · final: {"winner", "order", "dist", "track", "sec"}
  (두뇌 저택은 {"winner", "stars", "rounds", "sec"}, 젤리 숲은 {"winner", "size", "map", "sec"})
"""

from __future__ import annotations

import logging
import time
from collections import Counter
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error, register_messages
from app.core.time import KST, now_kst, today_kst
from app.models import GameParty, GamePartySeat, Member, MemberStatus
from app.services import teams as teams_service
from app.services.avatar import member_avatar_url
from app.services.game import _give_stamp, ensure_open, game_visible

logger = logging.getLogger(__name__)

PARTY_GAMES = ("bumpervs", "mansion", "jellyvs")  # 선다운 범퍼스 대전 · 한밤의 두뇌 저택 · 꿀꺽 젤리 숲 대전
MAX_SEATS = 6  # 트랙에 설 수 있는 차 — 사람(주인 포함) 최대 6명, 남는 자리는 컴퓨터
OPEN_HOURS = 2  # 대기실이 열려 있는 시간 — 그 안에 출발하지 않으면 EXPIRED
RACE_HOURS = 1  # 출발 뒤 결과를 기다리는 최대 시간
REPORT_WAIT_MIN = 3  # 첫 결과가 온 뒤 나머지 사람을 기다리는 시간
MIN_PLAY_SEC = 30  # 출발 뒤 이만큼 지나야 결과를 받는다
LIMIT_SEC = 180
TRACKS = 13
MIN_FINISH = (27, 30, 35, 43, 49, 37, 32, 34, 35, 30, 31, 32, 37)  # versus_bumpervs 와 같은 값 — 부스트를 내내 받아도 못 내는 기록
MAX_OPEN_PER_HOST = 3
RT_GRACE_SEC = 180  # 판이 끝난 뒤에도 실시간 통로를 열어 두는 시간
LIVE = ("OPEN", "RACING")
IN_SEAT = ("HOST", "JOINED")

MANSION_MIN_SEC = 180  # 두뇌 저택 — 출발 뒤 이만큼 지나야 결과를 받는다(라운드 3~4개 · 한 판 10~15분)
MANSION_MAX_SEC = 40 * 60
MANSION_MAX_STARS = 100_000

# 젤리 숲 — 엔진(web/_shared/jellyvs-vs.js)의 ROUND · EVEN 과 같은 값
JELLY_ROUND_SEC = 120  # 판 길이 2분 — 여러 명은 삼켜도 판이 끝나지 않아 늘 끝까지 간다
JELLY_MIN_SEC = 110  # 출발 뒤 이만큼 지나야 결과를 받는다(준비 · 셋 세기 포함)
JELLY_MAPS = 6
JELLY_EVEN = 102  # 1등이 2등보다 1.02배 넘게 커야 1등 — 크기는 ×100 정수로 비교
JELLY_SIZE_MIN, JELLY_SIZE_MAX = 50, 3000  # ×100 — 물리면 0.75 까지 줄고, 가시대왕 · 젤리를 삼키며 커진다

REASONS = {
    "WIN": "별조각 1등",
    "BIGGEST": "가장 큰 젤리",
    "FINISH": "결승선",
    "FARTHER": "시간 끝 · 가장 멀리 감",
    "BOT": "컴퓨터가 1등",
    "DRAW": "같은 거리 · 무승부",
    "MISMATCH": "결과가 서로 달라 무효",
    "NO_REPORT": "결과 없음",
}

GAME_REASONS = {  # 게임마다 다른 말 — 없으면 REASONS
    "jellyvs": {"DRAW": "크기가 거의 같아 승자 없음", "BOT": "컴퓨터 젤리가 가장 큼"},
}


def _reason_label(game: str, reason: Optional[str]) -> Optional[str]:
    if not reason:
        return None
    return GAME_REASONS.get(game, {}).get(reason) or REASONS.get(reason)


register_messages({
    "PARTY_NOT_FOUND": "여러 명 대전을 찾을 수 없어요.",
    "PARTY_BAD_MEMBERS": "초대할 동료를 1 ~ 5명 골라 주세요.",
    "PARTY_LIMIT": "열어 둔 여러 명 대전이 너무 많아요. 먼저 끝내거나 닫아 주세요.",
    "PARTY_NOT_OPEN": "이미 출발했거나 끝난 대전이에요.",
    "PARTY_NOT_INVITED": "초대 받은 대전이 아니에요.",
    "PARTY_FULL": "자리가 다 찼어요(최대 6명).",
    "PARTY_ONLY_HOST": "대전을 연 사람만 할 수 있어요.",
    "PARTY_FEW": "함께 달릴 동료가 한 명 이상 있어야 출발할 수 있어요.",
    "PARTY_NOT_RACING": "달리는 중인 대전이 아니에요.",
    "PARTY_BAD_RESULT": "경주 결과가 올바르지 않아요.",
    "PARTY_TOO_SOON": "경주가 끝나기 전이에요.",
})


def _now_ms() -> int:
    return int(time.time() * 1000)


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=KST)


def _track(game: str, track) -> int:
    """대기실 트랙 — 젤리 숲은 숲(맵) 번호(1 ~ 6)."""
    try:
        n = int(track or 1)
    except (TypeError, ValueError):
        n = 1
    return max(1, min(JELLY_MAPS if game == "jellyvs" else TRACKS, n))


def _check_game(game: str) -> str:
    if game not in PARTY_GAMES or not game_visible(game):
        raise_app_error("PARTY_NOT_FOUND", 404)
    return game


def _person(p: Optional[Member]) -> dict:
    if p is None:
        return {"id": None, "name": "(알 수 없음)", "department": "", "avatarUrl": None}
    return {"id": p.id, "name": p.name, "department": p.department or "", "avatarUrl": member_avatar_url(p.id)}


async def _people(db: AsyncSession, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {x.id: x for x in (await db.execute(select(Member).where(Member.id.in_(ids)))).scalars().all()}


async def _seats(db: AsyncSession, party_ids) -> dict:
    ids = list(party_ids)
    out: dict = {i: [] for i in ids}
    if not ids:
        return out
    rows = (
        await db.execute(select(GamePartySeat).where(GamePartySeat.party_id.in_(ids)).order_by(GamePartySeat.id))
    ).scalars().all()
    for s in rows:
        out[s.party_id].append(s)
    return out


async def _get(db: AsyncSession, party_id: int, lock: bool = False) -> GameParty:
    stmt = select(GameParty).where(GameParty.id == party_id)
    if lock:
        stmt = stmt.with_for_update()
    p = (await db.execute(stmt)).scalar_one_or_none()
    if p is None:
        raise_app_error("PARTY_NOT_FOUND", 404)
    return p


def _seat_of(seats: list, member_id: int) -> Optional[GamePartySeat]:
    return next((s for s in seats if s.member_id == member_id), None)


def _set_state(p: GameParty, **kw) -> None:
    st = dict(p.state or {})
    st.update(kw)
    p.state = st  # JSON 열은 새 dict 로 바꿔 넣어야 저장된다


# ── 기한 정리 ─────────────────────────────────────────────────────────


def _judge(p: GameParty) -> None:
    """받은 결과로 판을 끝낸다 — 과반이 같은 (1등 차, 트랙)이면 그 결과, 아니면 무효."""
    st = dict(p.state or {})
    players = [int(x) for x in st.get("players") or []]
    rep = st.get("rep") or {}
    reps = [rep[str(i)] for i in players if str(i) in rep]
    p.status = "DONE"
    p.finished_at = now_kst()
    p.deadline_at = None
    if not reps:
        p.end_reason = "NO_REPORT"
        return
    votes = Counter((r.get("winner"), r.get("track")) for r in reps)
    (winner, track), n = votes.most_common(1)[0]
    need = len(players) // 2 + 1 if len(players) > 2 else 2  # 둘이면 둘 다 같아야
    if n < need:
        p.end_reason = "MISMATCH"
        return
    base = next(r for r in reps if (r.get("winner"), r.get("track")) == (winner, track))
    final = {k: base.get(k) for k in ("winner", "order", "dist", "track", "sec", "stars", "rounds", "size", "map") if k in base}
    st["final"] = final
    st["agreed"] = [i for i in players if str(i) in rep and (rep[str(i)].get("winner"), rep[str(i)].get("track")) == (winner, track)]
    p.state = st
    if winner is None:
        p.end_reason = "DRAW"
    elif 0 <= winner < len(players):
        p.winner_id = players[winner]
        if p.game == "mansion":
            p.end_reason = "WIN"
        elif p.game == "jellyvs":
            p.end_reason = "BIGGEST"
        else:
            p.end_reason = "FINISH" if (final.get("order") or [None] * 6)[winner] is not None else "FARTHER"
    else:
        p.end_reason = "BOT"


async def _sweep(db: AsyncSession) -> None:
    """기한이 지난 판 정리 — 대기실은 EXPIRED, 달리던 판은 받은 결과로 판정."""
    now = now_kst()
    rows = (
        await db.execute(select(GameParty).where(GameParty.status.in_(LIVE), GameParty.deadline_at < now).with_for_update(skip_locked=True))
    ).scalars().all()
    if not rows:
        return
    for p in rows:
        if p.status == "OPEN":
            p.status = "EXPIRED"
            p.finished_at = now
            p.deadline_at = None
        else:
            _judge(p)
            await _stamp_agreed(db, p)
    await db.commit()


async def _stamp_agreed(db: AsyncSession, p: GameParty) -> None:
    if p.end_reason not in ("FINISH", "FARTHER", "WIN", "BIGGEST", "BOT", "DRAW"):
        return
    today = today_kst()
    for mid in (p.state or {}).get("agreed") or []:
        m = await db.get(Member, int(mid))
        if m is not None and m.status == MemberStatus.ACTIVE:
            await _give_stamp(db, m, p.game, today)


# ── 화면에 보낼 모양 ───────────────────────────────────────────────────


def _payload(p: GameParty, seats: list, people: dict, member_id: int) -> dict:
    st = p.state or {}
    mine = _seat_of(seats, member_id)
    out = {
        "id": p.id,
        "game": p.game,
        "status": p.status,
        "host": _person(people.get(p.host_id)),
        "isHost": p.host_id == member_id,
        "meId": member_id,
        "mySeat": mine.status if mine else None,
        "seats": [{**_person(people.get(s.member_id)), "seat": s.status} for s in seats],
        "track": int(st.get("track") or 1),
        "players": [int(x) for x in st.get("players") or []],
        "bots": [int(x) for x in st.get("bots") or []],
        "deadlineAt": p.deadline_at.isoformat() if p.deadline_at else None,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
        "finishedAt": p.finished_at.isoformat() if p.finished_at else None,
        "endReason": p.end_reason,
        "reasonLabel": _reason_label(p.game, p.end_reason),
        "winner": _person(people.get(p.winner_id)) if p.winner_id else None,
        "reported": str(member_id) in (st.get("rep") or {}),
    }
    if p.status == "DONE":
        out["final"] = st.get("final")
        out["result"] = "win" if p.winner_id == member_id else ("none" if p.end_reason in ("MISMATCH", "NO_REPORT") else "lose")
    return out


async def _view(db: AsyncSession, member: Member, p: GameParty) -> dict:
    seats = (await _seats(db, [p.id]))[p.id]
    people = await _people(db, {p.host_id, p.winner_id, *(s.member_id for s in seats)})
    return _payload(p, seats, people, member.id)


async def _valid_guests(db: AsyncSession, member: Member, ids) -> list:
    from app.services.match import _real_person

    want = []
    for i in ids or []:
        try:
            i = int(i)
        except (TypeError, ValueError):
            raise_app_error("PARTY_BAD_MEMBERS")
        if i != member.id and i not in want:
            want.append(i)
    if not want:
        raise_app_error("PARTY_BAD_MEMBERS")
    people = await _people(db, want)
    for i in want:
        x = people.get(i)
        if x is None or x.status != MemberStatus.ACTIVE or not _real_person(x):
            raise_app_error("PARTY_BAD_MEMBERS")
    return [people[i] for i in want]


async def _invite_notices(db: AsyncSession, p: GameParty, host: Member, guests: list) -> list:
    out = []
    for g in guests:
        out += await teams_service.enqueue_party_invited_notice(db, game=p.game, party_id=p.id, host=host, target=g, deadline_at=p.deadline_at)
    return out


# ── 행동 ──────────────────────────────────────────────────────────────


async def create(db: AsyncSession, member: Member, game: str, member_ids: list, track: int = 1):
    ensure_open(member=member)
    _check_game(game)
    await _sweep(db)
    guests = await _valid_guests(db, member, member_ids)
    if len(guests) > MAX_SEATS - 1:
        raise_app_error("PARTY_BAD_MEMBERS")
    opened = (
        await db.execute(select(GameParty.id).where(GameParty.game == game, GameParty.host_id == member.id, GameParty.status.in_(LIVE)))
    ).scalars().all()
    if len(opened) >= MAX_OPEN_PER_HOST:
        raise_app_error("PARTY_LIMIT")
    p = GameParty(
        game=game, host_id=member.id, status="OPEN",
        state={"track": _track(game, track)},
        deadline_at=now_kst() + timedelta(hours=OPEN_HOURS),
    )
    db.add(p)
    await db.flush()
    db.add(GamePartySeat(party_id=p.id, member_id=member.id, status="HOST"))
    for g in guests:
        db.add(GamePartySeat(party_id=p.id, member_id=g.id, status="INVITED"))
    await db.flush()
    notify = await _invite_notices(db, p, member, guests)
    await db.commit()
    return await _view(db, member, p), notify


async def invite(db: AsyncSession, member: Member, party_id: int, member_ids: list):
    ensure_open(member=member)
    p = await _get(db, party_id, lock=True)
    if p.host_id != member.id:
        raise_app_error("PARTY_ONLY_HOST")
    if p.status != "OPEN":
        raise_app_error("PARTY_NOT_OPEN")
    seats = (await _seats(db, [p.id]))[p.id]
    guests = await _valid_guests(db, member, member_ids)
    fresh = []
    for g in guests:
        s = _seat_of(seats, g.id)
        if s is None:
            fresh.append(g)
            seats.append(GamePartySeat(party_id=p.id, member_id=g.id, status="INVITED"))
            db.add(seats[-1])
        elif s.status in ("DECLINED", "LEFT"):
            s.status = "INVITED"
            fresh.append(g)
    if sum(1 for s in seats if s.status in ("HOST", "JOINED", "INVITED")) > MAX_SEATS:
        raise_app_error("PARTY_FULL")
    await db.flush()
    notify = await _invite_notices(db, p, member, fresh)
    await db.commit()
    return await _view(db, member, p), notify


async def accept(db: AsyncSession, member: Member, party_id: int) -> dict:
    ensure_open(member=member)
    await _sweep(db)
    p = await _get(db, party_id, lock=True)
    seats = (await _seats(db, [p.id]))[p.id]
    s = _seat_of(seats, member.id)
    if s is None or s.status == "HOST":
        raise_app_error("PARTY_NOT_INVITED")
    if p.status != "OPEN":
        raise_app_error("PARTY_NOT_OPEN")
    if s.status != "JOINED":
        if sum(1 for x in seats if x.status in ("HOST", "JOINED")) >= MAX_SEATS:
            raise_app_error("PARTY_FULL")
        s.status = "JOINED"
    await db.commit()
    return await _view(db, member, p)


async def decline(db: AsyncSession, member: Member, party_id: int) -> dict:
    """초대 거절 · 대기실에서 나가기(주인이면 판 닫기) — 업무 시간에도 할 수 있다."""
    p = await _get(db, party_id, lock=True)
    seats = (await _seats(db, [p.id]))[p.id]
    s = _seat_of(seats, member.id)
    if s is None:
        raise_app_error("PARTY_NOT_INVITED")
    if s.status == "HOST":
        if p.status == "OPEN":
            p.status = "CANCELLED"
            p.finished_at = now_kst()
            p.deadline_at = None
    elif p.status == "OPEN":
        s.status = "DECLINED" if s.status == "INVITED" else "LEFT"
    await db.commit()
    return await _view(db, member, p)


async def start(db: AsyncSession, member: Member, party_id: int, player_ids: list, track: int) -> dict:
    """주인이 출발 — 대기실에 와 있는 사람들(player_ids, 주인 빼고)로 달릴 사람을 정한다."""
    ensure_open(member=member)
    p = await _get(db, party_id, lock=True)
    if p.host_id != member.id:
        raise_app_error("PARTY_ONLY_HOST")
    if p.status != "OPEN":
        raise_app_error("PARTY_NOT_OPEN")
    seats = (await _seats(db, [p.id]))[p.id]
    joined = {s.member_id for s in seats if s.status == "JOINED"}
    players = [member.id]
    for i in player_ids or []:
        try:
            i = int(i)
        except (TypeError, ValueError):
            continue
        if i in joined and i not in players:
            players.append(i)
    players = players[:MAX_SEATS]
    if len(players) < 2:
        raise_app_error("PARTY_FEW")
    now = now_kst()
    p.status = "RACING"
    p.started_at = now
    p.deadline_at = now + timedelta(hours=RACE_HOURS)
    _set_state(p, players=players, bots=list(range(len(players), MAX_SEATS)), at=_ms(now),
               track=_track(p.game, track), rep={})
    await db.commit()
    return await _view(db, member, p)


def _num(x) -> float:
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        raise_app_error("PARTY_BAD_RESULT")
    if x != x or x in (float("inf"), float("-inf")):
        raise_app_error("PARTY_BAD_RESULT")
    return float(x)


def _clean(data: dict, cars: int, start_ms: int) -> dict:
    if not isinstance(data, dict):
        raise_app_error("PARTY_BAD_RESULT")
    track = data.get("track")
    if isinstance(track, bool) or not isinstance(track, int) or not 1 <= track <= TRACKS:
        raise_app_error("PARTY_BAD_RESULT")
    winner = data.get("winner")
    if winner is not None and (isinstance(winner, bool) or not isinstance(winner, int) or not 0 <= winner < cars):
        raise_app_error("PARTY_BAD_RESULT")
    order, dist = data.get("order"), data.get("dist")
    if not isinstance(order, list) or len(order) != cars or not isinstance(dist, list) or len(dist) != cars:
        raise_app_error("PARTY_BAD_RESULT")
    order = [None if t is None else round(_num(t), 2) for t in order]
    dist = [round(min(1.0, max(0.0, _num(d))), 3) for d in dist]
    sec = round(_num(data.get("sec")), 2)
    if not 0 < sec <= LIMIT_SEC + 30:
        raise_app_error("PARTY_BAD_RESULT")
    lo = MIN_FINISH[track - 1]
    for t in order:
        if t is not None and not lo <= t <= LIMIT_SEC + 1:
            raise_app_error("PARTY_BAD_RESULT")
    if winner is not None and order[winner] is None and any(t is not None for t in order):
        raise_app_error("PARTY_BAD_RESULT")  # 들어온 차가 있는데 못 들어온 차가 1등
    if _now_ms() - start_ms < MIN_PLAY_SEC * 1000:
        raise_app_error("PARTY_TOO_SOON")
    return {"winner": winner, "order": order, "dist": dist, "track": track, "sec": sec, "at": _now_ms()}


def _clean_mansion(data: dict, seats: int, start_ms: int) -> dict:
    """두뇌 저택 결과 — {"winner": 1등 자리 번호 | None(같은 별조각 공동 1등), "stars": [자리마다 별조각], "rounds": 라운드 수, "sec": 판 길이}."""
    if not isinstance(data, dict):
        raise_app_error("PARTY_BAD_RESULT")
    stars = data.get("stars")
    if not isinstance(stars, list) or len(stars) != seats:
        raise_app_error("PARTY_BAD_RESULT")
    clean = []
    for v in stars:
        if isinstance(v, bool) or not isinstance(v, int) or not -MANSION_MAX_STARS <= v <= MANSION_MAX_STARS:
            raise_app_error("PARTY_BAD_RESULT")
        clean.append(v)
    rounds = data.get("rounds")
    if isinstance(rounds, bool) or not isinstance(rounds, int) or not 1 <= rounds <= 8:
        raise_app_error("PARTY_BAD_RESULT")
    sec = round(_num(data.get("sec")), 1)
    if not 0 < sec <= MANSION_MAX_SEC:
        raise_app_error("PARTY_BAD_RESULT")
    top = max(clean)
    best = [i for i, v in enumerate(clean) if v == top]
    winner = data.get("winner")
    want = best[0] if len(best) == 1 else None
    if winner != want or isinstance(winner, bool):
        raise_app_error("PARTY_BAD_RESULT")  # 1등은 별조각이 가장 많은 자리여야 한다
    if _now_ms() - start_ms < MANSION_MIN_SEC * 1000:
        raise_app_error("PARTY_TOO_SOON")
    return {"winner": winner, "stars": clean, "rounds": rounds, "sec": sec, "at": _now_ms()}


def _clean_jelly(data: dict, seats: int, start_ms: int) -> dict:
    """젤리 숲 결과 — {"winner": 1등 자리 번호 | None(1 · 2등 차가 1.02배 미만), "size": [자리마다 크기×100 정수], "sec": 판 길이, "map": 숲 번호}."""
    if not isinstance(data, dict):
        raise_app_error("PARTY_BAD_RESULT")
    size = data.get("size")
    if not isinstance(size, list) or len(size) != seats:
        raise_app_error("PARTY_BAD_RESULT")
    clean = []
    for v in size:
        if isinstance(v, bool) or not isinstance(v, int) or not JELLY_SIZE_MIN <= v <= JELLY_SIZE_MAX:
            raise_app_error("PARTY_BAD_RESULT")
        clean.append(v)
    sec = round(_num(data.get("sec")), 1)
    if not JELLY_ROUND_SEC - 10 <= sec <= JELLY_ROUND_SEC + 10:
        raise_app_error("PARTY_BAD_RESULT")  # 여러 명은 늘 2분을 다 한다
    mp = data.get("map", 1)
    if isinstance(mp, bool) or not isinstance(mp, int) or not 1 <= mp <= JELLY_MAPS:
        raise_app_error("PARTY_BAD_RESULT")
    order = sorted(range(seats), key=lambda i: -clean[i])
    top, second = clean[order[0]], clean[order[1]] if seats > 1 else 0
    want = order[0] if top * 100 >= second * JELLY_EVEN else None  # 엔진 partyWinner 와 같은 셈
    winner = data.get("winner")
    if isinstance(winner, bool) or winner != want:
        raise_app_error("PARTY_BAD_RESULT")  # 1등은 2등보다 1.02배 넘게 큰 하나뿐인 가장 큰 젤리여야 한다
    if _now_ms() - start_ms < JELLY_MIN_SEC * 1000:
        raise_app_error("PARTY_TOO_SOON")
    return {"winner": winner, "size": clean, "map": mp, "sec": sec, "at": _now_ms()}


CLEANERS = {"mansion": _clean_mansion, "jellyvs": _clean_jelly}


async def report(db: AsyncSession, member: Member, party_id: int, data: dict) -> dict:
    ensure_open(grace=True, member=member)
    p = await _get(db, party_id, lock=True)
    st = dict(p.state or {})
    players = [int(x) for x in st.get("players") or []]
    if p.status != "RACING" or member.id not in players:
        if p.status == "DONE":
            return await _view(db, member, p)
        raise_app_error("PARTY_NOT_RACING")
    rep = dict(st.get("rep") or {})
    if str(member.id) not in rep:
        cars = len(players) + len(st.get("bots") or [])  # 늘 6대(사람 + 컴퓨터)
        clean = CLEANERS.get(p.game, _clean)
        rep[str(member.id)] = clean(data, cars, int(st.get("at") or 0))
        st["rep"] = rep
        p.state = st
        if len(rep) == 1:
            soon = now_kst() + timedelta(minutes=REPORT_WAIT_MIN)
            if p.deadline_at is None or _aware(p.deadline_at) > soon:
                p.deadline_at = soon
    if all(str(i) in rep for i in players):
        _judge(p)
        await _stamp_agreed(db, p)
    await db.commit()
    return await _view(db, member, p)


async def detail(db: AsyncSession, member: Member, party_id: int) -> dict:
    await _sweep(db)
    p = await _get(db, party_id)
    seats = (await _seats(db, [p.id]))[p.id]
    if _seat_of(seats, member.id) is None:
        raise_app_error("PARTY_NOT_FOUND", 404)
    people = await _people(db, {p.host_id, p.winner_id, *(s.member_id for s in seats)})
    return _payload(p, seats, people, member.id)


async def overview(db: AsyncSession, member: Member, game: str) -> dict:
    """내 여러 명 대전 — 받은 초대 · 열어 둔(들어간) 대기실 · 최근 끝난 판."""
    _check_game(game)
    await _sweep(db)
    my = (
        await db.execute(select(GamePartySeat.party_id, GamePartySeat.status).where(GamePartySeat.member_id == member.id))
    ).all()
    ids = [pid for pid, _ in my]
    if not ids:
        out = {"invites": [], "open": [], "recent": []}
        if game == "mansion":
            out["ranking"] = await ranking(db, member, game)
        return out
    live = (
        await db.execute(select(GameParty).where(GameParty.id.in_(ids), GameParty.game == game, GameParty.status.in_(LIVE)))
    ).scalars().all()
    done = (
        await db.execute(
            select(GameParty).where(GameParty.id.in_(ids), GameParty.game == game, GameParty.status == "DONE")
            .order_by(GameParty.finished_at.desc()).limit(5)
        )
    ).scalars().all()
    seats = await _seats(db, [p.id for p in [*live, *done]])
    people = await _people(db, {x for p in [*live, *done] for x in (p.host_id, p.winner_id, *(s.member_id for s in seats[p.id]))})
    items = [_payload(p, seats[p.id], people, member.id) for p in live]
    out = {
        "invites": [x for x in items if x["mySeat"] == "INVITED" and x["status"] == "OPEN"],
        "open": [x for x in items if x["mySeat"] in IN_SEAT],
        "recent": [_payload(p, seats[p.id], people, member.id) for p in done],
    }
    if game == "mansion":  # 1:1 대전이 없는 게임 — 순위표도 여기서
        out["ranking"] = await ranking(db, member, game)
    return out


async def incoming_count(db: AsyncSession, member: Member, game: str) -> int:
    """아케이드 알림 — 받은 여러 명 대전 초대 수."""
    rows = (
        await db.execute(
            select(GameParty.id)
            .join(GamePartySeat, GamePartySeat.party_id == GameParty.id)
            .where(GameParty.game == game, GameParty.status == "OPEN", GameParty.deadline_at > now_kst(),
                   GamePartySeat.member_id == member.id, GamePartySeat.status == "INVITED")
        )
    ).scalars().all()
    return len(rows)


async def ranking_wins(db: AsyncSession, game: str) -> dict:
    """순위에 더할 승 — {승자 id: {(같이 달린 사람들, 날짜), …}}. 같은 사람들과 하루에 여러 번 이겨도 1승."""
    rows = (
        await db.execute(select(GameParty).where(GameParty.game == game, GameParty.status == "DONE", GameParty.winner_id.is_not(None)))
    ).scalars().all()
    wins: dict = {}
    for p in rows:
        if p.end_reason not in ("FINISH", "FARTHER", "WIN", "BIGGEST"):
            continue
        others = tuple(sorted(int(x) for x in (p.state or {}).get("players") or [] if int(x) != p.winner_id))
        if not others:
            continue
        day = p.finished_at.astimezone(KST).date()
        wins.setdefault(p.winner_id, set()).add(("party", others, day))
    return wins


async def ranking(db: AsyncSession, member: Member, game: str) -> dict:
    """여러 명 대전만 있는 게임(두뇌 저택)의 순위 — 1등만 1승(같은 사람들과 하루에 여러 번 이겨도 1승). 패는 세지 않는다."""
    wins = await ranking_wins(db, game)
    people = {i: x for i, x in (await _people(db, set(wins))).items() if x.status == MemberStatus.ACTIVE}
    table = [{**_person(x), "wins": len(wins.get(i, ())), "losses": 0} for i, x in people.items()]
    table.sort(key=lambda r: (-r["wins"], r["name"]))
    rank, prev = 0, None
    for n, row in enumerate(table, 1):
        if row["wins"] != prev:
            rank, prev = n, row["wins"]
        row["rank"] = rank
    return {"top": table[:20], "me": next((r for r in table if r["id"] == member.id), None)}


async def seat_for_rt(db: AsyncSession, party_id: int, member_id: int) -> Optional[tuple]:
    """실시간 통로용 — (역할 host|guest, 판 상태, 들어온 사람 id 들). 내 자리가 아니면 None.
    끝난 판(DONE)도 끝난 뒤 RT_GRACE_SEC 동안은 「GRACE」로 돌려줘 통로를 열어 둔다 — 결과 화면에서 「같은 사람들과 다시」 소식을 주고받게."""
    p = (
        await db.execute(select(GameParty.host_id, GameParty.status, GameParty.game, GameParty.finished_at).where(GameParty.id == party_id))
    ).first()
    if p is None or p[2] not in PARTY_GAMES:
        return None
    status = p[1]
    if status == "DONE" and p[3] is not None and (now_kst() - _aware(p[3])).total_seconds() < RT_GRACE_SEC:
        status = "GRACE"
    rows = (
        await db.execute(select(GamePartySeat.member_id, GamePartySeat.status).where(GamePartySeat.party_id == party_id))
    ).all()
    seated = [mid for mid, st in rows if st in IN_SEAT]
    if member_id not in seated:
        return None
    return ("host" if member_id == p[0] else "guest", status, seated)
