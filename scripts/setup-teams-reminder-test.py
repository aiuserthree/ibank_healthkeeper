#!/usr/bin/env python3
"""로컬 Teams 리마인더 E2E 테스트 — 오늘 CONFIRMED 예약 + 슬롯 시작 시각을 N분 뒤로 설정.

사용법:
  ./scripts/setup-teams-reminder-test.py jhcho@3ibank.com
  ./scripts/setup-teams-reminder-test.py jhcho@3ibank.com --trigger   # 설정 직후 잡 1회 실행

전제:
  - ./scripts/dev.sh 실행 중 (스케줄러 job_teams_reminder 매 1분)
  - TEAMS_SENDER_REFRESH_TOKEN 또는 .teams-sender-refresh
  - 수신자 entra_oid (Teams SSO 로그인 1회)
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import delete, select

from app.config import get_settings
from app.core.time import KST, now_kst
from app.database import AsyncSessionLocal
from app.models import (
    ConfirmedBy,
    Member,
    Reservation,
    ReservationStatus,
    ReservationType,
    Slot,
    SlotStatus,
    TeamsMessage,
)
from app.services.scheduler import job_teams_reminder
from app.services.teams import _slot_starts_in_minutes


def _round_up_minute(dt: datetime) -> datetime:
    dt = dt.replace(second=0, microsecond=0)
    if dt <= now_kst():
        dt += timedelta(minutes=1)
    return dt


async def setup_test(
    db,
    *,
    email: str,
    minutes_before: int,
) -> tuple[Member, Slot, Reservation]:
    result = await db.execute(select(Member).where(Member.email == email))
    member = result.scalar_one_or_none()
    if not member:
        raise RuntimeError(f"No member {email!r} — log in via Teams SSO first")
    if not member.entra_oid:
        raise RuntimeError(f"{email} has no entra_oid — log in via Teams SSO first")

    today = now_kst().date()
    now = now_kst()
    slot_dt = _round_up_minute(now + timedelta(minutes=minutes_before))
    end_dt = slot_dt + timedelta(minutes=30)

    existing = await db.execute(
        select(Reservation, Slot)
        .join(Slot, Reservation.slot_id == Slot.id)
        .where(Reservation.member_id == member.id)
        .where(Reservation.status == ReservationStatus.CONFIRMED)
        .where(Slot.slot_date == today)
        .limit(1)
    )
    row = existing.one_or_none()
    if row:
        reservation, slot = row
        slot.start_time = slot_dt.time()
        slot.end_time = end_dt.time()
        reservation.confirmed_at = now
    else:
        slot_result = await db.execute(
            select(Slot)
            .where(Slot.slot_date == today)
            .where(Slot.is_vacation.is_(False))
            .where(Slot.status == SlotStatus.OPEN)
            .order_by(Slot.time_index)
            .limit(1)
        )
        slot = slot_result.scalar_one_or_none()
        if not slot:
            raise RuntimeError(
                f"No OPEN slot for today ({today}) — run dev-seed or open a cycle"
            )

        slot.start_time = slot_dt.time()
        slot.end_time = end_dt.time()

        reservation = Reservation(
            slot_id=slot.id,
            member_id=member.id,
            cycle_id=slot.cycle_id,
            type=ReservationType.NORMAL,
            status=ReservationStatus.CONFIRMED,
            applied_at=now,
            confirmed_at=now,
            confirmed_by=ConfirmedBy.ADMIN,
        )
        db.add(reservation)
        await db.flush()

        slot.status = SlotStatus.CONFIRMED
        slot.confirmed_reservation_id = reservation.id

    await db.execute(
        delete(TeamsMessage).where(
            TeamsMessage.dedupe_key == f"teams-reminder:{reservation.id}"
        )
    )
    await db.commit()
    await db.refresh(slot)
    await db.refresh(reservation)
    return member, slot, reservation


async def main() -> int:
    parser = argparse.ArgumentParser(description="Set up local Teams reminder E2E test")
    parser.add_argument("email", help="Recipient member email")
    parser.add_argument(
        "--minutes",
        type=int,
        default=None,
        help="Minutes before slot start to trigger (default: TEAMS_REMINDER_MINUTES_BEFORE)",
    )
    parser.add_argument(
        "--trigger",
        action="store_true",
        help="Run job_teams_reminder once after setup (dev server scheduler still recommended)",
    )
    args = parser.parse_args()

    settings = get_settings()
    if not settings.teams_sender_ready():
        print("ERROR: Teams sender not configured (.env TEAMS_SENDER_REFRESH_TOKEN)")
        return 1

    minutes_before = args.minutes if args.minutes is not None else settings.teams_reminder_minutes_before
    email = args.email.strip().lower()

    async with AsyncSessionLocal() as db:
        member, slot, reservation = await setup_test(
            db, email=email, minutes_before=minutes_before
        )

        now = now_kst()
        in_window = _slot_starts_in_minutes(slot, now, minutes_before)

        print("=== Teams reminder test setup ===")
        print(f"Member:      {member.name} <{member.email}>")
        print(f"Reservation: #{reservation.id} CONFIRMED")
        print(f"Slot:        #{slot.id} {slot.slot_date} {slot.start_time.strftime('%H:%M')}–{slot.end_time.strftime('%H:%M')}")
        print(f"Trigger:     {minutes_before} min before start (window: {minutes_before - 1}–{minutes_before + 1} min)")
        print(f"Now (KST):   {now.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"In window:   {'yes — next scheduler tick should send' if in_window else 'not yet — wait for scheduler'}")

        if args.trigger:
            print("\nRunning job_teams_reminder once...")
            await job_teams_reminder(db)
            sent = (
                await db.execute(
                    select(TeamsMessage)
                    .where(TeamsMessage.reservation_id == reservation.id)
                    .order_by(TeamsMessage.id.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if sent and sent.status.value == "SENT":
                print(f"OK — Teams message sent (teams_message #{sent.id})")
            elif sent:
                print(f"PENDING/FAILED — teams_message #{sent.id} status={sent.status.value}")
                if sent.last_error:
                    print(f"  error: {sent.last_error[:300]}")
            else:
                print("No teams_message queued — not in trigger window yet; wait ~1 min")

    print("\nKeep dev server running. Check Teams chat from healthkeeper@ibank.co.kr")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
