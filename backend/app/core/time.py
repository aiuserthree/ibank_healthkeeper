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


_WEEKDAY_KO = ("월", "화", "수", "목", "금", "토", "일")


def format_deadline_relative_ko(dt: datetime | None, fallback: str = "목요일 17:00") -> str:
    """마감 시각을 오늘/내일/요일 기준으로 표시 (예: 오늘 17:00)."""
    if dt is None:
        return fallback
    close_kst = to_kst(dt)
    delta = (close_kst.date() - now_kst().date()).days
    time_label = close_kst.strftime("%H:%M")
    if delta == 0:
        return f"오늘 {time_label}"
    if delta == 1:
        return f"내일 {time_label}"
    dow = _WEEKDAY_KO[close_kst.weekday()]
    return f"{dow}요일 {time_label}"
