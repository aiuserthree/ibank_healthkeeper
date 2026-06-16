from __future__ import annotations

from datetime import date, datetime, timezone

from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")


def now_utc() -> datetime:
    """레거시 호환 — 신규 코드는 now_kst() 사용."""
    return datetime.now(timezone.utc)


def now_kst() -> datetime:
    """현재 시각 (한국 표준시). 비즈니스 로직·DB 기록 기본값."""
    return datetime.now(KST)


def today_kst() -> date:
    return now_kst().date()


def to_kst(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(KST)


def format_kst_iso(dt: datetime | None) -> str | None:
    """API 응답용 ISO 8601 (+09:00)."""
    if dt is None:
        return None
    return to_kst(dt).isoformat(timespec="seconds")


def format_kst_display(dt: datetime | None) -> str:
    """관리자 UI용 YYYY-MM-DD HH:MM (KST)."""
    if dt is None:
        return "-"
    return to_kst(dt).strftime("%Y-%m-%d %H:%M")
