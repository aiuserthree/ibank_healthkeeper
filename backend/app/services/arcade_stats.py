"""관리자 「아케이드 이용현황」 — 기간 안에 누가 · 언제 · 어떤 게임을 얼마나 했는지.

판은 모두 「끝까지 한 판」만 센다.
  혼자 하는 게임  game_play(점수를 남긴 판 — 오늘의 도전 게임은 그날 첫 판만 남는다)
  대전           game_match 가 끝났고(DONE) 도장 · 순위에 드는 판(바로 기권 · 받기 전 만료 빼고) — 한 판 = 1, 두 사람 모두 참여
  협동           escape_room 이 끝난 판(탈출 · 시간 끝) — 중간에 나가거나 포기한 판은 뺀다. 한 판 = 1, 두 사람 모두 참여
날짜 · 시각은 한국 시각. 대전 · 협동은 끝난 시각으로 센다.
참여 인원 · 한 날은 위 판에 더해 그날 도장을 받은 사람도 센다 — 오늘의 도전 게임의 두 번째 판부터(연습)는 점수가 남지 않지만 끝까지 하면 도장은 찍힌다.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import KST, today_kst
from app.models import ArcadeStamp, Coupon, CouponSource, EscapeRoom, GameMatch, GamePlay, Member
from app.models.coupon import CouponStatus
from app.models.enums import MemberStatus
from app.services import match as match_service
from app.services.escape import ALL_ROOMS
from app.services.game import GAMES

MAX_DAYS = 400  # 한 번에 볼 수 있는 기간
COOP_SKIP_ENDS = ("GIVEUP", "LEFT")  # 중간에 그만둔 협동 판


def _kst(dt: datetime) -> datetime:
    return dt.astimezone(KST)


def _kind(key: str) -> str:
    if key in match_service.MATCH_GAMES:
        return "versus"
    if key in COOP_KEYS:
        return "coop"
    return "solo"


COOP_KEYS = frozenset(r.page for r in ALL_ROOMS.values())


async def admin_arcade_stats(db: AsyncSession, start: date | None, end: date | None) -> dict:
    end = end or today_kst()
    start = start or end - timedelta(days=29)
    if start > end:
        start, end = end, start
    if (end - start).days + 1 > MAX_DAYS:
        start = end - timedelta(days=MAX_DAYS - 1)
    t0 = datetime.combine(start, time.min, tzinfo=KST)
    t1 = datetime.combine(end + timedelta(days=1), time.min, tzinfo=KST)

    # 판 하나 = (게임, 날짜, 시각(시), 참여한 사람들)
    plays: list[tuple[str, date, int, tuple[int, ...]]] = []

    solo = (
        await db.execute(
            select(GamePlay.member_id, GamePlay.game, GamePlay.played_on, GamePlay.played_at).where(
                GamePlay.played_on >= start, GamePlay.played_on <= end
            )
        )
    ).all()
    for mid, game, day, at in solo:
        plays.append((game, day, _kst(at).hour if at else 12, (mid,)))

    matches = (
        await db.execute(
            select(GameMatch).where(GameMatch.status == "DONE", GameMatch.finished_at >= t0, GameMatch.finished_at < t1)
        )
    ).scalars().all()
    for m in matches:
        if not match_service._counts(m):
            continue
        who = tuple(x for x in (m.challenger_id, None if m.bot else m.opponent_id) if x)
        at = _kst(m.finished_at)
        plays.append((m.game, at.date(), at.hour, who))

    rooms = (
        await db.execute(
            select(EscapeRoom).where(
                EscapeRoom.status.in_(("CLEAR", "FAILED")), EscapeRoom.finished_at >= t0, EscapeRoom.finished_at < t1
            )
        )
    ).scalars().all()
    for r in rooms:
        if (r.state or {}).get("end") in COOP_SKIP_ENDS:
            continue
        room = ALL_ROOMS.get(r.room)
        at = _kst(r.finished_at)
        plays.append((room.page if room else r.room, at.date(), at.hour, (r.host_id, r.guest_id)))

    stamps = (
        await db.execute(
            select(ArcadeStamp.member_id, ArcadeStamp.stamp_date, ArcadeStamp.game).where(
                ArcadeStamp.stamp_date >= start, ArcadeStamp.stamp_date <= end
            )
        )
    ).all()
    coupons = (
        await db.execute(
            select(Coupon.member_id, Coupon.issued_at, Coupon.status, Coupon.used_at).where(
                Coupon.source == CouponSource.ARCADE,
                Coupon.issued_at >= t0,
                Coupon.issued_at < t1,
            )
        )
    ).all()
    used_in_range = (
        await db.execute(
            select(Coupon.id).where(
                and_(Coupon.source == CouponSource.ARCADE, Coupon.status == CouponStatus.USED, Coupon.used_at >= t0, Coupon.used_at < t1)
            )
        )
    ).all()

    members = {m.id: m for m in (await db.execute(select(Member))).scalars().all()}
    active_ids = {mid for mid, m in members.items() if m.status == MemberStatus.ACTIVE}

    # ── 모으기
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    day_members: dict[date, set[int]] = defaultdict(set)
    day_kind: dict[date, Counter] = defaultdict(Counter)
    hours = [0] * 24
    weekdays = [0] * 7
    game_plays: Counter = Counter()
    game_members: dict[str, set[int]] = defaultdict(set)
    person_plays: Counter = Counter()
    person_days: dict[int, set[date]] = defaultdict(set)
    person_games: dict[int, Counter] = defaultdict(Counter)
    person_game_last: dict[int, dict[str, date]] = defaultdict(dict)
    kind_plays: Counter = Counter()
    for game, day, hour, who in plays:
        kind = _kind(game)
        kind_plays[kind] += 1
        day_kind[day][kind] += 1
        hours[hour] += 1
        weekdays[day.weekday()] += 1
        game_plays[game] += 1
        for mid in who:
            day_members[day].add(mid)
            game_members[game].add(mid)
            person_plays[mid] += 1
            person_days[mid].add(day)
            person_games[mid][game] += 1
            if day > person_game_last[mid].get(game, date.min):
                person_game_last[mid][game] = day

    # 도장 — 점수가 남지 않은 연습 판으로 받은 날도 참여로 센다
    # 한 사람의 게임 목록에는 연습 판으로 도장만 받은 게임도 0판으로 넣는다
    person_game_stamps: dict[int, Counter] = defaultdict(Counter)
    for mid, day, game in stamps:
        day_members[day].add(mid)
        person_days[mid].add(day)
        person_game_stamps[mid][game] += 1
        if day > person_game_last[mid].get(game, date.min):
            person_game_last[mid][game] = day
    players = set(person_days)
    stamp_by_member = Counter(mid for mid, _, _ in stamps)

    def title(key: str) -> str:
        if key in GAMES:
            return GAMES[key].title
        room = next((r for r in ALL_ROOMS.values() if r.page == key), None)
        return room.title if room else key

    # 게임 — 기간에 판이 없던 게임도 0 으로 보여 준다(아무도 안 하는 게임 찾기)
    game_rows = [
        {
            "key": k,
            "title": title(k),
            "kind": _kind(k),
            "plays": game_plays.get(k, 0),
            "members": len(game_members.get(k, ())),
        }
        for k in sorted(set(GAMES) | set(game_plays))
    ]
    game_rows.sort(key=lambda g: (-g["plays"], -g["members"], g["title"]))

    # 부서 — 지금 회원(ACTIVE) 기준 인원 중 기간에 한 판이라도 한 사람. 회원이 한 명뿐인 부서는 넣지 않는다(참여율이 0 · 100% 뿐이라)
    dept_total: Counter = Counter()
    dept_active: Counter = Counter()
    dept_plays: Counter = Counter()
    for mid in active_ids:
        dept_total[members[mid].department or "(부서 없음)"] += 1
    for mid in players:
        m = members.get(mid)
        if not m:
            continue
        d = m.department or "(부서 없음)"
        dept_active[d] += 1
        dept_plays[d] += person_plays[mid]
    dept_rows = [
        {"name": d, "total": dept_total.get(d, 0), "active": dept_active.get(d, 0), "plays": dept_plays.get(d, 0)}
        for d in set(dept_total) | set(dept_active)
        if dept_total.get(d, 0) >= 2
    ]
    dept_rows.sort(key=lambda r: (-(r["active"] / r["total"] if r["total"] else 0), -r["plays"], r["name"]))

    people = []
    for mid in players:
        m = members.get(mid)
        if not m:
            continue
        fav, fav_n = person_games[mid].most_common(1)[0] if person_games[mid] else ("", 0)
        if not fav and person_game_stamps[mid]:
            fav = person_game_stamps[mid].most_common(1)[0][0]
        # 이 사람이 기간에 한 게임 전부 — 판 많은 순
        games = [
            {
                "key": k,
                "title": title(k),
                "kind": _kind(k),
                "plays": person_games[mid].get(k, 0),
                "stamps": person_game_stamps[mid].get(k, 0),
                "last": person_game_last[mid][k].isoformat(),
            }
            for k in set(person_games[mid]) | set(person_game_stamps[mid])
        ]
        games.sort(key=lambda g: (-g["plays"], -g["stamps"], g["title"]))
        people.append(
            {
                "id": mid,
                "name": m.name,
                "department": m.department,
                "position": m.position,
                "plays": person_plays[mid],
                "days": len(person_days[mid]),
                "stamps": stamp_by_member.get(mid, 0),
                "favorite": title(fav) if fav else "",
                "favoritePlays": fav_n,
                "last": max(person_days[mid]).isoformat(),
                "games": games,
            }
        )
    people.sort(key=lambda p: (-p["plays"], -p["days"], p["name"]))

    daily = [
        {
            "date": d.isoformat(),
            "members": len(day_members.get(d, ())),
            "solo": day_kind[d]["solo"] if d in day_kind else 0,
            "versus": day_kind[d]["versus"] if d in day_kind else 0,
            "coop": day_kind[d]["coop"] if d in day_kind else 0,
        }
        for d in days
    ]
    total = sum(kind_plays.values())
    return {
        "range": {"start": start.isoformat(), "end": end.isoformat(), "days": len(days)},
        "summary": {
            "players": len(players),
            "activeMembers": len(active_ids),
            "plays": total,
            "solo": kind_plays["solo"],
            "versus": kind_plays["versus"],
            "coop": kind_plays["coop"],
            "avgDailyPlayers": round(sum(len(v) for v in day_members.values()) / len(days), 1) if days else 0,
            "peakDay": max(daily, key=lambda r: r["members"])["date"] if total else None,
            "stamps": len(stamps),
            "stampMembers": len(stamp_by_member),
            "couponsIssued": len(coupons),
            "couponsUsed": len(used_in_range),
        },
        "daily": daily,
        "hours": hours,
        "weekdays": weekdays,
        "games": game_rows,
        "departments": dept_rows,
        "people": people,
    }
