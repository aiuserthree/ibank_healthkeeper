#!/usr/bin/env bash
# 운영 긴급: 7/13(월) 13:30 이희권 확정 복구
# 사용: ./scripts/ops-restore-heegwon-7-13.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/.env" 2>/dev/null || true
HOST="${REMOTE_HOST:-115.68.221.73}"
USER="${REMOTE_USER:-root}"

echo "==> Restore 이희권 on 7/13 13:30 (reservation #177, slot #221)"
ssh "$USER@$HOST" 'cd /opt/healthkeeper/app/backend && .venv/bin/python - <<"PY"
import asyncio
from app.database import AsyncSessionLocal
from app.models import Reservation, Slot, SlotStatus, ReservationStatus, Member

RESERVATION_ID = 177
SLOT_ID = 221
MEMBER_ID = 48

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.get(Reservation, RESERVATION_ID)
        slot = await db.get(Slot, SLOT_ID)
        member = await db.get(Member, MEMBER_ID)
        if not res or not slot or not member:
            raise SystemExit("missing reservation/slot/member")
        if member.name != "이희권":
            raise SystemExit(f"member mismatch: {member.name}")
        if slot.slot_date.isoformat() != "2026-07-13" or slot.start_time.strftime("%H:%M") != "13:30":
            raise SystemExit("slot mismatch")
        if res.status != ReservationStatus.CANCELLED:
            raise SystemExit(f"reservation status is {res.status.value}, expected CANCELLED")
        if slot.status == SlotStatus.CONFIRMED:
            raise SystemExit("slot already confirmed")

        res.status = ReservationStatus.CONFIRMED
        res.cancelled_at = None
        slot.status = SlotStatus.CONFIRMED
        slot.confirmed_reservation_id = RESERVATION_ID
        if member.last_used_date is None or slot.slot_date > member.last_used_date:
            member.last_used_date = slot.slot_date
        await db.commit()
        t = slot.start_time.strftime("%H:%M")
        print(f"OK — {member.name} restored CONFIRMED on {slot.slot_date} {t}")

asyncio.run(main())
PY'

echo "==> Done. 관리자 예약관리 화면에서 7/13 13:30 · 이희권 CONFIRMED 확인하세요."
