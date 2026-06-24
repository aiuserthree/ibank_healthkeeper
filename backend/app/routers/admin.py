from __future__ import annotations

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Body, Cookie, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.deps import get_current_admin, get_redis_client
from app.core.session import create_admin_session, delete_admin_session
from app.database import get_db
from app.models import AdminUser, MailMessage, MailTemplate, MailType
from app.schemas.common import AdminLoginRequest, AdminAssignChangeRequest, AdminAssignRequest, ConfirmRequest, ReapplyMailSendRequest, SettingsUpdateRequest, VacationMonthRequest, VacationRequest
from app.services import admin as admin_service
from app.services.admin_assign import (
    assign_empty_slot,
    admin_assign_mail_status,
    cancel_admin_assign,
    change_admin_assign,
    search_assignable_members,
    send_admin_assign_mail,
)
from app.services.confirm import confirm_reservation, get_slot_detail
from app.services.avatar import avatar_path, has_avatar
from app.services.mail import drain_pending_mails, process_one_mail

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()


@router.post("/login")
async def admin_login(
    body: AdminLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_client),
):
    admin = await admin_service.admin_login(db, body.loginId, body.password)
    remember = body.rememberMe
    session_ttl = (
        settings.admin_session_remember_max_age
        if remember
        else settings.admin_session_short_max_age
    )
    session_id = await create_admin_session(redis, admin.id, max_age=session_ttl)
    cookie_kwargs = {
        "key": settings.admin_session_cookie_name,
        "value": session_id,
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": "lax",
    }
    if remember:
        cookie_kwargs["max_age"] = settings.admin_session_remember_max_age
    response.set_cookie(**cookie_kwargs)
    return {"data": {"adminId": admin.id, "name": admin.name, "loginId": admin.login_id}}


@router.post("/logout")
async def admin_logout(
    response: Response,
    redis: Redis = Depends(get_redis_client),
    hk_admin_session: Annotated[Optional[str], Cookie(alias=settings.admin_session_cookie_name)] = None,
):
    if hk_admin_session:
        await delete_admin_session(redis, hk_admin_session)
    response.delete_cookie(settings.admin_session_cookie_name)
    return {"data": {"message": "로그아웃되었습니다."}}


@router.get("/dashboard")
async def dashboard(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    return {"data": await admin_service.dashboard(db)}


@router.get("/reservations")
async def list_reservations(
    cycle_id: Optional[int] = Query(None, alias="cycleId"),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    return {"data": await admin_service.list_reservations(db, cycle_id)}


@router.get("/reservations/slots/{slot_id}")
async def slot_detail(
    slot_id: int,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    return {"data": await get_slot_detail(db, slot_id)}


@router.post("/reservations/slots/{slot_id}/confirm")
async def confirm_slot(
    slot_id: int,
    body: ConfirmRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    from app.models import ConfirmedBy

    reservation = await confirm_reservation(db, slot_id, body.reservationId, ConfirmedBy.ADMIN)
    for mail_id in drain_pending_mails():
        await process_one_mail(db, mail_id)
    return {"data": {"reservationId": reservation.id, "message": "예약이 확정되었습니다."}}


@router.get("/members/assignable")
async def assignable_members(
    cycle_id: int = Query(..., alias="cycleId"),
    q: str = Query("", max_length=100),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    members = await search_assignable_members(db, cycle_id, q=q)
    return {"data": {"members": members}}


@router.get("/members/{member_id}/avatar")
async def member_avatar(
    member_id: int,
    _: AdminUser = Depends(get_current_admin),
):
    if not has_avatar(member_id):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(
        avatar_path(member_id),
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.post("/reservations/slots/{slot_id}/assign")
async def assign_slot(
    slot_id: int,
    body: AdminAssignRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    reservation = await assign_empty_slot(db, slot_id, body.memberId)
    return {
        "data": {
            "reservationId": reservation.id,
            "message": "관리자 지정으로 예약이 확정되었습니다.",
        }
    }


@router.post("/reservations/{reservation_id}/admin-assign/cancel")
async def cancel_assign(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    await cancel_admin_assign(db, reservation_id)
    return {"data": {"message": "관리자 지정 예약이 취소되었습니다."}}


@router.post("/reservations/{reservation_id}/admin-assign/change")
async def change_assign(
    reservation_id: int,
    body: AdminAssignChangeRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    reservation = await change_admin_assign(
        db,
        reservation_id,
        member_id=body.memberId,
        slot_id=body.slotId,
    )
    return {
        "data": {
            "reservationId": reservation.id,
            "message": "관리자 지정 예약이 변경되었습니다.",
        }
    }


@router.post("/reservations/{reservation_id}/admin-assign/send-mail")
async def send_assign_mail(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    mail_id = await send_admin_assign_mail(db, reservation_id)
    await process_one_mail(db, mail_id)
    return {"data": {"message": "완료 메일이 발송되었습니다."}}


@router.get("/reapply-mail/targets")
async def reapply_targets(
    cycle_id: int = Query(..., alias="cycleId"),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    return {"data": await admin_service.get_reapply_mail_targets(db, cycle_id)}


@router.post("/reapply-mail/send")
async def send_reapply_mail(
    cycle_id: int = Query(..., alias="cycleId"),
    body: ReapplyMailSendRequest = Body(default_factory=ReapplyMailSendRequest),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    member_ids = body.memberIds
    count = await admin_service.send_reapply_notice(db, cycle_id, member_ids)
    for mail_id in drain_pending_mails():
        await process_one_mail(db, mail_id)
    return {"data": {"sentCount": count}}


@router.get("/vacations")
async def list_vacations(
    cycle_id: int = Query(..., alias="cycleId"),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    return {"data": {"dates": await admin_service.list_vacations(db, cycle_id)}}


@router.get("/vacations/month")
async def vacation_month(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    return {"data": await admin_service.vacation_month(db, year, month)}


@router.post("/vacations")
async def create_vacations(
    body: VacationRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    dates = [date.fromisoformat(d) for d in body.dates]
    await admin_service.sync_vacations(db, admin, body.cycleId, dates)
    return {"data": {"message": "휴가가 등록되었습니다."}}


@router.post("/vacations/month")
async def save_vacation_month(
    body: VacationMonthRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    await admin_service.sync_vacations_month(db, admin, body.year, body.month, body.dates)
    return {"data": {"message": "휴가 일정이 저장되었습니다."}}


@router.delete("/vacations")
async def remove_vacation(
    cycle_id: int = Query(..., alias="cycleId"),
    vacation_date: str = Query(..., alias="date"),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    await admin_service.delete_vacation(db, cycle_id, date.fromisoformat(vacation_date))
    return {"data": {"message": "휴가가 삭제되었습니다."}}


@router.get("/settings")
async def get_settings_api(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    return {"data": await admin_service.get_settings(db)}


@router.put("/settings")
async def update_settings_api(
    body: SettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    return {"data": await admin_service.update_settings(db, body.settings)}


@router.get("/mail-templates/{mail_type}")
async def get_mail_template(
    mail_type: MailType,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    from app.services.mail import (
        DEFAULT_SUBJECTS,
        MAIL_HTML_FILES,
        editor_body_template,
        get_template,
        load_design_html,
    )

    tpl = await get_template(db, mail_type)
    subject = (tpl.subject_template if tpl else "") or DEFAULT_SUBJECTS.get(mail_type, "")
    stored_body = (tpl.body_template if tpl else "") or ""
    body = editor_body_template(stored_body, mail_type)

    return {
        "data": {
            "type": mail_type.value,
            "subjectTemplate": subject,
            "bodyTemplate": body,
            "usesDesignHtml": bool(load_design_html(mail_type)),
            "designPreviewPath": f"/이메일/preview/{MAIL_HTML_FILES[mail_type]}"
            if mail_type in MAIL_HTML_FILES
            else None,
        }
    }


@router.put("/mail-templates/{mail_type}")
async def update_mail_template(
    mail_type: MailType,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    result = await db.execute(select(MailTemplate).where(MailTemplate.type == mail_type))
    tpl = result.scalar_one_or_none()
    if not tpl:
        tpl = MailTemplate(type=mail_type, subject_template="", body_template="")
        db.add(tpl)
    tpl.subject_template = (
        body.get("subjectTemplate") or body.get("subject") or tpl.subject_template
    )
    tpl.body_template = body.get("bodyTemplate") or body.get("body") or tpl.body_template
    await db.commit()
    return {"data": {"type": mail_type.value}}


@router.post("/mail-templates/{mail_type}/preview")
async def preview_mail_template_api(
    mail_type: MailType,
    body: dict,
    _: AdminUser = Depends(get_current_admin),
):
    from app.services.mail import preview_mail_template

    subject, html = preview_mail_template(
        mail_type,
        body.get("subjectTemplate") or body.get("subject") or "",
        body.get("bodyTemplate") or body.get("body") or "",
    )
    return {"data": {"subject": subject, "html": html}}


@router.post("/mail/{mail_id}/resend")
async def resend_mail(
    mail_id: int,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    msg = await db.get(MailMessage, mail_id)
    if not msg:
        from app.core.errors import raise_app_error
        raise_app_error("NOT_FOUND", 404)
    from app.models import MailStatus

    msg.status = MailStatus.PENDING
    await db.commit()
    await process_one_mail(db, mail_id)
    return {"data": {"message": "재발송 요청이 접수되었습니다."}}


@router.post("/jobs/{job_name}/run")
async def run_job_manual(
    job_name: str,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin),
):
    from app.services import scheduler as sched

    jobs = {
        "precreate": sched.job_precreate_cycle,
        "open": sched.job_open_cycle,
        "close": sched.job_close_batch,
        "reapply-open": sched.job_reapply_open,
        "reapply-close": sched.job_reapply_close,
        "mail-retry": sched.job_mail_retry,
        "teams-reminder": sched.job_teams_reminder,
    }
    fn = jobs.get(job_name)
    if not fn:
        from app.core.errors import raise_app_error
        raise_app_error("NOT_FOUND", 404)
    await fn(db)
    return {"data": {"message": f"Job {job_name} executed."}}
