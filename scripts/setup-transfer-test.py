#!/usr/bin/env python3
"""로컬 양도(전달) E2E 테스트 — 조준형 확정 예약 + 양수 가능 회원 + 양도 가능 시간대.

사용법:
  ./scripts/setup-transfer-test.py
  ./scripts/setup-transfer-test.py jhcho@3ibank.com

전제:
  - ./scripts/dev.sh 실행 중
  - 양도인: Teams SSO 로그인 1회 (entra_oid)
  - 관리자: admin / ibank1234!@#$
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import delete, select

from app.core.time import KST, now_kst, now_utc
from app.database import AsyncSessionLocal
from app.models import (
    ConfirmedBy,
    CycleState,
    Member,
    MemberStatus,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    ReservationType,
    Slot,
    SlotStatus,
    TransferRequest,
)
from app.services.transfer import can_transfer_slot

DONOR_EMAIL_DEFAULT = "jhcho@3ibank.com"

# 양수인 후보 (Teams SSO entra_oid 필요 — 로컬 mock)
RECIPIENT_CANDIDATES = [
    ("demo.transfer.a@healthkeeper.local", "양수후보A", "mock-transfer-a", "디지털혁신부", "대리", date(2025, 8, 1), False),
    ("demo.transfer.b@healthkeeper.local", "양수후보B", "mock-transfer-b", "인사팀", "과장", date(2025, 6, 15), False),
    ("demo.transfer.c@healthkeeper.local", "양수후보C", "mock-transfer-c", "IT운영팀", "차장", None, False),
    ("demo.transfer.dropped@healthkeeper.local", "탈락후보", "mock-transfer-dropped", "기획팀", "대리", date(2025, 3, 1), True),
]

# 관리자 Teams 알림 수신용 (member + entra_oid)
ADMIN_NOTIFY_MEMBERS = [
    ("yshong@3ibank.com", "홍윤선", "mock-admin-yshong", "디지털혁신부", "부장", None),
]


async def _find_service_cycle(db) -> ReservationCycle | None:
    """차주(또는 가장 가까운) 이용 주차 사이클."""
    now = now_kst()
    result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.target_week_start >= now.date())
        .order_by(ReservationCycle.target_week_start.asc())
        .limit(1)
    )
    cycle = result.scalar_one_or_none()
    if cycle:
        return cycle
    result = await db.execute(
        select(ReservationCycle).order_by(ReservationCycle.target_week_start.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def _get_member(db, email: str) -> Member:
    result = await db.execute(select(Member).where(Member.email == email))
    member = result.scalar_one_or_none()
    if not member:
        raise RuntimeError(
            f"No member {email!r} — log in via Teams SSO (or mock) first"
        )
    if not member.entra_oid:
        raise RuntimeError(f"{email} has no entra_oid — log in via Teams SSO first")
    return member


async def _upsert_recipient(
    db,
    email: str,
    name: str,
    entra_oid: str,
    department: str,
    position: str,
    last_used: date | None,
) -> Member:
    result = await db.execute(select(Member).where(Member.email == email))
    member = result.scalar_one_or_none()
    if not member:
        member = Member(
            email=email,
            name=name,
            department=department,
            position=position,
            status=MemberStatus.ACTIVE,
            entra_oid=entra_oid,
            last_used_date=last_used,
        )
        db.add(member)
    else:
        member.name = name
        member.department = department
        member.position = position
        member.status = MemberStatus.ACTIVE
        member.entra_oid = entra_oid
        if last_used is not None:
            member.last_used_date = last_used
    await db.flush()
    return member


async def _pick_slot(db, cycle_id: int, *, day_offset: int = 1, time_index: int = 3) -> Slot:
    cycle = await db.get(ReservationCycle, cycle_id)
    if not cycle:
        raise RuntimeError(f"Cycle #{cycle_id} not found")
    slot_date = cycle.target_week_start + timedelta(days=day_offset)
    result = await db.execute(
        select(Slot)
        .where(Slot.cycle_id == cycle_id)
        .where(Slot.slot_date == slot_date)
        .where(Slot.time_index == time_index)
        .where(Slot.is_vacation.is_(False))
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise RuntimeError(f"No slot cycle={cycle_id} date={slot_date} time_index={time_index}")
    return slot


async def setup_transfer_test(db, *, donor_email: str) -> dict:
    donor = await _get_member(db, donor_email)
    cycle = await _find_service_cycle(db)
    if not cycle:
        raise RuntimeError("No reservation cycle — run ./scripts/dev.sh first")

    now = now_kst()

    # 양도 가능 시간대: 재신청 마감을 1시간 전으로 (목 17:00 이후 시뮬레이션)
    cycle.reapply_close_at = (now - timedelta(hours=1)).astimezone(now_utc().tzinfo)
    cycle.state = CycleState.CLOSED
    cycle.reapply_closed_at = cycle.reapply_closed_at or now_utc()

    # 기존 양도 신청·해당 사이클 donor 예약 정리
    await db.execute(delete(TransferRequest).where(TransferRequest.donor_member_id == donor.id))
    existing = await db.execute(
        select(Reservation)
        .where(Reservation.member_id == donor.id)
        .where(Reservation.cycle_id == cycle.id)
        .where(Reservation.status != ReservationStatus.CANCELLED)
    )
    for res in existing.scalars().all():
        slot = await db.get(Slot, res.slot_id)
        if slot and slot.confirmed_reservation_id == res.id:
            slot.status = SlotStatus.OPEN
            slot.confirmed_reservation_id = None
        res.status = ReservationStatus.CANCELLED
        res.cancelled_at = now

    slot = await _pick_slot(db, cycle.id, day_offset=1, time_index=3)

    # 슬롯 확정 예약 전부 취소 (이전 양도 승인 잔여 포함)
    slot_confirmed = await db.execute(
        select(Reservation)
        .where(Reservation.slot_id == slot.id)
        .where(Reservation.status == ReservationStatus.CONFIRMED)
    )
    for old in slot_confirmed.scalars().all():
        old.status = ReservationStatus.CANCELLED
        old.cancelled_at = now
    slot.status = SlotStatus.OPEN
    slot.confirmed_reservation_id = None
    await db.flush()

    reservation = Reservation(
        slot_id=slot.id,
        member_id=donor.id,
        cycle_id=cycle.id,
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

    if donor.last_used_date is None or slot.slot_date > donor.last_used_date:
        donor.last_used_date = slot.slot_date

    recipients = []
    for email, name, oid, dept, pos, last_used, as_dropped in RECIPIENT_CANDIDATES:
        m = await _upsert_recipient(db, email, name, oid, dept, pos, last_used)
        # 해당 주차 확정·신청대기 제거 (탈락 건은 as_dropped=True 시 유지)
        active = await db.execute(
            select(Reservation)
            .where(Reservation.member_id == m.id)
            .where(Reservation.cycle_id == cycle.id)
            .where(Reservation.status.in_((ReservationStatus.REQUESTED, ReservationStatus.CONFIRMED)))
        )
        for r in active.scalars().all():
            s = await db.get(Slot, r.slot_id)
            if s and s.confirmed_reservation_id == r.id:
                s.status = SlotStatus.OPEN
                s.confirmed_reservation_id = None
            r.status = ReservationStatus.CANCELLED
            r.cancelled_at = now
        if as_dropped:
            dropped_slot = await _pick_slot(db, cycle.id, day_offset=0, time_index=1)
            existing = await db.execute(
                select(Reservation)
                .where(Reservation.member_id == m.id)
                .where(Reservation.cycle_id == cycle.id)
                .where(Reservation.status == ReservationStatus.DROPPED)
            )
            for r in existing.scalars().all():
                r.status = ReservationStatus.CANCELLED
                r.cancelled_at = now
            db.add(
                Reservation(
                    slot_id=dropped_slot.id,
                    member_id=m.id,
                    cycle_id=cycle.id,
                    type=ReservationType.NORMAL,
                    status=ReservationStatus.DROPPED,
                    applied_at=now,
                    dropped_at=now,
                )
            )
        recipients.append(m)

    for email, name, oid, dept, pos, last_used in ADMIN_NOTIFY_MEMBERS:
        await _upsert_recipient(db, email, name, oid, dept, pos, last_used)

    await db.commit()
    await db.refresh(cycle)
    await db.refresh(reservation)
    await db.refresh(slot)
    await db.refresh(donor)

    transferable = can_transfer_slot(cycle, slot)

    return {
        "donor": donor,
        "cycle": cycle,
        "reservation": reservation,
        "slot": slot,
        "recipients": recipients,
        "transferable": transferable,
    }


async def main() -> int:
    parser = argparse.ArgumentParser(description="Set up local transfer E2E test data")
    parser.add_argument("email", nargs="?", default=DONOR_EMAIL_DEFAULT, help="Donor member email")
    args = parser.parse_args()
    email = args.email.strip().lower()

    async with AsyncSessionLocal() as db:
        data = await setup_transfer_test(db, donor_email=email)

    donor = data["donor"]
    cycle = data["cycle"]
    reservation = data["reservation"]
    slot = data["slot"]
    recipients = data["recipients"]

    print("=== 양도 테스트 데이터 설정 완료 ===")
    print(f"양도인:     {donor.name} <{donor.email}> (member #{donor.id})")
    print(f"예약:       #{reservation.id} CONFIRMED · {reservation.type.value}")
    print(
        f"슬롯:       #{slot.id} {slot.slot_date} "
        f"{slot.start_time.strftime('%H:%M')}–{slot.end_time.strftime('%H:%M')}"
    )
    print(f"사이클:     #{cycle.id} {cycle.target_week_start}~{cycle.target_week_end} ({cycle.state.value})")
    print(f"양도 가능:  {'예' if data['transferable'] else '아니오'}")
    print(f"양수 후보:  {len(recipients)}명")
    for m in recipients:
        print(f"  · {m.name} <{m.email}>")
    print()
    print("--- 테스트 방법 ---")
    print("1. 회원 로그인: http://localhost:5173/login → SSO (조준형 계정)")
    print("2. 마이페이지:   http://localhost:5173/mypage → 확정 카드 [양도 신청]")
    print("3. 관리자:       http://localhost:5173/admin/login")
    print("                 ID: admin  /  PW: ibank1234!@#$")
    print("4. 양도 승인:    http://localhost:5173/admin/reservations → 상단 [양도 신청 대기]")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
