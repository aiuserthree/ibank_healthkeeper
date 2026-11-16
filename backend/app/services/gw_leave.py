"""그룹웨어 휴가 → 헬스키퍼 (서버가 직접 읽기)

예전에는 그룹웨어 DB 가 헬스키퍼 서버에서 닿지 않아 사내망 맥의 scripts/gw-leave-sync.py 가 읽어 보냈다.
2026-11-16 방화벽 · DB 접속 허용(115.68.221.73 → 118.67.134.227:5432)을 받아, 이제 서버가 직접 읽는다.

- 평일 07~19시 10분마다(main.py 일정 j13). 서버 일꾼이 여럿이라 10분 칸마다 Redis 잠금으로 한 번만 돈다.
- 그룹웨어는 읽기만 — 읽기 전용 계정 · default_transaction_read_only=on · 읽기 전용 트랜잭션.
- 오늘 · 내일(한국 시간)에 걸친 휴가 · 반차 · 반반차 · 특별휴가 결재 문서의 날짜 · 시간 · 기안자 메일만 읽는다.
- 쉬는 시간대 계산은 scripts/gw-leave-sync.py 와 같다(tests/test_gw_leave.py 가 둘의 결과가 같은지 본다).
- 접속 정보는 설정(GW_DB_*)에만 — 로그에는 오류 종류 이름과 건수만 남긴다(이름 · 메일 · 비밀값 없음).
"""

from __future__ import annotations

import html
import logging
import re
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from typing import Iterable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.time import today_kst

logger = logging.getLogger(__name__)

LOCK_KEY = "hk:leave:gw_lock:{slot}"  # 10분 칸마다 한 일꾼만

# 결재 양식 → 헬스키퍼 휴가 종류
FORM_VACATION, FORM_HALF, FORM_QUARTER, FORM_SPECIAL = 1, 11, 13, 14
FORM_KIND = {FORM_VACATION: "VACATION", FORM_HALF: "HALF", FORM_QUARTER: "QUARTER", FORM_SPECIAL: "SPECIAL"}

DAY_END = 24 * 60
HALF_AM = (0, 14 * 60)            # 오전 반차 — 00:00~14:00
HALF_PM = (13 * 60, DAY_END)      # 오후 반차 — 13:00~24:00
QUARTER_DEFAULT = (16 * 60, 18 * 60)  # 반반차 — 본문에 시간이 없으면 16:00~18:00
QUARTER_MARGIN = 30               # 반반차 — 본문 시간 앞뒤 30분 여유
QUARTER_MAX = 4 * 60              # 본문 시간이 이보다 길면 잘못 읽은 것으로 보고 기본 시간대

SQL = """
SELECT d.sanc_doc_seq AS doc, d.sanc_frm_seq AS form, d.str_dt, d.end_dt, d.rmk_seg2, d.cont, lower(trim(u.mail)) AS email
FROM dw_sanc_doc d
JOIN dw_usr u ON u.usr_seq = COALESCE(d.req_usr, d.reg_usr)
WHERE d.sanc_frm_seq IN (1, 11, 13, 14)
  AND d.sts IN ('002', '003')
  AND d.str_dt IS NOT NULL
  AND d.str_dt < $2::date
  AND COALESCE(d.end_dt, d.str_dt) >= $1::date
  AND u.use_yn = 'Y'
  AND COALESCE(u.rtm_yn, 'N') <> 'Y'
  AND u.mail IS NOT NULL AND trim(u.mail) <> ''
"""


def hhmm(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _as_date(v) -> Optional[date]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


_TAG = re.compile(r"<[^>]+>")
_TIME_RANGE = re.compile(
    r"(?<!\d)(\d{1,2})\s*(?::|시)\s*(\d{2})?\s*(?:분)?\s*[~\-–—～〜]\s*(\d{1,2})\s*(?::|시)\s*(\d{2})?(?!\d)"
)


def html_text(cont: Optional[str]) -> str:
    """본문 HTML → 글자만 (태그 · &nbsp; 등 지우기)."""
    if not cont:
        return ""
    text = _TAG.sub(" ", str(cont))
    return html.unescape(text).replace("\xa0", " ")


def _hour24(h: int) -> int:
    """12시간제로 적은 시각 — 9시 전(1~8시)은 오후로 본다(반반차는 업무 시간 안에 쓴다)."""
    return h + 12 if h < 9 else h


def quarter_body_time(cont: Optional[str]) -> Optional[tuple]:
    """반반차 본문의 「16:00~18:00」 같은 시간 → (시작 분, 끝 분). 없거나 말이 안 되면 None."""
    for m in _TIME_RANGE.finditer(html_text(cont)):
        h1, m1, h2, m2 = int(m.group(1)), int(m.group(2) or 0), int(m.group(3)), int(m.group(4) or 0)
        if not (0 <= h1 <= 24 and 0 <= h2 <= 24 and m1 < 60 and m2 < 60):
            continue
        start, end = _hour24(h1) * 60 + m1, _hour24(h2) * 60 + m2
        if 0 < end - start <= QUARTER_MAX and end <= DAY_END:
            return start, end
    return None


def quarter_window(cont: Optional[str]) -> tuple:
    """반반차 쉬는 시간대 — 본문 시간(앞뒤 30분 여유), 없으면 16:00~18:00."""
    found = quarter_body_time(cont)
    if found is None:
        return QUARTER_DEFAULT
    return max(0, found[0] - QUARTER_MARGIN), min(DAY_END, found[1] + QUARTER_MARGIN)


def half_window(seg2: Optional[str]) -> Optional[tuple]:
    """반차 — 001 오전(00:00~14:00) · 002 오후(13:00~24:00). 모르는 값은 None(보내지 않는다)."""
    code = (str(seg2).strip() if seg2 is not None else "")
    if code in ("001", "1"):
        return HALF_AM
    if code in ("002", "2"):
        return HALF_PM
    return None


def doc_items(row: dict, since: date, until: date) -> list:
    """결재 문서 한 줄 → 보낼 줄들 [{email, day, start, end, kind, doc}] (since~until 안의 날짜만)."""
    try:
        form = int(row.get("form"))
    except (TypeError, ValueError):
        return []
    kind = FORM_KIND.get(form)
    first = _as_date(row.get("str_dt"))
    email = (row.get("email") or "").strip().lower()
    if not kind or first is None or not email:
        return []
    last = first
    if form in (FORM_VACATION, FORM_SPECIAL):
        last = _as_date(row.get("end_dt")) or first
        if last < first:
            last = first
        window = (0, DAY_END)
    elif form == FORM_HALF:
        window = half_window(row.get("rmk_seg2"))
        if window is None:
            return []
    else:
        window = quarter_window(row.get("cont"))
    out = []
    day = max(first, since)
    while day <= min(last, until):
        out.append({
            "email": email, "day": day.isoformat(), "start": hhmm(window[0]), "end": hhmm(window[1]),
            "kind": kind, "doc": str(row.get("doc") or "")[:40],
        })
        day += timedelta(days=1)
    return out


def build_items(rows: Iterable[dict], since: date, until: date) -> list:
    """모든 문서 → 보낼 줄 (같은 사람 · 같은 날 · 같은 시간대 · 같은 종류는 한 줄로)."""
    seen, out = set(), []
    for row in rows:
        for it in doc_items(row, since, until):
            key = (it["email"], it["day"], it["start"], it["end"], it["kind"])
            if key in seen:
                continue
            seen.add(key)
            out.append(it)
    out.sort(key=lambda it: (it["day"], it["start"], it["kind"], it["doc"]))
    return out



async def fetch_rows(since: date, until: date) -> list:
    """그룹웨어에서 since~until 에 걸친 결재 문서를 읽기 전용으로 읽는다."""
    import asyncpg

    s = get_settings()
    conn = await asyncpg.connect(
        host=s.gw_db_host, port=int(s.gw_db_port or 5432), database=s.gw_db_name or "postgres",
        user=s.gw_db_user, password=s.gw_db_password, timeout=10, command_timeout=20,
        server_settings={"search_path": "groupware", "default_transaction_read_only": "on"},
    )
    try:
        async with conn.transaction(readonly=True):
            return [dict(r) for r in await conn.fetch(SQL, since, until + timedelta(days=1))]
    finally:
        await conn.close()


async def sync_now(db: AsyncSession, redis=None) -> Optional[dict]:
    """오늘 · 내일 휴가를 읽어 저장한다 — 결과 {"saved","unmatched","days","items"} (설정이 비면 None)."""
    from app.services import leave as leave_service

    if not get_settings().gw_ready():
        return None
    today = today_kst()
    tomorrow = today + timedelta(days=1)
    items = [
        SimpleNamespace(email=it["email"], day=date.fromisoformat(it["day"]), start=it["start"], end=it["end"], kind=it["kind"], doc=it["doc"] or None)
        for it in build_items(await fetch_rows(today, tomorrow), today, tomorrow)
    ]
    res = await leave_service.sync_leaves(db, redis, today, tomorrow, items)
    return {**res, "items": len(items)}


async def job_gw_leave_sync(db: AsyncSession) -> None:
    """일정 작업 — 설정이 있을 때만, 10분 칸마다 한 일꾼만."""
    if not get_settings().gw_ready():
        return
    from app.database import get_redis

    redis = None
    try:
        redis = await get_redis()
        slot = datetime.now().strftime("%Y%m%d%H") + str(datetime.now().minute // 10)
        if not await redis.set(LOCK_KEY.format(slot=slot), "1", nx=True, ex=540):
            return
    except Exception as exc:  # noqa: BLE001 — 잠금을 못 걸면 이번 칸은 건너뛴다(다음 칸에 다시)
        logger.warning("gw leave sync lock failed (%s)", type(exc).__name__)
        return
    try:
        res = await sync_now(db, redis)
        if res is not None:
            logger.info("gw leave sync ok items=%d saved=%d unmatched=%d", res["items"], res["saved"], res["unmatched"])
    except Exception as exc:  # noqa: BLE001 — 비밀 · 개인정보 없이 종류만
        await db.rollback()
        logger.warning("gw leave sync failed (%s)", type(exc).__name__)
