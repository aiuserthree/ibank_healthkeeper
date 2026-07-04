#!/usr/bin/env python3
"""차주 예약 오픈 안내 — 전체 회원 Teams 1:1 발송 (수동 실행).

운영에서는 매주 수요일 08:55 스케줄러(job_teams_open_notice)가 자동 발송합니다.

사용법:
  ./scripts/broadcast-teams-open-notice.sh --dry-run
  ./scripts/broadcast-teams-open-notice.sh --yes
  ./scripts/broadcast-teams-open-notice.sh --yes --limit 3

전제:
  - .env: ENTRA_*, TEAMS_SENDER_REFRESH_TOKEN (또는 .teams-sender-refresh)
  - 수신자: Teams SSO로 한 번 이상 로그인한 회원 (member.entra_oid)
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import func, select

from app.config import get_settings
from app.core.time import format_kst_display, to_kst
from app.database import AsyncSessionLocal
from app.models import Member, MemberStatus, TeamsMessage, TeamsMessageType
from app.services.teams import (
    enqueue_open_notice_broadcast,
    load_open_notice_recipients,
    process_pending_teams_messages,
    render_open_notice_body,
    resolve_open_notice_cycle,
)


async def _count_without_oid(db) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Member)
        .where(Member.entra_oid.is_(None))
        .where(Member.status != MemberStatus.WITHDRAWN)
    )
    return int(result.scalar_one())


async def _summarize_send_results(db, cycle_id: int, member_ids: list[int]) -> dict[str, int]:
    if not member_ids:
        return {"sent": 0, "pending": 0, "failed": 0, "dead": 0}

    result = await db.execute(
        select(TeamsMessage.status, func.count())
        .where(TeamsMessage.type == TeamsMessageType.RESERVE_OPEN_NOTICE)
        .where(TeamsMessage.to_member_id.in_(member_ids))
        .where(TeamsMessage.dedupe_key.like(f"teams-open-notice:{cycle_id}:%"))
        .group_by(TeamsMessage.status)
    )
    counts = {status.value: count for status, count in result.all()}
    return {
        "sent": counts.get("SENT", 0),
        "pending": counts.get("PENDING", 0) + counts.get("SENDING", 0),
        "failed": counts.get("FAILED", 0),
        "dead": counts.get("DEAD", 0),
    }


async def main() -> int:
    parser = argparse.ArgumentParser(
        description="Broadcast Teams 1:1 open-notice to all members with entra_oid"
    )
    parser.add_argument(
        "--cycle-id",
        type=int,
        default=None,
        help="Target cycle (default: next upcoming open_at, else latest)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview recipients and sample message only — do not send",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip interactive confirmation",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Send to at most N members (for testing)",
    )
    args = parser.parse_args()

    settings = get_settings()
    if not settings.teams_open_notice_ready():
        print("ERROR: Teams open notice not configured.")
        print("  Set TEAMS_SENDER_REFRESH_TOKEN in .env")
        print("  TEAMS_OPEN_NOTICE_ENABLED=true (default)")
        return 1

    async with AsyncSessionLocal() as db:
        cycle = await resolve_open_notice_cycle(db, cycle_id=args.cycle_id)
        if not cycle:
            print("ERROR: No reservation cycle in DB — run dev-seed or precreate job first")
            return 1

        members = await load_open_notice_recipients(db, limit=args.limit)
        skipped_no_oid = await _count_without_oid(db)

        open_kst = to_kst(cycle.open_at)
        sample = members[0] if members else None
        sample_body = (
            render_open_notice_body(
                name=sample.name,
                open_at=cycle.open_at,
                close_at=cycle.close_at,
                week_start=cycle.target_week_start,
                week_end=cycle.target_week_end,
            )
            if sample
            else "(no recipients)"
        )

        print("=== Teams 예약 오픈 안내 (전체 1:1) ===")
        print(f"Sender:       {settings.teams_sender_email}")
        print(f"Site URL:     {settings.teams_open_notice_url}")
        print(f"Cycle:        #{cycle.id} ({cycle.target_week_start} ~ {cycle.target_week_end})")
        print(f"Open (KST):   {format_kst_display(cycle.open_at)}")
        print(f"Close (KST):  {format_kst_display(cycle.close_at)}")
        print(f"Recipients:   {len(members)} (entra_oid 보유, 탈퇴 제외)")
        print(f"Skipped:      {skipped_no_oid} (Teams SSO 미로그인 — entra_oid 없음)")
        if args.limit:
            print(f"Limit:        {args.limit}")
        print()
        print("--- Sample message ---")
        print(sample_body)
        print("----------------------")

        if not members:
            print("\nNothing to send.")
            return 0

        if args.dry_run:
            print("\nDry-run — no messages queued.")
            if len(members) > 1:
                print("Recipients:")
                for member in members[:10]:
                    print(f"  - {member.name} <{member.email}>")
                if len(members) > 10:
                    print(f"  ... and {len(members) - 10} more")
            return 0

        if not args.yes:
            prompt = (
                f"\nSend to {len(members)} member(s)? "
                f"(open {open_kst.strftime('%m/%d %H:%M')} KST) Type 'yes' to continue: "
            )
            if input(prompt).strip().lower() != "yes":
                print("Cancelled.")
                return 1

        member_ids = [member.id for member in members]
        enqueued, skipped_dedupe = await enqueue_open_notice_broadcast(
            db, cycle, limit=args.limit
        )

        print(f"\nQueued: {enqueued}, skipped (already sent): {skipped_dedupe}")
        print("Sending...")

        batches = 0
        while batches < 500:
            sent_batch = await process_pending_teams_messages(db, limit=50)
            if sent_batch == 0:
                break
            batches += 1
            print(f"  batch {batches}: sent {sent_batch}")

        summary = await _summarize_send_results(db, cycle.id, member_ids)
        print("\n=== Result ===")
        print(f"Sent:     {summary['sent']}")
        print(f"Pending:  {summary['pending']}")
        print(f"Failed:   {summary['failed']}")
        print(f"Dead:     {summary['dead']}")
        if summary["failed"] or summary["dead"]:
            print("Check teams_message table for last_error details.")
            return 1

    print("\nDone — check Teams chats from healthkeeper@ibank.co.kr")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
