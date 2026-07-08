#!/usr/bin/env bash
# 공공데이터포털 공휴일 API → DB 동기화 (수동 실행)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/.env" 2>/dev/null || true
cd "$ROOT/backend"
exec .venv/bin/python -c "
import asyncio
from app.config import get_settings
from app.database import AsyncSessionLocal
from app.services.public_holiday_sync import default_sync_years, sync_public_holidays_from_api
from app.services.korean_holidays import is_public_holiday, holiday_cache_loaded
from datetime import date

async def main():
    settings = get_settings()
    key = settings.public_data_portal_service_key.strip()
    if not key:
        raise SystemExit('PUBLIC_DATA_PORTAL_SERVICE_KEY 가 설정되지 않았습니다.')
    years = default_sync_years()
    async with AsyncSessionLocal() as db:
        count = await sync_public_holidays_from_api(db, key, years)
    print(f'동기화 완료: years={years} count={count} cache_active={holiday_cache_loaded()}')
    samples = [
        date(2026, 7, 17),
        date(2026, 8, 17),
        date(2026, 10, 5),
        date(2026, 10, 9),
    ]
    for d in samples:
        print(f'  {d.isoformat()}: {\"공휴일\" if is_public_holiday(d) else \"평일\"}')

asyncio.run(main())
"
