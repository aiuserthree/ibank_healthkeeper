from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache

import holidays
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KoreanPublicHoliday

# holidays 패키지가 아직 반영하지 않은 2026년 이후 법정 공휴일 (API 미동기화 시 폴백)
_SUPPLEMENTAL_FROM_YEAR = 2026
_SUPPLEMENTAL_FIXED: tuple[tuple[int, int], ...] = (
    (7, 17),  # 제헌절
)

_cache_loaded = False
_cache_active = False
_cached_holiday_dates: frozenset[date] = frozenset()


@lru_cache(maxsize=8)
def _kr_holidays(year: int) -> holidays.HolidayBase:
    return holidays.SouthKorea(years=year)


def _weekend_substitute(d: date) -> date | None:
    """주말과 겹치면 대체공휴일(다음 월요일)을 반환."""
    if d.weekday() == 5:
        return d + timedelta(days=2)
    if d.weekday() == 6:
        return d + timedelta(days=1)
    return None


@lru_cache(maxsize=8)
def _supplemental_holidays(year: int) -> frozenset[date]:
    if year < _SUPPLEMENTAL_FROM_YEAR:
        return frozenset()
    out: set[date] = set()
    for month, day in _SUPPLEMENTAL_FIXED:
        primary = date(year, month, day)
        out.add(primary)
        substitute = _weekend_substitute(primary)
        if substitute:
            out.add(substitute)
    return frozenset(out)


def _fallback_public_holiday(d: date) -> bool:
    return d in _kr_holidays(d.year) or d in _supplemental_holidays(d.year)


def holiday_cache_loaded() -> bool:
    return _cache_active


async def refresh_holiday_cache(db: AsyncSession) -> int:
    global _cache_loaded, _cache_active, _cached_holiday_dates
    result = await db.execute(select(KoreanPublicHoliday.holiday_date))
    _cached_holiday_dates = frozenset(result.scalars().all())
    _cache_loaded = True
    _cache_active = len(_cached_holiday_dates) > 0
    return len(_cached_holiday_dates)


def is_public_holiday(d: date) -> bool:
    """대한민국 법정 공휴일(대체공휴일 포함) 여부."""
    if _cache_active:
        return d in _cached_holiday_dates
    return _fallback_public_holiday(d)


def is_slot_closed(slot_date: date, is_vacation: bool) -> bool:
    """안마사 휴가 또는 공휴일로 신청 불가."""
    return is_vacation or is_public_holiday(slot_date)
