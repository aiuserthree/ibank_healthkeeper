"""회원 휴가 — 휴가 · 반차 · 반반차 · 특별휴가인 사람은 쉬는 시간대에 업무 시간이어도 아케이드가 열린다.

- 그룹웨어는 헬스키퍼 서버에서 닿지 않아, 사내망 맥의 scripts/gw-leave-sync.py 가 읽어 /api/internal/leave-sync 로 보낸다.
  받을 때 from~to 날짜의 그룹웨어 줄을 통째로 바꿔 넣는다(여러 번 보내도 같은 결과). 30일 지난 줄은 그때 지운다.
- 열림 판단(game.play_window)은 매 요청 DB 를 보지 않는다 — 일꾼마다 어제 · 오늘 · 내일 휴가를 메모리에 들고 있고,
  1분마다(스케줄러) · 서버가 뜰 때 · 휴가를 받은 직후 다시 읽는다.
- 메일 같은 개인정보는 로그에 남기지 않는다.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, Optional, Sequence

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import format_kst_iso, now_kst, today_kst
from app.models import Member, MemberStatus
from app.models.leave import MemberLeave

logger = logging.getLogger(__name__)

DAY_END = 24 * 60
KINDS = ("VACATION", "HALF", "QUARTER", "SPECIAL")
KIND_LABEL = {"VACATION": "휴가", "HALF": "반차", "QUARTER": "반반차", "SPECIAL": "특별휴가"}
KEEP_DAYS = 30  # 받을 때 이보다 오래된 줄은 지운다
SOURCE_GW = "GW"
LAST_SYNC_KEY = "hk:leave:last_sync"  # 마지막으로 받은 시각 · 건수 (Redis, 만료 없음)

# 한 사람의 그날 쉬는 시간대 — (시작 분, 끝 분, 종류). 끝 1440 = 24:00
Window = tuple


# ── 순수 함수 ─────────────────────────────────────────────────

def parse_hhmm(text: str, allow_24: bool = False) -> int:
    """「HH:MM」 → 0시부터 센 분. 24:00 은 allow_24 일 때만(끝 시각)."""
    if not isinstance(text, str) or len(text) != 5 or text[2] != ":" or not (text[:2] + text[3:]).isdigit():
        raise ValueError("HH:MM 모양이 아니에요")
    h, m = int(text[:2]), int(text[3:])
    if m >= 60 or h > 24 or (h == 24 and (m or not allow_24)):
        raise ValueError("없는 시각이에요")
    return h * 60 + m


def hhmm(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def leave_label(kind: str, start: int, end: int) -> str:
    """화면에 보일 이름 — 반차는 오전 · 오후를 붙인다."""
    if kind == "HALF":
        return "오전 반차" if start == 0 else "오후 반차" if end == DAY_END else "반차"
    return KIND_LABEL.get(kind, "휴가")


def leave_at(minute: int, windows: Sequence[Window]) -> Optional[Window]:
    """그 분이 쉬는 시간대 안이면 그 시간대(여럿이면 가장 늦게 끝나는 것)."""
    hits = [w for w in windows if w[0] <= minute < w[1]]
    return max(hits, key=lambda w: w[1]) if hits else None


@dataclass(frozen=True)
class PlannedRow:
    member_id: int
    day: date
    start_min: int
    end_min: int
    kind: str
    doc: Optional[str]


def plan_rows(items: Iterable, member_by_email: dict) -> tuple:
    """받은 줄 → 넣을 줄 · 회원을 못 찾은 줄 수. items 는 email · day · start · end · kind · doc 를 가진 것.

    같은 회원 · 같은 날 · 같은 시간대 · 같은 종류는 한 줄로 합친다."""
    rows: list = []
    seen: set = set()
    unmatched = 0
    for it in items:
        member_id = member_by_email.get((it.email or "").strip().lower())
        if member_id is None:
            unmatched += 1
            continue
        start, end = parse_hhmm(it.start), parse_hhmm(it.end, allow_24=True)
        key = (member_id, it.day, start, end, it.kind)
        if key in seen:
            continue
        seen.add(key)
        rows.append(PlannedRow(member_id, it.day, start, end, it.kind, (it.doc or None)))
    return rows, unmatched


def group_windows(rows: Iterable) -> dict:
    """(member_id, day, start, end, kind) 줄들 → {day: {member_id: (시간대, …)}}."""
    out: dict = {}
    for member_id, day, start, end, kind in rows:
        out.setdefault(day, {}).setdefault(member_id, []).append((int(start), int(end), kind))
    return {d: {m: tuple(sorted(ws)) for m, ws in by.items()} for d, by in out.items()}


# ── 메모리 캐시 (일꾼마다) ─────────────────────────────────────

_cache: dict = {}  # {day: {member_id: (시간대, …)}}


def windows_for(member, day: date) -> tuple:
    """그 회원의 그날 쉬는 시간대 — 캐시만 본다(동기 · DB 없음). member 는 Member 또는 회원 번호."""
    if member is None:
        return ()
    member_id = getattr(member, "id", member)
    return _cache.get(day, {}).get(member_id, ())


def set_cache(data: dict) -> None:
    """시험 · 새로 읽기에서 캐시를 통째로 바꾼다."""
    global _cache
    _cache = data


async def refresh_cache(db: AsyncSession) -> int:
    """어제 · 오늘 · 내일 휴가를 다시 읽는다(1분마다 · 서버 시작 · 받은 직후). 읽은 줄 수."""
    today = today_kst()
    rows = (
        await db.execute(
            select(MemberLeave.member_id, MemberLeave.day, MemberLeave.start_min, MemberLeave.end_min, MemberLeave.kind).where(
                MemberLeave.day.between(today - timedelta(days=1), today + timedelta(days=1))
            )
        )
    ).all()
    set_cache(group_windows(rows))
    return len(rows)


async def job_refresh_cache(db: AsyncSession) -> None:
    try:
        await refresh_cache(db)
    except Exception as exc:  # noqa: BLE001 — 못 읽으면 앞서 읽은 것을 그대로 쓴다
        logger.warning("leave cache refresh failed (%s)", type(exc).__name__)


# ── 받기 ──────────────────────────────────────────────────────

async def member_ids_by_email(db: AsyncSession, emails: set) -> dict:
    """회사 메일(소문자) → 회원 번호. 지금 쓰는 회원(ACTIVE)만."""
    if not emails:
        return {}
    rows = (
        await db.execute(
            select(func.lower(Member.email), Member.id).where(
                func.lower(Member.email).in_(sorted(emails)), Member.status == MemberStatus.ACTIVE
            )
        )
    ).all()
    return {email: member_id for email, member_id in rows}


async def replace_rows(db: AsyncSession, frm: date, to: date, rows: list, now: datetime) -> None:
    """from~to 날짜의 그룹웨어 줄을 지우고 새로 넣는다 + 30일 지난 줄 지우기 (커밋은 부르는 쪽)."""
    await db.execute(delete(MemberLeave).where(MemberLeave.source == SOURCE_GW, MemberLeave.day.between(frm, to)))
    await db.execute(delete(MemberLeave).where(MemberLeave.day < now.date() - timedelta(days=KEEP_DAYS)))
    if rows:
        await db.execute(
            insert(MemberLeave),
            [
                {"member_id": r.member_id, "day": r.day, "start_min": r.start_min, "end_min": r.end_min,
                 "kind": r.kind, "source": SOURCE_GW, "doc": r.doc, "received_at": now}
                for r in rows
            ],
        )


async def sync_leaves(db: AsyncSession, redis, frm: date, to: date, items: list) -> dict:
    """받은 휴가를 저장한다 — 응답 {"saved", "unmatched", "days"}."""
    emails = {(it.email or "").strip().lower() for it in items}
    by_email = await member_ids_by_email(db, emails)
    rows, unmatched = plan_rows(items, by_email)
    now = now_kst()
    await replace_rows(db, frm, to, rows, now)
    await db.commit()
    result = {"saved": len(rows), "unmatched": unmatched, "days": (to - frm).days + 1}
    try:
        await refresh_cache(db)
    except Exception as exc:  # noqa: BLE001 — 다음 1분 새로 읽기에서 들어온다
        logger.warning("leave cache refresh after sync failed (%s)", type(exc).__name__)
    if redis is not None:
        try:
            await redis.set(LAST_SYNC_KEY, json.dumps({"at": format_kst_iso(now), **result}))
        except Exception as exc:  # noqa: BLE001
            logger.warning("leave last-sync mark failed (%s)", type(exc).__name__)
    logger.info("leave-sync %s~%s saved=%d unmatched=%d", frm.isoformat(), to.isoformat(), result["saved"], unmatched)
    return result


# ── 관리자 ────────────────────────────────────────────────────

async def admin_day(db: AsyncSession, redis, day: date) -> dict:
    """그날 휴가로 열린 사람 — 이름 · 부서 · 종류 · 시간대 + 마지막으로 받은 시각."""
    from app.services.game import leave_opens_closed_hours, workday

    rows = (
        await db.execute(
            select(MemberLeave, Member.name, Member.department)
            .join(Member, Member.id == MemberLeave.member_id)
            .where(MemberLeave.day == day)
            .order_by(MemberLeave.start_min, Member.name, MemberLeave.id)
        )
    ).all()
    people: dict = {}
    for leave, name, department in rows:
        p = people.setdefault(leave.member_id, {"name": name, "department": department, "windows": [], "kinds": []})
        p["windows"].append((leave.start_min, leave.end_min, leave.kind))
    is_workday = workday(day)
    out = []
    for p in people.values():
        ws = sorted(p["windows"])
        main = max(ws, key=lambda w: (w[1] - w[0], w[1]))
        out.append({
            "name": p["name"],
            "department": p["department"],
            "kind": main[2],
            "label": " · ".join(dict.fromkeys(leave_label(k, s, e) for s, e, k in ws)),
            "windows": [{"start": hhmm(s), "end": hhmm(e), "kind": k} for s, e, k in ws],
            "opensWork": is_workday and leave_opens_closed_hours(ws),
        })
    out.sort(key=lambda p: (not p["opensWork"], p["name"] or ""))
    last = None
    if redis is not None:
        try:
            raw = await redis.get(LAST_SYNC_KEY)
            last = json.loads(raw) if raw else None
        except Exception:  # noqa: BLE001
            last = None
    if not last:
        at = await db.scalar(select(func.max(MemberLeave.received_at)))
        last = {"at": format_kst_iso(at)} if at else None
    return {
        "date": day.isoformat(),
        "workday": is_workday,
        "count": sum(1 for p in out if p["opensWork"]),
        "people": out,
        "lastSync": last,
    }
