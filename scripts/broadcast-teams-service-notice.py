#!/usr/bin/env python3
"""공지사항 Teams 1:1 안내 — 공지 첫 문단 + 공지 페이지 링크 (수동 실행).

사용법:
  ./scripts/broadcast-teams-service-notice.sh --notice-id 1 --dry-run
  ./scripts/broadcast-teams-service-notice.sh --notice-id 1 --to me@ibank.co.kr   # 한 명에게 테스트
  ./scripts/broadcast-teams-service-notice.sh --notice-id 1 --yes                 # 전체 발송

전제:
  - .env: ENTRA_*, SSO_PROVIDER=entra, TEAMS_SENDER_REFRESH_TOKEN
  - 수신자: Teams SSO로 한 번 이상 로그인한 회원 (member.entra_oid), 탈퇴 제외
  - 같은 공지는 한 사람에게 한 번만 발송 (--to 테스트는 기록만 남기고 중복 방지 키 없음)
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
from app.database import AsyncSessionLocal
from app.models import MailStatus, Member, Notice, TeamsMessage, TeamsMessageType
from app.services.teams import (
    enqueue_teams_message,
    load_open_notice_recipients,
    notice_page_url,
    process_pending_teams_messages,
    render_service_notice_body,
    send_teams_message,
    service_notice_dedupe_key,
)
from app.core.time import now_kst


async def main() -> int:
    parser = argparse.ArgumentParser(description="Broadcast a notice to members via Teams 1:1 chat")
    parser.add_argument("--notice-id", type=int, required=True)
    parser.add_argument("--to", help="Send only to this member email (test)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    if not settings.teams_graph_sender_ready():
        print("ERROR: Teams sender not configured (SSO_PROVIDER=entra, TEAMS_SENDER_REFRESH_TOKEN).")
        return 1

    async with AsyncSessionLocal() as db:
        notice = await db.get(Notice, args.notice_id)
        if not notice or not notice.published:
            print(f"ERROR: notice #{args.notice_id} not found or not published")
            return 1
        url = notice_page_url(notice.id)

        if args.to:
            member = (
                await db.execute(select(Member).where(func.lower(Member.email) == args.to.strip().lower()))
            ).scalar_one_or_none()
            if not member or not member.entra_oid:
                print(f"ERROR: {args.to} not found or never logged in with Teams")
                return 1
            members = [member]
        else:
            # 로컬 개발용 mock 계정(entra_oid "mock-…")과 발신 계정 자신은 제외
            sender = (settings.teams_sender_email or "").strip().lower()
            members = [
                m for m in await load_open_notice_recipients(db)
                if not (m.entra_oid or "").lower().startswith("mock-")
                and (m.email or "").strip().lower() != sender
            ]

        sample = render_service_notice_body(
            name=members[0].name if members else "홍길동", title=notice.title, body=notice.body, url=url
        )
        print("=== Teams 공지 안내 ===")
        print(f"Notice:     #{notice.id} {notice.title}")
        print(f"URL:        {url}")
        print(f"Sender:     {settings.teams_sender_email}")
        print(f"Recipients: {len(members)}" + (f" (test: {args.to})" if args.to else " (entra_oid 보유, 탈퇴 제외)"))
        print("--- Sample ---")
        print(sample)
        print("--------------")
        if args.dry_run or not members:
            print("Dry-run — nothing sent." if args.dry_run else "Nothing to send.")
            return 0

        if args.to:
            msg = TeamsMessage(
                type=TeamsMessageType.SERVICE_NOTICE,
                to_member_id=members[0].id,
                to_entra_oid=members[0].entra_oid,
                body=sample,
                status=MailStatus.PENDING,
            )
            msg.chat_id = await send_teams_message(msg)
            msg.status = MailStatus.SENT
            msg.sent_at = now_kst()
            db.add(msg)
            await db.commit()
            print(f"OK — sent test to {members[0].name} <{members[0].email}>")
            return 0

        if not args.yes:
            if input(f"\nSend to {len(members)} member(s)? Type 'yes' to continue: ").strip().lower() != "yes":
                print("Cancelled.")
                return 1

        enqueued = skipped = 0
        for member in members:
            msg = await enqueue_teams_message(
                db,
                message_type=TeamsMessageType.SERVICE_NOTICE,
                to_member_id=member.id,
                to_entra_oid=member.entra_oid,
                body=render_service_notice_body(name=member.name, title=notice.title, body=notice.body, url=url),
                dedupe_key=service_notice_dedupe_key(notice.id, member.id),
            )
            if msg:
                enqueued += 1
            else:
                skipped += 1
        await db.commit()
        print(f"Queued: {enqueued}, skipped (already sent): {skipped}")

        batches = 0
        while batches < 500:
            sent = await process_pending_teams_messages(db, limit=50)
            if sent == 0:
                break
            batches += 1
            print(f"  batch {batches}: sent {sent}")

        rows = (
            await db.execute(
                select(TeamsMessage.status, func.count())
                .where(TeamsMessage.type == TeamsMessageType.SERVICE_NOTICE)
                .where(TeamsMessage.dedupe_key.like(f"service-notice:{notice.id}:%"))
                .group_by(TeamsMessage.status)
            )
        ).all()
        counts = {status.value: count for status, count in rows}
        print("=== Result ===", counts)
        return 1 if counts.get("FAILED") or counts.get("DEAD") else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
