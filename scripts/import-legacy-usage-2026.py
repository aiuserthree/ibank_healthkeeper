#!/usr/bin/env python3
"""2026년 예약현황(마크다운) → legacy_usage 이관 및 회원 last_used_date 반영."""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.database import AsyncSessionLocal
from app.services.legacy_usage import (
    load_schedule_file,
    replace_legacy_usages,
    sync_all_members_legacy_last_used,
)

DEFAULT_SOURCE = ROOT / "예약현황_2026_아이디추가.md"


async def run(source: Path, *, sync_members: bool) -> None:
    if not source.is_file():
        raise SystemExit(f"파일을 찾을 수 없습니다: {source}")

    records = load_schedule_file(source)
    if not records:
        raise SystemExit("파싱된 이용 이력이 없습니다.")

    async with AsyncSessionLocal() as db:
        count = await replace_legacy_usages(db, records)
        updated = 0
        if sync_members:
            updated = await sync_all_members_legacy_last_used(db)
        await db.commit()

    print(f"[import-legacy-usage] legacy_usage {count}건 저장")
    if sync_members:
        print(f"[import-legacy-usage] 회원 last_used_date {updated}명 갱신")


def main() -> None:
    parser = argparse.ArgumentParser(description="2026 예약현황 → legacy 이용 이력 이관")
    parser.add_argument(
        "source",
        nargs="?",
        type=Path,
        default=DEFAULT_SOURCE,
        help=f"마크다운 경로 (기본: {DEFAULT_SOURCE.name})",
    )
    parser.add_argument(
        "--no-sync-members",
        action="store_true",
        help="legacy_usage만 저장하고 기존 회원 last_used_date는 갱신하지 않음",
    )
    args = parser.parse_args()
    asyncio.run(run(args.source, sync_members=not args.no_sync_members))


if __name__ == "__main__":
    main()
