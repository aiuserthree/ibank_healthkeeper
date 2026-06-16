from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_member
from app.core.time import format_kst_iso
from app.database import get_db
from app.models import Member
from app.services.cycle import resolve_system_state
from app.services import reservation as reservation_service

router = APIRouter(tags=["reservation"])
system_router = APIRouter(prefix="/system", tags=["system"])


@system_router.get("/state")
async def system_state(db: AsyncSession = Depends(get_db)):
    state, cycle = await resolve_system_state(db)
    banners = {
        "BEFORE_OPEN": "이번 주 예약은 수요일 09:00에 오픈됩니다.",
        "OPEN": "차주 예약 신청이 가능합니다. (오늘 17:00 마감)",
        "REAPPLY": "탈락자 재신청 기간입니다. (내일 17:00까지)",
        "CLOSED": "현재 예약 접수 기간이 아닙니다. 다음 오픈: 수요일 09:00",
    }
    return {
        "data": {
            "state": state.value,
            "message": banners.get(state.value, ""),
            "cycleId": cycle.id if cycle else None,
            "openAt": format_kst_iso(cycle.open_at) if cycle else None,
            "closeAt": format_kst_iso(cycle.close_at) if cycle else None,
            "reapplyOpenAt": format_kst_iso(cycle.reapply_open_at) if cycle else None,
            "reapplyCloseAt": format_kst_iso(cycle.reapply_close_at) if cycle else None,
        }
    }


@router.get("/reservation/calendar")
async def calendar(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    data = await reservation_service.get_calendar(db, member)
    return {"data": data}


@router.post("/reservation/slots/{slot_id}/apply")
async def apply_slot(
    slot_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    reservation = await reservation_service.apply_slot(db, member, slot_id)
    return {
        "data": {
            "reservationId": reservation.id,
            "status": reservation.status.value,
            "message": "신청이 접수되었습니다. (관리자 확정 후 예약이 완료됩니다.)",
        }
    }


@router.post("/reservation/{reservation_id}/cancel")
async def cancel_reservation(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    await reservation_service.cancel_reservation(db, member, reservation_id)
    return {"data": {"message": "신청이 취소되었습니다."}}


@router.get("/reservation/reapply/slots")
async def reapply_slots(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    from app.services.cycle import resolve_system_state
    from app.services.reservation import get_empty_slots, is_dropped_member

    state, cycle = await resolve_system_state(db)
    if not cycle or not await is_dropped_member(db, member.id, cycle.id):
        from app.core.errors import raise_app_error
        raise_app_error("NOT_DROPPED_USER", 403)
    slots = await get_empty_slots(db, cycle.id)
    return {
        "data": {
            "slots": [
                {
                    "id": s.id,
                    "slotDate": s.slot_date.isoformat(),
                    "timeIndex": s.time_index,
                    "startTime": s.start_time.strftime("%H:%M"),
                    "endTime": s.end_time.strftime("%H:%M"),
                }
                for s in slots
            ]
        }
    }


@router.post("/reservation/reapply/slots/{slot_id}")
async def reapply_slot(
    slot_id: int,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    from app.services.mail import drain_pending_mails, process_one_mail

    reservation = await reservation_service.reapply_slot(db, member, slot_id)
    for mail_id in drain_pending_mails():
        await process_one_mail(db, mail_id)
    return {
        "data": {
            "reservationId": reservation.id,
            "status": reservation.status.value,
            "message": "예약이 확정되었습니다. (재신청 건은 취소할 수 없습니다.)",
        }
    }


@router.get("/me/reservations")
async def my_reservations(
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    items = await reservation_service.list_my_reservations(db, member)
    return {"data": {"items": items}}
