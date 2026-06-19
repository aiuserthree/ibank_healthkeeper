#!/usr/bin/env python3
"""운영/서버에서 legacy_usage 이관 (backend rsync에 포함)."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND))

from app.database import AsyncSessionLocal
from app.services.legacy_usage import (
    load_schedule_file,
    replace_legacy_usages,
    sync_all_members_legacy_last_used,
)

DEFAULT_SOURCE = BACKEND / "data" / "legacy_usage_2026.md"


async def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.is_file():
        raise SystemExit(f"파일 없음: {source}")

    records = load_schedule_file(source)
    async with AsyncSessionLocal() as db:
        count = await replace_legacy_usages(db, records)
        updated = await sync_all_members_legacy_last_used(db)
        await db.commit()

    print(f"[import-legacy-usage] legacy_usage {count}건, 회원 갱신 {updated}명")


if __name__ == "__main__":
    asyncio.run(main())
