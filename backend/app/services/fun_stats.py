"""메인(서비스 소개) 재미 요소 — 누적 이용 통계 · 꿀타임 히트맵 · 부서 대항전."""
from __future__ import annotations

import re
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import now_kst
from app.models import (
    LegacyUsage,
    Member,
    MemberStatus,
    Reservation,
    ReservationStatus,
    ReservationType,
    Slot,
)

CACHE_TTL_SECONDS = 60
DEPARTMENT_RANKING_SIZE = 8
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
    # 집계 대상(탈퇴 제외 회원) — 사람 키 → 부서(없으면 "")
    departments_by_key: dict[str, str] = field(default_factory=dict)
    heatmap: dict | None = None


_cache: _Snapshot | None = None


def _norm_name(name: str) -> str:
    return re.sub(r"\s+", "", (name or "").strip())


def _email_local(email: str) -> str:
    return email.split("@", 1)[0].lower()


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
        await db.execute(select(Member.email, Member.name, Member.department, Member.status))
    ).all()
    by_email: dict[str, str] = {}
    by_local: dict[str, str | None] = {}
    by_name: dict[str, str | None] = {}
    departments_by_key: dict[str, str] = {}
    for email, name, department, status in member_rows:
        if status == MemberStatus.WITHDRAWN:
            continue
        key = email.strip().lower()
        by_email[key] = key
        local = _email_local(key)
        by_local[local] = None if local in by_local else key
        norm = _norm_name(name)
        if norm:
            by_name[norm] = None if norm in by_name else key
        departments_by_key[key] = (department or "").strip()

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
        departments_by_key=departments_by_key,
        heatmap=await _build_heatmap(db, today),
    )


async def _build_heatmap(db: AsyncSession, today: date) -> dict | None:
    """요일×타임별 슬롯당 평균 신청 인원 — 신청이 덜 몰리는 '꿀타임' 안내용."""
    slot_rows = (
        await db.execute(
            select(Slot.id, Slot.slot_date, Slot.time_index, Slot.start_time)
            .where(Slot.slot_date <= today)
            .where(Slot.is_vacation.is_(False))
        )
    ).all()
    apply_rows = (
        await db.execute(
            select(Reservation.slot_id, func.count(Reservation.id))
            .where(Reservation.type == ReservationType.NORMAL)
            .where(Reservation.status != ReservationStatus.CANCELLED)
            .group_by(Reservation.slot_id)
        )
    ).all()
    applies = {slot_id: count for slot_id, count in apply_rows}
    applied_dates = [d for slot_id, d, _, _ in slot_rows if slot_id in applies]
    if not applied_dates:
        return None
    # 사이트 신청을 받기 전 슬롯은 0건으로 평균을 끌어내리므로 제외한다.
    since = min(applied_dates)

    slots: Counter[tuple[int, int]] = Counter()
    totals: Counter[tuple[int, int]] = Counter()
    labels: dict[int, Counter[str]] = {}
    for slot_id, slot_date, time_index, start_time in slot_rows:
        weekday = slot_date.weekday()
        if slot_date < since or weekday > 4:
            continue
        slots[(weekday, time_index)] += 1
        totals[(weekday, time_index)] += applies.get(slot_id, 0)
        labels.setdefault(time_index, Counter())[start_time.strftime("%H:%M")] += 1

    per_index = Counter()
    for (_, time_index), count in slots.items():
        per_index[time_index] += count
    if not per_index:
        return None
    # 테스트로 만든 임시 타임 등 표본이 거의 없는 타임은 뺀다.
    floor = max(per_index.values()) * 0.2
    indexes = sorted(i for i, count in per_index.items() if count >= floor)

    cells: list[list[float | None]] = []
    flat: list[tuple[float, int, int]] = []
    for weekday in range(5):
        row: list[float | None] = []
        for col, time_index in enumerate(indexes):
            n = slots.get((weekday, time_index), 0)
            avg = round(totals[(weekday, time_index)] / n, 1) if n else None
            row.append(avg)
            if avg is not None:
                flat.append((avg, weekday, col))
        cells.append(row)
    if not flat:
        return None

    times = [labels[i].most_common(1)[0][0] for i in indexes]

    def pick(item: tuple[float, int, int]) -> dict:
        avg, weekday, col = item
        return {"day": _WEEKDAY_KO[weekday], "time": times[col], "avg": avg}

    return {
        "days": list(_WEEKDAY_KO[:5]),
        "times": times,
        "cells": cells,
        "calm": pick(min(flat)),
        "busy": pick(max(flat, key=lambda f: (f[0], -f[1], -f[2]))),
    }


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


def _top_percent(snap: _Snapshot, usages: list[_Usage], me_key: str) -> int | None:
    """이용 회원 중 내 위치(상위 N%). 이름·횟수 등 다른 사람 정보는 내보내지 않는다."""
    counts: Counter[str] = Counter(u.key for u in usages if u.key in snap.departments_by_key)
    mine = counts.get(me_key, 0)
    if not mine:
        return None
    rank = 1 + sum(1 for c in counts.values() if c > mine)
    return max(1, -(-rank * 100 // len(counts)))


def _departments(snap: _Snapshot, usages: list[_Usage], me_key: str) -> dict:
    """부서별 이용 횟수 순위. 동률은 같은 순위."""
    uses: Counter[str] = Counter()
    for u in usages:
        dept = snap.departments_by_key.get(u.key)
        if not dept:
            continue
        uses[dept] += 1

    my_dept = snap.departments_by_key.get(me_key) or None
    ordered = sorted(uses, key=lambda d: (-uses[d], d))
    rows: list[dict] = []
    prev_count = None
    rank = 0
    for idx, dept in enumerate(ordered, start=1):
        if uses[dept] != prev_count:
            rank = idx
            prev_count = uses[dept]
        rows.append(
            {
                "rank": rank,
                "name": dept,
                "uses": uses[dept],
                "isMine": dept == my_dept,
            }
        )
    return {
        "top": rows[:DEPARTMENT_RANKING_SIZE],
        "mine": next((r for r in rows if r["isMine"]), None),
        "myDepartment": my_dept,
        "total": len(rows),
    }


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
        "heatmap": snap.heatmap,
        "departments": None,
        "me": None,
    }

    # 부서명이 포함된 순위와 내 기록은 로그인한 회원에게만 노출한다.
    if member is not None:
        me_key = member.email.strip().lower()
        data["departments"] = _departments(snap, year_usages, me_key)
        my_dates = [u.usage_date for u in snap.usages if u.key == me_key]
        last_used = max(my_dates) if my_dates else None
        data["me"] = {
            "totalUses": len(my_dates),
            "lastUsedDate": last_used.isoformat() if last_used else None,
            "daysSinceLastUse": (today - last_used).days if last_used else None,
            "yearTopPercent": _top_percent(snap, year_usages, me_key),
        }
    return data
