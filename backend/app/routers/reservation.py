from __future__ import annotations

from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, RedirectResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.deps import get_current_active_member, get_redis_client
from app.core.session import get_member_session
from app.core.time import format_deadline_relative_ko, format_kst_iso
from app.database import get_db
from app.models import Member
from app.schemas.common import TransferRequestBody
from app.services.avatar import avatar_path, has_avatar
from app.services.cycle import resolve_system_state
from app.services import reservation as reservation_service

settings = get_settings()

router = APIRouter(tags=["reservation"])
system_router = APIRouter(prefix="/system", tags=["system"])


@system_router.get("/state")
async def system_state(db: AsyncSession = Depends(get_db)):
    state, cycle = await resolve_system_state(db)
    open_msg = "차주 예약 신청이 가능합니다."
    if cycle and state.value == "OPEN":
        open_msg = f"차주 예약 신청이 가능합니다. ({format_deadline_relative_ko(cycle.close_at)} 마감)"
    reapply_msg = "탈락자 재신청 기간입니다."
    if cycle and state.value == "REAPPLY":
        reapply_msg = f"탈락자 재신청 기간입니다. ({format_deadline_relative_ko(cycle.reapply_close_at)}까지)"
    banners = {
        "BEFORE_OPEN": "다음 예약은 수요일 09:00에 오픈됩니다.",
        "OPEN": open_msg,
        "REAPPLY": reapply_msg,
        "CLOSED": "다음 예약은 수요일 09:00에 오픈됩니다.",
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


@router.get("/mypage/enter")
async def mypage_enter(
    request: Request,
    redis: Redis = Depends(get_redis_client),
    hk_session: Optional[str] = Cookie(alias=settings.session_cookie_name, default=None),
):
    """예약 완료 메일 CTA — 미로그인 시 로그인으로, 로그인 시 마이페이지 예약 내역으로."""
    session_id = hk_session or request.headers.get("X-Session-Id")
    logged_in = False
    if session_id:
        logged_in = bool(await get_member_session(redis, session_id))

    base = settings.app_base_url.rstrip("/")
    if logged_in:
        return RedirectResponse(url=f"{base}/mypage", status_code=302)

    params = urlencode({"returnTo": "/mypage"})
    return RedirectResponse(url=f"{base}/login?{params}", status_code=302)


@router.get("/reapply/enter")
async def reapply_enter(
    request: Request,
    redis: Redis = Depends(get_redis_client),
    hk_session: Optional[str] = Cookie(alias=settings.session_cookie_name, default=None),
):
    """탈락 안내 메일 CTA — 미로그인 시 로그인으로, 로그인 시 재신청 화면으로."""
    session_id = hk_session or request.headers.get("X-Session-Id")
    logged_in = False
    if session_id:
        logged_in = bool(await get_member_session(redis, session_id))

    base = settings.app_base_url.rstrip("/")
    if logged_in:
        return RedirectResponse(url=f"{base}/reapply", status_code=302)

    params = urlencode({"returnTo": "/reapply"})
    return RedirectResponse(url=f"{base}/login?{params}", status_code=302)


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
    page: int = Query(1, ge=1),
    pageSize: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    data = await reservation_service.list_my_reservations(
        db, member, page=page, page_size=pageSize
    )
    return {"data": data}


@router.get("/members/{member_id}/avatar")
async def member_avatar(
    member_id: int,
    _: Member = Depends(get_current_active_member),
):
    """로그인 회원이 다른 회원 아바타를 조회 (양도 후보 목록 등)."""
    if not has_avatar(member_id):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(
        avatar_path(member_id),
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/reservation/{reservation_id}/transfer/recipients")
async def transfer_recipients(
    reservation_id: int,
    q: str = Query("", max_length=100),
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    from app.services.transfer import search_transfer_recipients

    members = await search_transfer_recipients(
        db, member, reservation_id, q=q
    )
    return {"data": {"members": members}}


@router.post("/reservation/{reservation_id}/transfer")
async def request_transfer(
    reservation_id: int,
    body: TransferRequestBody,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    member: Member = Depends(get_current_active_member),
):
    from app.services.transfer import request_transfer as do_request_transfer
    from app.services.teams import deliver_teams_messages

    transfer, teams_message_ids = await do_request_transfer(
        db, member, reservation_id, body.recipientId
    )
    background_tasks.add_task(deliver_teams_messages, teams_message_ids)
    return {
        "data": {
            "transferId": transfer.id,
            "newReservationId": transfer.new_reservation_id,
            "message": "양도가 완료되었습니다.",
        }
    }

