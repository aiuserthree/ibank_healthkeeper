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
     같은 결과를 보낸 사람은 오늘 참여 도장, 사람을 이긴 1등(순위 1승과 같은 잣대)은 대전 승리 보너스 도장도. 다 보내지 않아도 첫 보고 뒤 REPORT_WAIT_MIN 이 지나면 그때까지 온 것으로 판정한다.
  순위 — match._ranking(bumpervs · jellyvs)에 더해진다: 1등만 1승(같은 사람들과 하루에 여러 번 이겨도 1승), 패는 세지 않는다.
  두뇌 저택은 1:1 이 없어 overview 의 ranking 으로 따로 보여 준다.
  젤리 숲 — 6마리가 2분 동안 먹고 자란다. 삼켜진 젤리는 3초 뒤 처음 크기로 다시 태어난다. 끝났을 때 가장 큰 젤리 1등만 1승
  (1 · 2등 크기 차가 1.02배 미만이면 승자 없음). 판 화면은 web/games/jellyvs.html · 엔진 web/_shared/jellyvs-vs.js.
  팀 게임(TEAM_GAMES — 뿅뿅 달나라 대포 대전 moonshotvs 의 2:2 · 3:3 팀전)은 이 파일 끝 「팀 게임」 절의 옵트인 갈래로만 돈다.
  다른 게임은 그 갈래를 지나지 않는다(팀 갈래는 모두 `if p.game in TEAM_GAMES` 안 · 기본값 None 인 새 인자).

판(state)
  track: 대기실 트랙(1 ~ 13) — 젤리 숲은 숲(맵) 번호(1 ~ 6) · players: [달리는 사람 id …](주인이 0번) · bots: [컴퓨터 차 번호 …] · at: 출발 시각(epoch ms)
  rep: {str(id): {"winner", "order", "dist", "track", "sec", "at"}} · final: {"winner", "order", "dist", "track", "sec"}
  (두뇌 저택은 {"winner", "stars", "rounds", "sec"}, 젤리 숲은 {"winner", "size", "map", "sec"})
"""

from __future__ import annotations

import json
import logging
import re as _re
import secrets as _secrets
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
from app.services.game import _give_stamp, ensure_open, game_visible, give_win_bonus, win_bonus_state
from app.services.versus_moonshotvs import clean_line as _moon_line  # 팀 게임(달나라 대포) 행동 줄 검사 — 1:1 과 같은 잣대

logger = logging.getLogger(__name__)

PARTY_GAMES = ("bumpervs", "mansion", "jellyvs")  # 선다운 범퍼스 대전 · 한밤의 두뇌 저택 · 꿀꺽 젤리 숲 대전
PARTY_GAMES = (*PARTY_GAMES, "moonshotvs")  # 뿅뿅 달나라 대포 대전 — 팀전(2:2 · 3:3)만 여기로(1:1 은 match.py)
TEAM_GAMES = ("moonshotvs",)  # 팀 게임 — 자리 번호 짝/홀 = 팀, 이긴 팀 사람마다 1승(이 파일 끝 「팀 게임」 절)
MAX_SEATS = 6  # 트랙에 설 수 있는 차 — 사람(주인 포함) 최대 6명, 남는 자리는 컴퓨터
OPEN_HOURS = 2  # 대기실이 열려 있는 시간 — 그 안에 출발하지 않으면 EXPIRED
RACE_HOURS = 1  # 출발 뒤 결과를 기다리는 최대 시간
REPORT_WAIT_MIN = 3  # 첫 결과가 온 뒤 나머지 사람을 기다리는 시간
MIN_PLAY_SEC = 30  # 출발 뒤 이만큼 지나야 결과를 받는다
LIMIT_SEC = 300  # 경주 시간 상한(5분) — versus_bumpervs.LIMIT_SEC 과 같다(3바퀴 경주는 보통 2분 남짓)
TRACKS = 13
MIN_FINISH = (99, 103, 99, 99, 100, 99, 99, 99, 106, 99, 99, 99, 102)  # versus_bumpervs 와 같은 값(3바퀴) — 부스트를 내내 받아도 못 내는 기록
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
    if game in TEAM_GAMES:
        return max(1, min(MOON_MAPS, n))  # 달나라 대포 — 맵 번호(1 ~ 6)
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
    if p.game in TEAM_GAMES:
        return _judge_team(p)
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


WIN_REASONS = ("FINISH", "FARTHER", "WIN", "BIGGEST")  # 사람이 1등으로 끝난 판 — 순위 1승 · 대전 승리 보너스


def _beaten(p: GameParty) -> tuple:
    """1등이 이긴 사람들(함께 한 사람, 컴퓨터 제외) — 순위 1승과 같은 잣대. 사람을 이긴 판이 아니면 빈 튜플."""
    if p.game in TEAM_GAMES:
        return _team_beaten(p)
    if p.status != "DONE" or p.winner_id is None or p.end_reason not in WIN_REASONS:
        return ()
    return tuple(sorted(int(x) for x in (p.state or {}).get("players") or [] if int(x) != p.winner_id))


def _bonus_beaten(p: GameParty) -> tuple:
    """대전 승리 보너스를 줄 판이면 1등이 이긴 사람들, 아니면 빈 튜플 — 순위 1승(_beaten)보다 엄격하다(순위 · 전적은 그대로).

    사람 참가자 전원이 결과를 보냈고 모두 같은 결과일 때만(agreed == players). 다수 보고로만 정해졌거나
    (보내지 않은 사람 · 다른 결과를 보낸 사람이 있음) 판 자리가 겹치면 보너스 없음.
    """
    beaten = _beaten(p)
    if not beaten:
        return ()
    if p.game in TEAM_GAMES:
        return _team_bonus_beaten(p, beaten)
    st = p.state or {}
    players = [int(x) for x in st.get("players") or []]
    agreed = {int(x) for x in st.get("agreed") or []}
    if len(set(players)) != len(players) or set(players) != agreed or int(p.winner_id) in beaten:
        return ()
    return beaten


def _kst_day(dt):
    if dt is None:
        return None
    return dt.astimezone(KST).date() if dt.tzinfo else dt.date()


async def _stamp_agreed(db: AsyncSession, p: GameParty) -> None:
    if p.end_reason not in ("FINISH", "FARTHER", "WIN", "BIGGEST", "BOT", "DRAW"):
        return
    today = today_kst()
    # 대전 승리 보너스 — 사람이 2명 이상인 판(나 + 동료 1명 이상)에서 1등, 사람 전원의 결과가 같을 때만(_bonus_beaten).
    # 여러 명 대전 게임 전부가 여기를 지난다. 보너스 날짜는 판이 끝난 시각(한국 날짜)
    others = _bonus_beaten(p)
    if others:
        for wid in _winner_ids(p):  # 팀 게임은 이긴 팀 사람마다 · 그 밖은 1등 한 명(winner_id)
            w = await db.get(Member, int(wid))
            if w is not None and w.status == MemberStatus.ACTIVE:
                await give_win_bonus(db, w, p.game, _kst_day(p.finished_at) or today, f"party:{p.id}", others)
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
    if p.game in TEAM_GAMES:
        _team_payload(p, out, people, member_id)
    return out


async def _view(db: AsyncSession, member: Member, p: GameParty) -> dict:
    seats = (await _seats(db, [p.id]))[p.id]
    people = await _people(db, {p.host_id, p.winner_id, *(s.member_id for s in seats)})
    return await _with_bonus(db, member, p, _payload(p, seats, people, member.id))


async def _with_bonus(db: AsyncSession, member: Member, p: GameParty, out: dict) -> dict:
    """결과 화면용 대전 승리 보너스 표시 — winBonus(got · already · full · None) · winBonusMonth (match._view 와 같은 값)."""
    out.update(
        await win_bonus_state(
            db, member.id, f"party:{p.id}", bool(_bonus_beaten(p)) and member.id in _winner_ids(p), p.finished_at
        )
    )
    return out


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


async def start(db: AsyncSession, member: Member, party_id: int, player_ids: list, track: int,
                team_size: Optional[int] = None, bot_level: Optional[str] = None, lineup: Optional[list] = None) -> dict:
    """주인이 출발 — 대기실에 와 있는 사람들(player_ids, 주인 빼고)로 달릴 사람을 정한다.
    team_size · bot_level · lineup 은 팀 게임만 본다(_start_team) — 다른 게임은 세 인자를 보지 않는다."""
    ensure_open(member=member)
    p = await _get(db, party_id, lock=True)
    if p.host_id != member.id:
        raise_app_error("PARTY_ONLY_HOST")
    if p.status != "OPEN":
        raise_app_error("PARTY_NOT_OPEN")
    seats = (await _seats(db, [p.id]))[p.id]
    joined = {s.member_id for s in seats if s.status == "JOINED"}
    if p.game in TEAM_GAMES:
        _start_team(p, member, joined, player_ids, track, team_size, bot_level, lineup)
        await db.commit()
        return await _view(db, member, p)
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
CLEANERS["moonshotvs"] = lambda data, cars, start_ms: _clean_moon(data, cars, start_ms)  # 팀 게임 — 이 파일 끝 「팀 게임」 절


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
        got = clean(data, cars, int(st.get("at") or 0))
        if p.game in TEAM_GAMES:
            got = _team_report(st, p, member, got)
        rep[str(member.id)] = got
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
    return await _with_bonus(db, member, p, _payload(p, seats, people, member.id))


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
        others = _beaten(p)
        if not others:
            continue
        day = p.finished_at.astimezone(KST).date()
        for wid in _winner_ids(p):  # 팀 게임은 이긴 팀 사람마다 · 그 밖은 1등 한 명
            wins.setdefault(wid, set()).add(("party", others, day))
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


# ── 대기실 채팅 ───────────────────────────────────────────────────────
# 대기실(OPEN)에 자리가 있는 사람(주인 · 들어온 사람)끼리 짧은 글을 주고받는다. 남기지 않는다 — DB 가 아니라 Redis 의
# 기한 있는 목록(prt:chat:{판 id})에 최근 CHAT_KEEP 개만 두고, 출발 · 닫힘 · 기한이 지나면 읽을 때 지운다(늦어도 CHAT_TTL_SEC 뒤 사라짐).
# 새 글은 실시간 통로(realtime_party)의 같은 채널로 {"t": "chat", "c": 글} 을 보내 대기실 화면들이 바로 받는다("from" 이 없다 —
# 사람이 통로로 보낸 것은 서버가 늘 "from" 을 붙이니 화면은 "from" 없는 chat 만 믿는다). 채팅을 모르는 예전 화면은 이 소식을 그냥 버린다.
# 글 내용은 로그에 남기지 않는다. 화면은 글자 그대로(HTML 로 해석하지 않게) 그린다.

CHAT_MAX = 80  # 한 글 최대 글자 수 — 넘으면 서버가 자른다
CHAT_KEEP = 50  # 판마다 최근 글 수
CHAT_GAP_MS = 2000  # 한 사람이 이 간격 안에 또 보내면 거절
CHAT_TTL_SEC = OPEN_HOURS * 3600 + 600  # 대기실이 열려 있는 시간 + 10분 — 그 뒤엔 Redis 가 지운다

register_messages({
    "PARTY_CHAT_SEAT": "대기실에 들어온 사람만 채팅할 수 있어요.",
    "PARTY_CHAT_EMPTY": "보낼 글을 적어 주세요.",
    "PARTY_CHAT_FAST": "조금 천천히 보내 주세요.",
})

_BIDI = {0x200E, 0x200F, *range(0x202A, 0x202F), *range(0x2066, 0x206A)}  # 글자 방향을 뒤집는 보이지 않는 글자


def rt_channel(redis, party_id: int, name: str) -> str:
    """실시간 통로 채널 이름(realtime_party 와 같은 값) — name: host · all · g{id}."""
    db = redis.connection_pool.connection_kwargs.get("db", 0)
    return f"hk:{db}:prt:{party_id}:{name}"


def _chat_key(party_id: int) -> str:
    return f"prt:chat:{party_id}"


def _chat_seq_key(party_id: int) -> str:
    return f"prt:chat:{party_id}:n"


def _chat_gap_key(party_id: int, member_id: int) -> str:
    return f"prt:chat:{party_id}:gap:{member_id}"


def clean_chat(text) -> str:
    """보이지 않는 조절 글자를 빼고 공백을 하나로, CHAT_MAX 자까지 — 빈 글이면 PARTY_CHAT_EMPTY. HTML 은 바꾸지 않는다(화면이 글자로 그린다)."""
    if not isinstance(text, str):
        raise_app_error("PARTY_CHAT_EMPTY")
    s = "".join(" " if (ord(c) < 32 or 127 <= ord(c) < 160 or c in "  ") else c for c in text if ord(c) not in _BIDI)
    s = " ".join(s.split())[:CHAT_MAX].strip()
    if not s:
        raise_app_error("PARTY_CHAT_EMPTY")
    return s


async def _chat_room(db: AsyncSession, member: Member, party_id: int) -> GameParty:
    """채팅할 수 있는 사람인지 — 자리가 없으면 404(남의 판), 초대만 받았거나 거절 · 나간 사람은 403."""
    p = await _get(db, party_id)
    if p.game not in PARTY_GAMES:
        raise_app_error("PARTY_NOT_FOUND", 404)
    s = _seat_of((await _seats(db, [p.id]))[p.id], member.id)
    if s is None:
        raise_app_error("PARTY_NOT_FOUND", 404)
    if s.status not in IN_SEAT:
        raise_app_error("PARTY_CHAT_SEAT", 403)
    return p


def _chat_live(p: GameParty) -> bool:
    return p.status == "OPEN" and (p.deadline_at is None or _aware(p.deadline_at) > now_kst())


def _chat_out(item: dict, member_id: int) -> dict:
    return {"n": int(item.get("n") or 0), "id": item.get("id"), "name": str(item.get("name") or ""), "text": str(item.get("text") or ""),
            "mine": item.get("id") == member_id}


async def chat_list(db: AsyncSession, redis, member: Member, party_id: int) -> dict:
    """대기실 글 목록(오래된 것부터) — {"open": 대기실이 열려 있나, "items": [{n, id, name, text, mine}]}. 대기실이 끝났으면 지우고 빈 목록."""
    p = await _chat_room(db, member, party_id)
    if not _chat_live(p):
        try:
            await redis.delete(_chat_key(p.id), _chat_seq_key(p.id))
        except Exception as exc:  # noqa: BLE001
            logger.warning("party chat %s: clear failed (%s)", p.id, type(exc).__name__)
        return {"open": False, "items": []}
    items = []
    for raw in await redis.lrange(_chat_key(p.id), 0, -1):
        try:
            x = json.loads(raw)
        except (TypeError, ValueError):
            continue
        if isinstance(x, dict):
            items.append(_chat_out(x, member.id))
    return {"open": True, "items": items}


async def chat_send(db: AsyncSession, redis, member: Member, party_id: int, text) -> dict:
    """대기실에 글 하나 — 자리 있는 사람만 · 대기실(OPEN)일 때만 · CHAT_MAX 자로 자름 · 한 사람 CHAT_GAP_MS 에 한 번 · 최근 CHAT_KEEP 개만."""
    ensure_open(grace=True, member=member)
    p = await _chat_room(db, member, party_id)
    if not _chat_live(p):
        raise_app_error("PARTY_NOT_OPEN")
    body = clean_chat(text)
    if not await redis.set(_chat_gap_key(p.id, member.id), "1", px=CHAT_GAP_MS, nx=True):
        raise_app_error("PARTY_CHAT_FAST", 429)
    n = int(await redis.incr(_chat_seq_key(p.id)))
    item = {"n": n, "id": member.id, "name": member.name or "", "text": body}
    raw = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
    async with redis.pipeline(transaction=True) as pipe:
        pipe.rpush(_chat_key(p.id), raw)
        pipe.ltrim(_chat_key(p.id), -CHAT_KEEP, -1)
        pipe.expire(_chat_key(p.id), CHAT_TTL_SEC)
        pipe.expire(_chat_seq_key(p.id), CHAT_TTL_SEC)
        await pipe.execute()
    note = "m" + json.dumps({"t": "chat", "c": item}, ensure_ascii=False, separators=(",", ":"))
    try:  # 대기실 화면들에 바로 — 못 보내도 글은 남아 있어 화면이 다시 읽을 때 나온다
        await redis.publish(rt_channel(redis, p.id, "host"), note)
        await redis.publish(rt_channel(redis, p.id, "all"), note)
    except Exception as exc:  # noqa: BLE001
        logger.warning("party chat %s: publish failed (%s)", p.id, type(exc).__name__)
    return {"item": _chat_out(item, member.id)}


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


# ── 팀 게임(옵트인 갈래) ─────────────────────────────────────────────
# 뿅뿅 달나라 대포 대전(moonshotvs)의 2:2 · 3:3 팀전. 위의 공통 흐름(만들기 · 초대 · 대기실 · 통로 · 채팅 · 기한)은 그대로 쓰고,
# 아래 일곱 자리만 팀 게임일 때 이 절의 함수로 간다(모두 `if p.game in TEAM_GAMES` 안 — 다른 게임은 지나지 않는다):
#   _track(맵 1~6) · start(_start_team) · report(_clean_moon · _team_report) · _judge(_judge_team) · _beaten(_team_beaten)
#   · _bonus_beaten(_team_bonus_beaten) · _payload(_team_payload). 보너스 · 순위는 _winner_ids 로 이긴 팀 사람마다.
#
# 판(state) — 팀 게임만 더 있는 칸
#   lineup: [자리마다 회원 id | None(컴퓨터)] — 자리 번호 k 의 팀 = k & 1(짝 A · 홀 B), 차례 A1 B1 A2 B2 …(엔진이 정함)
#   teamSize: 2 | 3 · teams: [k & 1 …] · botLevel: 컴퓨터 자리 난이도 · seed: 씨앗(서버 난수 32비트 — 주인이 맵을 고르려고 씨앗을 돌리지 못하게)
#   players: lineup 의 사람(자리 순서) · bots: 컴퓨터 자리 번호 · track: 맵 번호(1~6, 출발 때 정함)
#   rep: {str(id): {"winner": 팀 0|1|None, "how", "hash", "turns", "sec", "map", "ver", "at"} | {"void": 1, "at"}}
#   log: 주인이 보낸 행동 줄(다툰 판을 다시 돌려 보려고 — 손님 것은 남기지 않음)
#   final(서로 맞은 결과) · winners: 이긴 팀 사람 id(자리 순서) · losers: 진 팀 사람 id
# 판정: 사람 결과의 과반이 (winner, how, hash, turns, map, ver) 모두 같아야 그 결과(둘이면 둘 다). 「무효」(void)는 어느 결과와도 다른 한 표.
#   이긴 팀에 사람이 있으면 WIN(winner_id = 그중 자리 번호가 가장 낮은 사람 — 목록 표시용), 모두 컴퓨터면 BOT, 비기면 DRAW, 과반이 없으면 MISMATCH.
# 순위: 이긴 팀 사람마다 「진 팀 사람들」을 상대로 1승(같은 사람들과 하루에 여러 번 이겨도 1승). 진 팀이 모두 컴퓨터면 승 없음. 패는 세지 않음.
#   진 팀 사람 가운데 한 명 이상이 같은 결과를 냈을 때만 1승(같은 팀끼리 짜고 거짓 결과로 과반을 만드는 것 막기 — 진 팀 사람이
#   안 보내고 나가면 그 판은 승 없이 끝, 1:1 의 「한쪽만 보냄」과 같은 뜻). 판 기한은 팀전만 MOON_RACE_SEC(차례 상한 × 차례 시간 + 여유).
# 보너스: 이긴 팀 사람마다, 사람 전원이 같은 결과를 보냈을 때만(지금 잣대 그대로).

TEAM_SIZES = (2, 3)  # 2:2(4자리) · 3:3(6자리)
MOON_MAPS = 6  # 엔진 MAP_KEYS(calm · canyon · ice · mushroom · ring · valley) 순서로 1~6
MOON_MIN_SEC = 45  # 출발 뒤 이만큼 지나야 결과를 받는다(1:1 과 같은 값 — 결과만 주고받아 승을 쌓지 못하게, 화면은 받아 줄 때까지 다시 보냄)
MOON_CAP_ROUNDS = 30  # 엔진 TEAM_CAP_ROUNDS — 차례 상한 = 30 × 자리 수
MOON_TURN_SEC = 45  # 한 차례 가장 긴 시간(조준 20초 + 「한 번 더」 12초 + 날기 · 내려앉음 · 주인 벽시계 여유) — 판 기한 셈
MOON_MAX_SEC = MOON_CAP_ROUNDS * 6 * MOON_TURN_SEC  # 결과 sec 상한 8,100초(3:3 상한 180차례 × 45초 = 2시간 15분)
MOON_RACE_SEC = MOON_MAX_SEC + 15 * 60  # 팀전 판 기한(출발 뒤) — sec 상한보다 넉넉히(다른 게임은 RACE_HOURS 1시간 그대로)
MOON_LOG_MAX = 420  # 행동 줄 수 상한(3:3 상한 180차례 + 「한 번 더」 둘째 발 · 이동 중 빠짐 넘김)
MOON_LOG_CHARS = 120_000
MOON_HOW = ("hp", "sea", "more", "both", "cap")
MOON_WIN_HOW = ("hp", "sea", "more")  # 이긴 팀이 있어야 하는 끝(both 는 비김, cap 은 남은 체력 합으로 — 어느 쪽이든)
MOON_KEYS = ("winner", "how", "hash", "turns", "map", "ver")  # 결과가 같아야 하는 칸
BOT_LEVELS = ("easy", "normal", "hard")
_MOON_HASH = _re.compile(r"[0-9a-f]{8}")
_MOON_VER = _re.compile(r"m1-[0-9a-f]{8}")

GAME_REASONS["moonshotvs"] = {
    "WIN": "상대 팀을 모두 쓰러뜨림",
    "BOT": "컴퓨터만 있는 팀이 이김",
    "DRAW": "두 팀이 비김",
    "MISMATCH": "화면끼리 결과가 서로 달라 무효",
}

register_messages({
    "PARTY_BAD_TEAM": "팀을 다시 짜 주세요(2:2 · 3:3 · 대기실에 들어온 사람만 · 사람 2명 이상).",
})


def _is_int(x) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _start_team(p: GameParty, member: Member, joined: set, player_ids, track, team_size, bot_level, lineup) -> None:
    """팀 게임 출발 — lineup(자리마다 회원 id | None) 그대로 자리를 정한다. lineup 이 없으면 들어온 순서대로 A B A B …(빈자리는 컴퓨터)."""
    if not _is_int(team_size) or team_size not in TEAM_SIZES:
        raise_app_error("PARTY_BAD_TEAM")
    n = 2 * team_size
    if lineup is None:
        humans = [member.id]
        for i in player_ids or []:
            try:
                i = int(i)
            except (TypeError, ValueError):
                continue
            if i in joined and i not in humans:
                humans.append(i)
        if len(humans) > n:
            raise_app_error("PARTY_BAD_TEAM")
        seats = humans + [None] * (n - len(humans))
    else:
        if not isinstance(lineup, list) or len(lineup) != n:
            raise_app_error("PARTY_BAD_TEAM")
        seats = []
        for x in lineup:
            if x is None or x == 0:
                seats.append(None)
                continue
            if not _is_int(x) or (x != member.id and x not in joined) or x in seats:
                raise_app_error("PARTY_BAD_TEAM")
            seats.append(x)
        if member.id not in seats:
            raise_app_error("PARTY_BAD_TEAM")
    humans = [x for x in seats if x]
    if len(humans) < 2:
        raise_app_error("PARTY_FEW")
    now = now_kst()
    p.status = "RACING"
    p.started_at = now
    p.deadline_at = now + timedelta(seconds=MOON_RACE_SEC)
    _set_state(p, players=humans, bots=[k for k, x in enumerate(seats) if x is None], lineup=seats, teamSize=team_size,
               teams=[k & 1 for k in range(n)], botLevel=bot_level if bot_level in BOT_LEVELS else "normal",
               seed=_secrets.randbits(32), at=_ms(now), track=_track(p.game, track), rep={})


def _clean_moon(data: dict, cars: int, start_ms: int) -> dict:
    """달나라 대포 팀전 결과 — {"winner": 팀 0|1|None, "how", "hash", "turns", "sec", "map", "ver", "log": [행동 한 줄 …]} 또는 {"op": "void"}.
    행동 줄은 엔진 encodeAct 글자 그대로(versus_moonshotvs.clean_line — 1:1 과 같은 잣대)."""
    if not isinstance(data, dict) or cars not in (4, 6):
        raise_app_error("PARTY_BAD_RESULT")
    if data.get("op") == "void":  # 화면끼리 판이 어긋남 — 어느 결과와도 다른 한 표(과반으로 정함)
        return {"void": 1, "at": _now_ms()}
    if data.get("op", "result") != "result":
        raise_app_error("PARTY_BAD_RESULT")
    winner, how = data.get("winner"), data.get("how")
    if winner is not None and (not _is_int(winner) or winner not in (0, 1)):
        raise_app_error("PARTY_BAD_RESULT")
    if how not in MOON_HOW or (how in MOON_WIN_HOW and winner is None) or (how == "both" and winner is not None):
        raise_app_error("PARTY_BAD_RESULT")
    h, ver = data.get("hash"), data.get("ver")
    if not isinstance(h, str) or not _MOON_HASH.fullmatch(h) or not isinstance(ver, str) or not _MOON_VER.fullmatch(ver):
        raise_app_error("PARTY_BAD_RESULT")
    turns, mp, sec = data.get("turns"), data.get("map"), data.get("sec")
    if not _is_int(turns) or not 1 <= turns <= MOON_CAP_ROUNDS * cars or not _is_int(mp) or not 1 <= mp <= MOON_MAPS:
        raise_app_error("PARTY_BAD_RESULT")
    if isinstance(sec, bool) or not isinstance(sec, (int, float)) or sec != sec or not 0 <= sec <= MOON_MAX_SEC:
        raise_app_error("PARTY_BAD_RESULT")
    log = data.get("log")
    if not isinstance(log, list) or len(log) > MOON_LOG_MAX or not turns - cars - 2 <= len(log) <= turns + 2 * cars + 4:
        raise_app_error("PARTY_BAD_RESULT")
    if sum(len(x) if isinstance(x, str) else MOON_LOG_CHARS + 1 for x in log) > MOON_LOG_CHARS or any(_moon_line(x) is None for x in log):
        raise_app_error("PARTY_BAD_RESULT")
    if _now_ms() - start_ms < MOON_MIN_SEC * 1000:
        raise_app_error("PARTY_TOO_SOON")
    return {"winner": winner, "how": how, "hash": h, "turns": turns, "sec": round(float(sec), 1), "map": mp, "ver": ver,
            "log": list(log), "at": _now_ms()}


def _team_report(st: dict, p: GameParty, member: Member, got: dict) -> dict:
    """맵이 출발 때와 같은지 보고, 행동 줄은 주인 것만 판에 남긴다(rep 에는 넣지 않음)."""
    log = got.pop("log", None)
    if got.get("void"):
        return got
    if got.get("map") != int(st.get("track") or 0):
        raise_app_error("PARTY_BAD_RESULT")
    if member.id == p.host_id and log is not None:
        st["log"] = log
    return got


def _moon_key(r: dict) -> tuple:
    return ("void",) if r.get("void") else tuple(r.get(k) for k in MOON_KEYS)


def _judge_team(p: GameParty) -> None:
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
    top, n = Counter(_moon_key(r) for r in reps).most_common(1)[0]
    need = len(players) // 2 + 1 if len(players) > 2 else 2  # 둘이면 둘 다 같아야
    if n < need or top == ("void",):
        p.end_reason = "MISMATCH"
        return
    base = next(r for r in reps if _moon_key(r) == top)
    final = {k: base.get(k) for k in MOON_KEYS}
    final["sec"] = base.get("sec")
    final["log"] = list(st.get("log") or [])
    lineup = list(st.get("lineup") or [])
    winner = base.get("winner")
    winners = [int(x) for k, x in enumerate(lineup) if x and winner is not None and (k & 1) == winner]
    losers = [int(x) for k, x in enumerate(lineup) if x and winner is not None and (k & 1) != winner]
    st["final"] = final
    st["agreed"] = [i for i in players if str(i) in rep and _moon_key(rep[str(i)]) == top]
    st["winners"], st["losers"] = winners, losers
    p.state = st
    if winner is None:
        p.end_reason = "DRAW"
    elif winners:
        p.winner_id = winners[0]
        p.end_reason = "WIN"
    else:
        p.end_reason = "BOT"


def _team_beaten(p: GameParty) -> tuple:
    """이긴 팀 사람들이 이긴 「진 팀 사람들」 — 진 팀이 모두 컴퓨터거나 사람이 이긴 판이 아니면 빈 튜플.

    짜고 치기 막기: 진 팀 사람 가운데 한 명 이상이 같은 결과(agreed)를 냈을 때만 1승. 같은 팀 둘이 같은 거짓 결과로
    과반을 만들어도, 진 팀 누구도 그 결과를 내지 않았으면(다른 결과 · 무효 · 안 보내고 나감) 승은 없다(판정 · 도장은 그대로).
    """
    if p.status != "DONE" or p.end_reason != "WIN":
        return ()
    st = p.state or {}
    win = {int(x) for x in st.get("winners") or []}
    losers = tuple(sorted(int(x) for x in st.get("losers") or [] if int(x) not in win))
    agreed = {int(x) for x in st.get("agreed") or []}
    if not any(x in agreed for x in losers):
        return ()
    return losers


def _team_bonus_beaten(p: GameParty, beaten: tuple) -> tuple:
    st = p.state or {}
    players = [int(x) for x in st.get("players") or []]
    agreed = {int(x) for x in st.get("agreed") or []}
    if len(set(players)) != len(players) or set(players) != agreed:
        return ()
    return beaten


def _winner_ids(p: GameParty) -> list:
    """순위 · 보너스를 받을 사람 — 팀 게임은 이긴 팀 사람 모두, 그 밖은 1등 한 명(winner_id)."""
    if p.game in TEAM_GAMES:
        return [int(x) for x in (p.state or {}).get("winners") or []] if p.end_reason == "WIN" else []
    return [p.winner_id] if p.winner_id else []


def _team_payload(p: GameParty, out: dict, people: dict, member_id: int) -> None:
    st = p.state or {}
    lineup = list(st.get("lineup") or [])
    out["teamGame"] = True
    out["teamSize"] = st.get("teamSize")
    out["botLevel"] = st.get("botLevel")
    out["lineup"] = [
        {**_person(people.get(x)), "seat": k, "team": k & 1, "bot": False} if x else
        {"id": None, "name": "컴퓨터", "department": "", "avatarUrl": None, "seat": k, "team": k & 1, "bot": True}
        for k, x in enumerate(lineup)
    ]
    out["mySeatNo"] = lineup.index(member_id) if member_id in lineup else None
    if out["mySeatNo"] is not None and p.status in ("RACING", "DONE"):
        out["seed"] = st.get("seed")  # 판에 선 사람만 — 모든 화면이 같은 판을 차린다
    if p.status == "DONE":
        final = st.get("final")
        out["final"] = {k: v for k, v in final.items() if k != "log"} if isinstance(final, dict) else None
        out["winners"] = [int(x) for x in st.get("winners") or []]
        out["losers"] = [int(x) for x in st.get("losers") or []]
        out["winTeam"] = final.get("winner") if isinstance(final, dict) else None
        if p.end_reason in ("MISMATCH", "NO_REPORT"):
            out["result"] = "none"
        elif p.end_reason == "DRAW":
            out["result"] = "draw"
        else:
            out["result"] = "win" if member_id in out["winners"] else "lose"
        out["countsWin"] = bool(_team_beaten(p))  # 이긴 팀 사람에게 1승이 생긴 판인지(진 팀에 사람이 있었나)
