"""메인(서비스 소개) 재미 요소 — 누적 이용 통계 · 최다 이용자 랭킹."""
from __future__ import annotations

import re
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import now_kst
from app.models import LegacyUsage, Member, MemberStatus, Reservation, ReservationStatus, Slot

CACHE_TTL_SECONDS = 60
RANKING_SIZE = 10
_WEEKDAY_KO = ("월", "화", "수", "목", "금", "토", "일")


@dataclass
class _Usage:
    key: str
    usage_date: date
    start: str


@dataclass
class _Snapshot:
    computed_at: float
    today: date
    usages: list[_Usage]
    # 랭킹 대상(탈퇴 제외 회원) — 사람 키 → (member_id, 이름)
    members_by_key: dict[str, tuple[int, str]] = field(default_factory=dict)


_cache: _Snapshot | None = None


def _norm_name(name: str) -> str:
    return re.sub(r"\s+", "", (name or "").strip())


def _email_local(email: str) -> str:
    return email.split("@", 1)[0].lower()


def mask_name(name: str) -> str:
    """홍길동 → 홍*동, 홍길 → 홍*, 남궁민수 → 남**수."""
    name = (name or "").strip()
    if len(name) <= 1:
        return name
    if len(name) == 2:
        return name[0] + "*"
    return name[0] + "*" * (len(name) - 2) + name[-1]


def _person_key_for_legacy(
    email: str | None,
    name: str,
    *,
    by_email: dict[str, str],
    by_local: dict[str, str | None],
    by_name: dict[str, str | None],
) -> str:
    """과거 스케줄 행 → 사람 키. 회원과 매칭되면 회원 이메일, 아니면 이메일/이름."""
    if email:
        email = email.strip().lower()
        if email in by_email:
            return by_email[email]
        matched = by_local.get(_email_local(email))
        if matched:
            return matched
        return email
    matched = by_name.get(_norm_name(name))
    if matched:
        return matched
    return "name:" + _norm_name(name)


async def _build_snapshot(db: AsyncSession) -> _Snapshot:
    now = now_kst()
    today = now.date()
    now_hm = now.strftime("%H:%M")

    member_rows = (
        await db.execute(select(Member.id, Member.email, Member.name, Member.status))
    ).all()
    by_email: dict[str, str] = {}
    by_local: dict[str, str | None] = {}
    by_name: dict[str, str | None] = {}
    members_by_key: dict[str, tuple[int, str]] = {}
    for member_id, email, name, status in member_rows:
        if status == MemberStatus.WITHDRAWN:
            continue
        key = email.strip().lower()
        by_email[key] = key
        local = _email_local(key)
        by_local[local] = None if local in by_local else key
        norm = _norm_name(name)
        if norm:
            by_name[norm] = None if norm in by_name else key
        members_by_key[key] = (member_id, name)

    seen: set[tuple[str, date, str]] = set()
    usages: list[_Usage] = []

    def add(key: str, usage_date: date, start: str) -> None:
        if usage_date == today and start and start > now_hm:
            return
        ident = (key, usage_date, start)
        if ident in seen:
            return
        seen.add(ident)
        usages.append(_Usage(key=key, usage_date=usage_date, start=start))

    legacy_rows = await db.execute(
        select(
            LegacyUsage.email,
            LegacyUsage.name,
            LegacyUsage.usage_date,
            LegacyUsage.usage_start_time,
        ).where(LegacyUsage.usage_date <= today)
    )
    for email, name, usage_date, start_time in legacy_rows.all():
        key = _person_key_for_legacy(
            email, name, by_email=by_email, by_local=by_local, by_name=by_name
        )
        add(key, usage_date, start_time or "")

    site_rows = await db.execute(
        select(Member.email, Slot.slot_date, Slot.start_time)
        .join(Reservation, Reservation.slot_id == Slot.id)
        .join(Member, Member.id == Reservation.member_id)
        .where(Reservation.status == ReservationStatus.CONFIRMED)
        .where(Slot.slot_date <= today)
    )
    for email, slot_date, start_time in site_rows.all():
        add(email.strip().lower(), slot_date, start_time.strftime("%H:%M"))

    return _Snapshot(
        computed_at=time.monotonic(),
        today=today,
        usages=usages,
        members_by_key=members_by_key,
    )


async def _get_snapshot(db: AsyncSession) -> _Snapshot:
    global _cache
    if (
        _cache is not None
        and time.monotonic() - _cache.computed_at < CACHE_TTL_SECONDS
        and _cache.today == now_kst().date()
    ):
        return _cache
    _cache = await _build_snapshot(db)
    return _cache


def _ranking(
    snap: _Snapshot,
    usages: list[_Usage],
    me_key: str | None,
) -> tuple[list[dict], dict | None]:
    """회원(탈퇴 제외) 이용 횟수 순위. 동률은 같은 순위, 표시 순서는 먼저 달성한 사람 우선."""
    counts: Counter[str] = Counter()
    reached_at: dict[str, date] = {}
    for u in usages:
        if u.key not in snap.members_by_key:
            continue
        counts[u.key] += 1
        if u.key not in reached_at or u.usage_date > reached_at[u.key]:
            reached_at[u.key] = u.usage_date

    ordered = sorted(counts, key=lambda k: (-counts[k], reached_at[k], k))
    ranks: dict[str, int] = {}
    prev_count = None
    for idx, key in enumerate(ordered, start=1):
        if counts[key] != prev_count:
            rank = idx
            prev_count = counts[key]
        ranks[key] = rank

    top = [
        {
            "rank": ranks[key],
            "name": snap.members_by_key[key][1] if key == me_key else mask_name(snap.members_by_key[key][1]),
            "uses": counts[key],
            "isMe": key == me_key,
        }
        for key in ordered[:RANKING_SIZE]
    ]
    me = None
    if me_key is not None:
        me = {
            "uses": counts.get(me_key, 0),
            "rank": ranks.get(me_key),
            "participants": len(ordered),
        }
    return top, me


def _peak(counter: Counter, label) -> dict | None:
    if not counter:
        return None
    value, uses = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[0]
    return {"label": label(value), "uses": uses}


async def get_fun_stats(db: AsyncSession, member: Member | None) -> dict:
    snap = await _get_snapshot(db)
    today = snap.today
    year_usages = [u for u in snap.usages if u.usage_date.year == today.year]
    month_usages = [u for u in year_usages if u.usage_date.month == today.month]

    data: dict = {
        "year": today.year,
        "month": today.month,
        "totalUses": len(snap.usages),
        "totalUsers": len({u.key for u in snap.usages}),
        "yearUses": len(year_usages),
        "monthUses": len(month_usages),
        "peakTime": _peak(Counter(u.start for u in snap.usages if u.start), lambda v: v),
        "peakWeekday": _peak(
            Counter(u.usage_date.weekday() for u in snap.usages if u.usage_date.weekday() < 5),
            lambda v: _WEEKDAY_KO[v],
        ),
        "ranking": None,
        "me": None,
    }

    # 이름이 포함된 랭킹은 로그인한 회원에게만 노출한다.
    if member is not None:
        me_key = member.email.strip().lower()
        year_top, year_me = _ranking(snap, year_usages, me_key)
        data["ranking"] = {"year": {"top": year_top, "me": year_me}}
        my_dates = [u.usage_date for u in snap.usages if u.key == me_key]
        last_used = max(my_dates) if my_dates else None
        data["me"] = {
            "totalUses": len(my_dates),
            "lastUsedDate": last_used.isoformat() if last_used else None,
            "daysSinceLastUse": (today - last_used).days if last_used else None,
        }
    return data
