#!/usr/bin/env python3
"""추가 예약현황(마크다운) → legacy_usage 이관 및 회원 last_used_date 재계산."""
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
    recompute_all_members_last_used_date,
    replace_legacy_usages,
)

DEFAULT_SOURCE = "2026_schedule_addition"
DEFAULT_FILE = ROOT / "예약현황(추가).md"


async def run(source_path: Path, *, legacy_source: str, sync_members: bool) -> None:
    if not source_path.is_file():
        raise SystemExit(f"파일을 찾을 수 없습니다: {source_path}")

    records = load_schedule_file(source_path)
    if not records:
        raise SystemExit("파싱된 이용 이력이 없습니다.")

    async with AsyncSessionLocal() as db:
        count = await replace_legacy_usages(db, records, source=legacy_source)
        updated = 0
        if sync_members:
            updated = await recompute_all_members_last_used_date(db)
        await db.commit()

    print(f"[import-legacy-usage-addition] legacy_usage {count}건 저장 (source={legacy_source})")
    if sync_members:
        print(f"[import-legacy-usage-addition] 회원 last_used_date {updated}명 갱신")


def main() -> None:
    parser = argparse.ArgumentParser(description="추가 예약현황 → legacy 이용 이력 이관")
    parser.add_argument(
        "source",
        nargs="?",
        type=Path,
        default=DEFAULT_FILE,
        help=f"마크다운 경로 (기본: {DEFAULT_FILE.name})",
    )
    parser.add_argument(
        "--legacy-source",
        default=DEFAULT_SOURCE,
        help=f"legacy_usage.source 값 (기본: {DEFAULT_SOURCE})",
    )
    parser.add_argument(
        "--no-sync-members",
        action="store_true",
        help="legacy_usage만 저장하고 회원 last_used_date는 갱신하지 않음",
    )
    args = parser.parse_args()
    asyncio.run(
        run(args.source, legacy_source=args.legacy_source, sync_members=not args.no_sync_members)
    )


if __name__ == "__main__":
    main()
