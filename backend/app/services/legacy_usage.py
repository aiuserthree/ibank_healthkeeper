from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from sqlalchemy import delete, func, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LegacyUsage, Member, MemberStatus, Reservation, ReservationStatus, Slot
from app.services.cycle import resolve_system_state

SKIP_CELL = re.compile(
    r"^(미정|휴무|공석|설|부서장|안마사님\s*휴가)$",
    re.IGNORECASE,
)
DATE_HEADER = re.compile(r"^(\d{1,2})월(\d{1,2})일$")
TIME_RANGE = re.compile(r"^(\d{1,2}:\d{2})")
PERSON_WITH_EMAIL = re.compile(r"^(.+?)\s*\(([^)]+)\)\s*$")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.\w+")


@dataclass(frozen=True)
class ParsedLegacyUsage:
    name: str
    email: str | None
    usage_date: date
    usage_start_time: str | None


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", "", name.strip())


def _email_local(email: str) -> str:
    return email.split("@", 1)[0].lower()


def parse_person_cell(cell: str) -> list[tuple[str, str | None]]:
    """셀 문자열 → (이름, 이메일|None) 목록. 복수 이메일이면 각각 한 건."""
    text = cell.strip()
    if not text or SKIP_CELL.match(text):
        return []

    match = PERSON_WITH_EMAIL.match(text)
    if match:
        name = match.group(1).strip()
        raw_emails = match.group(2)
        emails = [e.strip().lower() for e in EMAIL_RE.findall(raw_emails)]
        if emails:
            return [(name, email) for email in emails]
        return [(name, None)]

    return [(text, None)]


def parse_schedule_markdown(content: str, *, year: int = 2026) -> list[ParsedLegacyUsage]:
    records: list[ParsedLegacyUsage] = []
    date_headers: list[str] = []

    for line in content.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue

        cells = [c.strip() for c in line.strip("|").split("|")]
        if not cells:
            continue

        if cells[0] == "시간":
            date_headers = []
            for header in cells[1:]:
                m = DATE_HEADER.match(header)
                if m:
                    month, day = int(m.group(1)), int(m.group(2))
                    date_headers.append(f"{year:04d}-{month:02d}-{day:02d}")
            continue

        if cells[0] == "---" or not date_headers:
            continue

        time_match = TIME_RANGE.match(cells[0])
        start_time = time_match.group(1) if time_match else None

        for header_date, cell in zip(date_headers, cells[1:]):
            if not cell:
                continue
            usage_date = date.fromisoformat(header_date)
            for name, email in parse_person_cell(cell):
                records.append(
                    ParsedLegacyUsage(
                        name=name,
                        email=email,
                        usage_date=usage_date,
                        usage_start_time=start_time,
                    )
                )

    return records


async def replace_legacy_usages(
    db: AsyncSession,
    records: list[ParsedLegacyUsage],
    *,
    source: str = "2026_schedule",
) -> int:
    await db.execute(delete(LegacyUsage).where(LegacyUsage.source == source))
    for rec in records:
        db.add(
            LegacyUsage(
                name=rec.name.strip(),
                email=rec.email,
                email_local=_email_local(rec.email) if rec.email else None,
                usage_date=rec.usage_date,
                usage_start_time=rec.usage_start_time,
                source=source,
            )
        )
    await db.flush()
    return len(records)


def _legacy_match_conditions(*, email: str, name: str):
    email = email.strip().lower()
    local = _email_local(email)
    norm_name = _normalize_name(name)

    conditions = [
        LegacyUsage.email == email,
        LegacyUsage.email_local == local,
    ]
    if norm_name:
        conditions.append(
            and_(LegacyUsage.email.is_(None), LegacyUsage.name == name.strip())
        )
    return or_(*conditions)


async def resolve_legacy_last_used_date(
    db: AsyncSession,
    *,
    email: str,
    name: str,
) -> date | None:
    result = await db.execute(
        select(func.max(LegacyUsage.usage_date)).where(
            _legacy_match_conditions(email=email, name=name)
        )
    )
    return result.scalar_one_or_none()


async def count_legacy_usages(
    db: AsyncSession,
    *,
    email: str,
    name: str,
) -> int:
    """과거 스케줄 이용 횟수(동일 날짜·시간 중복 제외)."""
    stmt = (
        select(LegacyUsage.usage_date, LegacyUsage.usage_start_time)
        .where(_legacy_match_conditions(email=email, name=name))
        .distinct()
    )
    result = await db.execute(stmt)
    return len(result.all())


def _end_time_from_start(start: str | None) -> str | None:
    if not start or ":" not in start:
        return None
    hour, minute = (int(x) for x in start.split(":", 1))
    minute += 30
    if minute >= 60:
        hour += 1
        minute -= 60
    return f"{hour:02d}:{minute:02d}"


async def _gather_usage_history_items(db: AsyncSession, member: Member) -> list[dict]:
    """과거 스케줄 + 사이트 확정 이용(차주 제외), 날짜·시간 중복 제외."""
    _, cycle = await resolve_system_state(db)
    exclude_start = cycle.target_week_start if cycle else None
    exclude_end = cycle.target_week_end if cycle else None

    legacy_rows = await db.execute(
        select(LegacyUsage.usage_date, LegacyUsage.usage_start_time)
        .where(_legacy_match_conditions(email=member.email, name=member.name))
        .group_by(LegacyUsage.usage_date, LegacyUsage.usage_start_time)
    )

    site_stmt = (
        select(Slot.slot_date, Slot.start_time, Slot.end_time)
        .join(Reservation, Reservation.slot_id == Slot.id)
        .where(Reservation.member_id == member.id)
        .where(Reservation.status == ReservationStatus.CONFIRMED)
    )
    if exclude_start is not None and exclude_end is not None:
        site_stmt = site_stmt.where(
            or_(Slot.slot_date < exclude_start, Slot.slot_date > exclude_end)
        )
    site_rows = await db.execute(site_stmt)

    merged: dict[tuple[date, str], dict] = {}
    for usage_date, start_time in legacy_rows.all():
        start = start_time or ""
        merged[(usage_date, start)] = {
            "usageDate": usage_date.isoformat(),
            "startTime": start,
            "endTime": _end_time_from_start(start_time),
        }
    for slot_date, start_time, end_time in site_rows.all():
        start = start_time.strftime("%H:%M")
        merged[(slot_date, start)] = {
            "usageDate": slot_date.isoformat(),
            "startTime": start,
            "endTime": end_time.strftime("%H:%M") if end_time else _end_time_from_start(start),
        }

    items = list(merged.values())
    items.sort(key=lambda row: (row["usageDate"], row["startTime"]), reverse=True)
    return items


async def count_member_usage_history(db: AsyncSession, member: Member) -> int:
    items = await _gather_usage_history_items(db, member)
    return len(items)


async def list_member_usage_history(
    db: AsyncSession,
    member: Member,
    *,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """이용 내역 — 차주 예약 제외, 과거 스케줄 + 사이트 확정 이용."""
    page = max(1, page)
    page_size = min(max(1, page_size), 50)
    all_items = await _gather_usage_history_items(db, member)
    total = len(all_items)
    if total == 0:
        return {
            "items": [],
            "page": page,
            "pageSize": page_size,
            "total": 0,
            "totalPages": 0,
        }

    total_pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, total_pages)
    offset = (page - 1) * page_size
    page_items = all_items[offset : offset + page_size]
    return {
        "items": page_items,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": total_pages,
    }


async def get_member_total_uses(db: AsyncSession, member: Member) -> int:
    """확정 예약 + 과거 스케줄 이용 횟수."""
    confirmed_result = await db.execute(
        select(func.count())
        .select_from(Reservation)
        .where(Reservation.member_id == member.id)
        .where(Reservation.status == ReservationStatus.CONFIRMED)
    )
    confirmed = confirmed_result.scalar_one()
    legacy = await count_legacy_usages(db, email=member.email, name=member.name)
    return confirmed + legacy


async def get_member_apply_total(db: AsyncSession, member: Member) -> int:
    """과거 스케줄 이용 + 사이트 신청(취소 제외). 이력만 있으면 누적 이용과 동일."""
    legacy = await count_legacy_usages(db, email=member.email, name=member.name)
    active_result = await db.execute(
        select(func.count())
        .select_from(Reservation)
        .where(Reservation.member_id == member.id)
        .where(Reservation.status != ReservationStatus.CANCELLED)
    )
    return legacy + int(active_result.scalar_one())


async def apply_legacy_last_used_to_member(
    db: AsyncSession,
    member: Member,
    *,
    email: str | None = None,
    name: str | None = None,
) -> bool:
    lookup_email = (email or member.email or "").strip().lower()
    lookup_name = (name or member.name or "").strip()
    if not lookup_email and not lookup_name:
        return False

    legacy_date = await resolve_legacy_last_used_date(
        db, email=lookup_email, name=lookup_name
    )
    if not legacy_date:
        return False

    if member.last_used_date is None or legacy_date > member.last_used_date:
        member.last_used_date = legacy_date
        return True
    return False


async def find_member_by_email_local(
    db: AsyncSession,
    email: str,
) -> Member | None:
    local = _email_local(email.strip().lower())
    result = await db.execute(
        select(Member)
        .where(Member.email.ilike(f"{local}@%"))
        .where(Member.status != MemberStatus.WITHDRAWN)
    )
    members = result.scalars().all()
    if len(members) == 1:
        return members[0]
    return None


async def sync_all_members_legacy_last_used(db: AsyncSession) -> int:
    """이미 가입된 회원 전원에 legacy 이용일 반영."""
    result = await db.execute(
        select(Member).where(Member.status != MemberStatus.WITHDRAWN)
    )
    updated = 0
    for member in result.scalars().all():
        if await apply_legacy_last_used_to_member(db, member):
            updated += 1
    return updated


def load_schedule_file(path: Path) -> list[ParsedLegacyUsage]:
    return parse_schedule_markdown(path.read_text(encoding="utf-8"))
