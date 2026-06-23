#!/usr/bin/env python3
"""Teams 1:1 채팅 알림 로컬 테스트.

사용법:
  ./scripts/test-teams-chat.py you@ibank.co.kr

전제:
  - .env: ENTRA_*, SSO_PROVIDER=entra, TEAMS_SENDER_REFRESH_TOKEN
  - 수신자: 헬스키퍼에 Teams SSO로 한 번 이상 로그인 (entra_oid 저장)
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import Member
from app.services.teams import send_test_chat_to_member


async def main() -> int:
    parser = argparse.ArgumentParser(description="Send a Teams 1:1 test chat message")
    parser.add_argument("email", help="Recipient email (must exist in member table)")
    parser.add_argument(
        "--message",
        help="Optional HTML message body (default: test template)",
    )
    args = parser.parse_args()

    settings = get_settings()
    if not settings.teams_sender_ready():
        print("ERROR: TEAMS_SENDER_REFRESH_TOKEN is missing or SSO is not ready.")
        print("  1) ./scripts/obtain-teams-sender-token.sh")
        print("  2) Add TEAMS_SENDER_REFRESH_TOKEN to .env")
        return 1

    email = args.email.strip().lower()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Member).where(Member.email == email))
        member = result.scalar_one_or_none()
        if not member:
            print(f"ERROR: No member with email {email!r}")
            print("  → Log in at http://localhost:5173/login.html with Teams SSO first")
            return 1

        print(f"Sender:  {settings.teams_sender_email}")
        print(f"To:      {member.name} <{member.email}>")
        print(f"OID:     {member.entra_oid or '(none)'}")
        print("Sending...")

        try:
            chat_id = await send_test_chat_to_member(
                db, member=member, message=args.message
            )
        except Exception as exc:
            print(f"FAILED: {exc}")
            return 1

    print(f"OK — chat_id={chat_id}")
    print("Check Microsoft Teams for a message from healthkeeper@ibank.co.kr")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
