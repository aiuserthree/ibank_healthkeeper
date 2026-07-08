from __future__ import annotations

import logging
from datetime import date, datetime
from urllib.parse import urlencode

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import KST, now_kst
from app.models import KoreanPublicHoliday
from app.services.korean_holidays import refresh_holiday_cache

logger = logging.getLogger(__name__)

REST_DE_INFO_URL = (
    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"
)


def _parse_locdate(value: int | str) -> date:
    raw = str(value)
    if len(raw) != 8:
        raise ValueError(f"invalid locdate: {value}")
    return date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))


def _extract_items(body: dict | None) -> list[dict]:
    if not body:
        return []
    items = body.get("items")
    if not items:
        return []
    item = items.get("item")
    if not item:
        return []
    if isinstance(item, dict):
        return [item]
    return list(item)


def _build_rest_de_url(service_key: str, year: int, month: int) -> str:
    """공공데이터포털 인증키는 디코딩/인코딩 키 모두 지원."""
    key = service_key.strip()
    query = urlencode(
        {
            "solYear": str(year),
            "solMonth": f"{month:02d}",
            "numOfRows": "100",
            "_type": "json",
        }
    )
    if "%" in key:
        key_param = key
    else:
        # 디코딩 키는 그대로 붙이는 것이 공공데이터포털 가이드와 맞는 경우가 많음
        key_param = key
    return f"{REST_DE_INFO_URL}?serviceKey={key_param}&{query}"


async def fetch_rest_days_for_month(
    service_key: str,
    year: int,
    month: int,
) -> list[dict]:
    url = _build_rest_de_url(service_key, year, month)
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        payload = response.json()

    header = payload.get("response", {}).get("header", {})
    result_code = str(header.get("resultCode", ""))
    if result_code != "00":
        result_msg = header.get("resultMsg", "unknown error")
        raise RuntimeError(
            f"공휴일 API 오류 year={year} month={month:02d} code={result_code} msg={result_msg}"
        )

    return _extract_items(payload.get("response", {}).get("body"))


async def sync_public_holidays_from_api(
    db: AsyncSession,
    service_key: str,
    years: list[int],
) -> int:
    """공공데이터포털 getRestDeInfo로 연도별 공휴일(대체공휴일 포함)을 DB에 반영."""
    key = service_key.strip()
    if not key:
        raise ValueError("PUBLIC_DATA_PORTAL_SERVICE_KEY is empty")

    collected: dict[date, tuple[str, int]] = {}
    for year in years:
        for month in range(1, 13):
            items = await fetch_rest_days_for_month(key, year, month)
            for item in items:
                holiday_date = _parse_locdate(item["locdate"])
                date_name = str(item.get("dateName") or "공휴일")
                collected[holiday_date] = (date_name, holiday_date.year)

    synced_at = now_kst()
    for year in years:
        await db.execute(
            delete(KoreanPublicHoliday).where(KoreanPublicHoliday.sol_year == year)
        )

    for holiday_date, (date_name, sol_year) in sorted(collected.items()):
        if sol_year not in years:
            continue
        db.add(
            KoreanPublicHoliday(
                holiday_date=holiday_date,
                date_name=date_name,
                sol_year=sol_year,
                synced_at=synced_at,
            )
        )

    await db.flush()
    await db.commit()
    count = await refresh_holiday_cache(db)
    if count == 0:
        raise RuntimeError("공휴일 API 동기화 결과가 비어 있습니다")
    logger.info(
        "Synced public holidays from data.go.kr years=%s count=%s",
        years,
        len(collected),
    )
    return count


async def load_holiday_cache_from_db(db: AsyncSession) -> int:
    return await refresh_holiday_cache(db)


def default_sync_years(now: datetime | None = None) -> list[int]:
    current = (now or now_kst()).astimezone(KST).year
    return [current, current + 1]
