from __future__ import annotations

from typing import Optional

import calendar
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import raise_app_error
from app.core.security import verify_password
from app.core.time import format_kst_iso, now_kst, to_kst
from app.models import (
    AdminUser,
    CycleState,
    MailMessage,
    MailStatus,
    MailType,
    OperationSetting,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    Slot,
    SlotStatus,
    Vacation,
)
from app.services.confirm import get_slot_detail
from app.services.cycle import (
    apply_vacations_to_slots,
    compute_cycle_state,
    create_cycle_for_week,
    get_active_cycle,
    get_admin_view_cycle,
    get_vacation_cycle,
    resolve_system_state,
    week_dates,
    week_friday,
    week_monday,
)
from app.services.mail import enqueue_mail, queue_mail_after_commit
from app.services.priority import needs_manual, rank_applicants
from app.services.reservation import get_empty_slots


def _weekday_ko(d: date) -> str:
    return ["월", "화", "수", "목", "금", "토", "일"][d.weekday()]


def _week_label(week_start: date, week_end: date) -> str:
    return (
        f"이번 주 예약 현황 요약 · {week_start.month}/{week_start.day}({_weekday_ko(week_start)})"
        f" – {week_end.month}/{week_end.day}({_weekday_ko(week_end)})"
    )


def _slot_chip_label(slot_date: date, start_time) -> str:
    return f"{_weekday_ko(slot_date)} {slot_date.month}/{slot_date.day} {start_time.strftime('%H:%M')}"


def _slot_label(slot: Slot) -> str:
    return f"{slot.slot_date.month}/{slot.slot_date.day}({_weekday_ko(slot.slot_date)}) {slot.start_time.strftime('%H:%M')}"


def _reapply_deadline_label(close_at) -> str:
    close_kst = to_kst(close_at)
    now = now_kst()
    delta = (close_kst.date() - now.date()).days
    dow = _weekday_ko(close_kst.date())
    if delta == 0:
        prefix = "오늘"
    elif delta == 1:
        prefix = "내일"
    else:
        prefix = f"{close_kst.month}/{close_kst.day}"
    return f"{prefix}({dow}) {close_kst.strftime('%H:%M')}"


def _reapply_open_label(open_at) -> str:
    open_kst = to_kst(open_at)
    dow = _weekday_ko(open_kst.date())
    return f"{dow}요일 {open_kst.strftime('%H:%M')}"


def _mail_send_status(status: MailStatus) -> str:
    if status == MailStatus.SENT:
        return "success"
    if status in (MailStatus.FAILED, MailStatus.DEAD):
        return "fail"
    return "pending"


async def _reapply_drop_member_ids(db: AsyncSession, cycle_id: int) -> set[int]:
    """해당 주차 탈락만 있고 신청·확정 예약이 없는 회원 (재신청 안내 대상)."""
    dropped = await db.execute(
        select(Reservation.member_id)
        .where(Reservation.cycle_id == cycle_id)
        .where(Reservation.status == ReservationStatus.DROPPED)
        .distinct()
    )
    dropped_ids = {row[0] for row in dropped.all()}
    if not dropped_ids:
        return set()

    active = await db.execute(
        select(Reservation.member_id)
        .where(Reservation.cycle_id == cycle_id)
        .where(
            Reservation.status.in_(
                [ReservationStatus.REQUESTED, ReservationStatus.CONFIRMED]
            )
        )
        .where(Reservation.member_id.in_(dropped_ids))
        .distinct()
    )
    exclude = {row[0] for row in active.all()}
    return dropped_ids - exclude


async def get_reapply_mail_targets(db: AsyncSession, cycle_id: int) -> dict:
    from app.models import Member

    cycle = await db.get(ReservationCycle, cycle_id)
    if not cycle:
        raise_app_error("NOT_FOUND", 404)

    empty = await get_empty_slots(db, cycle_id)
    empty_slots = [
        {
            "id": s.id,
            "slotDate": s.slot_date.isoformat(),
            "startTime": s.start_time.strftime("%H:%M"),
            "label": _slot_chip_label(s.slot_date, s.start_time),
        }
        for s in empty
    ]

    dropped_rows = await db.execute(
        select(Reservation, Member, Slot)
        .join(Member, Member.id == Reservation.member_id)
        .join(Slot, Slot.id == Reservation.slot_id)
        .where(Reservation.cycle_id == cycle_id)
        .where(Reservation.status == ReservationStatus.DROPPED)
        .order_by(Member.name, Reservation.dropped_at.desc())
    )

    eligible_ids = await _reapply_drop_member_ids(db, cycle_id)
    seen: set[int] = set()
    dropped_members: list[dict] = []
    for reservation, member, slot in dropped_rows.all():
        if member.id not in eligible_ids or member.id in seen:
            continue
        seen.add(member.id)

        mail_result = await db.execute(
            select(MailMessage)
            .where(MailMessage.cycle_id == cycle_id)
            .where(MailMessage.type == MailType.DROP_REAPPLY_NOTICE)
            .where(MailMessage.to_member_id == member.id)
            .order_by(MailMessage.created_at.desc())
            .limit(1)
        )
        mail = mail_result.scalar_one_or_none()
        mail_status = _mail_send_status(mail.status) if mail else "pending"

        dropped_members.append(
            {
                "id": member.id,
                "name": member.name,
                "email": member.email,
                "slotLabel": _slot_label(slot),
                "mailStatus": mail_status,
            }
        )

    return {
        "emptySlots": empty_slots,
        "droppedMembers": dropped_members,
        "reapplyDeadline": _reapply_deadline_label(cycle.reapply_close_at),
        "mailSubject": "[헬스키퍼] 탈락 안내 및 재신청 가능 슬롯 안내",
    }


async def _pending_confirmation_slots(db: AsyncSession, cycle_id: int) -> list[dict]:
    slots = await db.execute(
        select(Slot)
        .where(Slot.cycle_id == cycle_id)
        .where(Slot.status != SlotStatus.CONFIRMED)
        .where(Slot.is_vacation.is_(False))
        .order_by(Slot.slot_date, Slot.time_index)
    )
    pending: list[dict] = []
    for slot in slots.scalars().all():
        applicants = await rank_applicants(db, slot.id, requested_only=True)
        if not applicants:
            continue
        pending.append(
            {
                "slotId": slot.id,
                "label": _slot_label(slot),
                "count": len(applicants),
                "noHistory": await needs_manual(db, slot.id),
                "applicants": applicants,
            }
        )
    return pending


async def _mail_breakdown(db: AsyncSession) -> dict:
    rows = await db.execute(
        select(MailMessage.type, MailMessage.status, func.count())
        .group_by(MailMessage.type, MailMessage.status)
    )
    stats = {
        "confirmSent": 0,
        "confirmFail": 0,
        "confirmReapplySent": 0,
        "confirmReapplyFail": 0,
        "reapplySent": 0,
        "reapplyFail": 0,
        "verifySent": 0,
        "verifyFail": 0,
    }
    for mail_type, status, cnt in rows.all():
        sent = status in (MailStatus.SENT, MailStatus.SENDING)
        failed = status in (MailStatus.FAILED, MailStatus.DEAD)
        if mail_type == MailType.RESERVE_DONE_NORMAL:
            if sent:
                stats["confirmSent"] += cnt
            if failed:
                stats["confirmFail"] += cnt
        elif mail_type == MailType.RESERVE_DONE_REAPPLY:
            if sent:
                stats["confirmReapplySent"] += cnt
            if failed:
                stats["confirmReapplyFail"] += cnt
        elif mail_type == MailType.DROP_REAPPLY_NOTICE:
            if sent:
                stats["reapplySent"] += cnt
            if failed:
                stats["reapplyFail"] += cnt
        elif mail_type == MailType.EMAIL_VERIFY:
            if sent:
                stats["verifySent"] += cnt
            if failed:
                stats["verifyFail"] += cnt
    return stats


async def admin_login(db: AsyncSession, login_id: str, password: str) -> AdminUser:
    result = await db.execute(select(AdminUser).where(AdminUser.login_id == login_id))
    admin = result.scalar_one_or_none()
    if not admin or not admin.is_active or not verify_password(password, admin.password_hash):
        raise_app_error("AUTH_FAILED", 401)
    admin.last_login_at = now_kst()
    await db.commit()
    return admin


async def dashboard(db: AsyncSession) -> dict:
    state, _ = await resolve_system_state(db)
    view_cycle = await get_admin_view_cycle(db)
    summary = {"requested": 0, "confirmed": 0, "dropped": 0, "cancelled": 0}
    mail_stats = {"pending": 0, "sent": 0, "failed": 0, "dead": 0}
    slot_stats = {"total": 0, "confirmed": 0, "empty": 0}

    if view_cycle:
        counts = await db.execute(
            select(Reservation.status, func.count())
            .where(Reservation.cycle_id == view_cycle.id)
            .group_by(Reservation.status)
        )
        for status, cnt in counts.all():
            summary[status.value.lower()] = cnt
        summary["total"] = summary.get("requested", 0) + summary.get("confirmed", 0) + summary.get("dropped", 0)
        summary["pending"] = summary.get("requested", 0)

        slots = await db.execute(select(Slot).where(Slot.cycle_id == view_cycle.id))
        slot_list = slots.scalars().all()
        slot_stats["total"] = len(slot_list)
        slot_stats["confirmed"] = sum(1 for s in slot_list if s.status == SlotStatus.CONFIRMED)
        slot_stats["empty"] = sum(
            1 for s in slot_list if s.status != SlotStatus.CONFIRMED and not s.is_vacation
        )

    mail_counts = await db.execute(
        select(MailMessage.status, func.count()).group_by(MailMessage.status)
    )
    for status, cnt in mail_counts.all():
        mail_stats[status.value.lower()] = cnt

    mail_breakdown = await _mail_breakdown(db)
    mail_stats = {**mail_stats, **mail_breakdown}

    vacation_cycle = await get_vacation_cycle(db)
    now = now_kst()
    vacation_locked = (
        vacation_cycle is None
        or vacation_cycle.state != CycleState.BEFORE_OPEN
        or now >= to_kst(vacation_cycle.open_at)
    )

    payload = {
        "state": state.value if state else None,
        "cycleId": view_cycle.id if view_cycle else None,
        "vacationCycleId": vacation_cycle.id if vacation_cycle else None,
        "vacationLocked": vacation_locked,
        "reservations": summary,
        "slots": slot_stats,
        "mail": mail_stats,
    }

    if view_cycle:
        payload["weekDates"] = week_dates(view_cycle.target_week_start)
        payload["weekStart"] = view_cycle.target_week_start.isoformat()
        payload["weekEnd"] = view_cycle.target_week_end.isoformat()
        payload["weekLabel"] = _week_label(view_cycle.target_week_start, view_cycle.target_week_end)
        payload["openAt"] = format_kst_iso(view_cycle.open_at)
        payload["cycleState"] = compute_cycle_state(view_cycle).value
        payload["pendingSlots"] = await _pending_confirmation_slots(db, view_cycle.id)

    if vacation_cycle:
        payload["vacationWeekDates"] = week_dates(vacation_cycle.target_week_start)
        payload["vacationWeekStart"] = vacation_cycle.target_week_start.isoformat()
        payload["vacationWeekEnd"] = vacation_cycle.target_week_end.isoformat()
        payload["vacationOpenAt"] = format_kst_iso(vacation_cycle.open_at)

    return payload


async def reservation_board(db: AsyncSession, cycle_id: Optional[int] = None) -> dict:
    if not cycle_id:
        cycle = await get_admin_view_cycle(db)
        cycle_id = cycle.id if cycle else None
    if not cycle_id:
        return {"weekDates": [], "slots": [], "items": []}

    cycle = await db.get(ReservationCycle, cycle_id)
    if not cycle:
        return {"weekDates": [], "slots": [], "items": []}

    from app.models import Member

    slots_result = await db.execute(
        select(Slot)
        .where(Slot.cycle_id == cycle_id)
        .order_by(Slot.slot_date, Slot.time_index)
    )
    slot_list = slots_result.scalars().all()

    reservations_result = await db.execute(
        select(Reservation, Member)
        .join(Member, Member.id == Reservation.member_id)
        .where(Reservation.cycle_id == cycle_id)
        .order_by(Reservation.applied_at)
    )
    by_slot: dict[int, list[tuple]] = {}
    for reservation, member in reservations_result.all():
        by_slot.setdefault(reservation.slot_id, []).append((reservation, member))

    board_slots = []
    flat_items = []
    for slot in slot_list:
        applicants = []
        pairs = by_slot.get(slot.id, [])
        ranked = await rank_applicants(db, slot.id, requested_only=False) if pairs else []
        rank_map = {a["reservation_id"]: a for a in ranked}
        for reservation, member in pairs:
            rank_info = rank_map.get(reservation.id, {})
            applicant = {
                "id": reservation.id,
                "reservation_id": reservation.id,
                "slotId": slot.id,
                "slotDate": slot.slot_date.isoformat(),
                "timeIndex": slot.time_index,
                "startTime": slot.start_time.strftime("%H:%M"),
                "endTime": slot.end_time.strftime("%H:%M"),
                "member_name": member.name,
                "member_email": member.email,
                "last_used_date": member.last_used_date.isoformat() if member.last_used_date else None,
                "no_history": member.last_used_date is None,
                "type": reservation.type.value,
                "status": reservation.status.value,
                "applied_at": format_kst_iso(reservation.applied_at),
                "priority_rank": rank_info.get("priority_rank"),
                "is_priority": reservation.is_priority,
            }
            applicants.append(applicant)
            flat_items.append(applicant)

        board_slots.append(
            {
                "slotId": slot.id,
                "slotDate": slot.slot_date.isoformat(),
                "timeIndex": slot.time_index,
                "startTime": slot.start_time.strftime("%H:%M"),
                "endTime": slot.end_time.strftime("%H:%M"),
                "isVacation": slot.is_vacation,
                "status": slot.status.value,
                "applicants": applicants,
            }
        )

    return {
        "weekDates": week_dates(cycle.target_week_start),
        "weekStart": cycle.target_week_start.isoformat(),
        "weekEnd": cycle.target_week_end.isoformat(),
        "slots": board_slots,
        "items": flat_items,
    }


async def list_reservations(db: AsyncSession, cycle_id: Optional[int] = None) -> dict:
    return await reservation_board(db, cycle_id)


async def sync_vacations(
    db: AsyncSession, admin: AdminUser, cycle_id: int, dates: list[date]
) -> None:
    cycle = await db.get(ReservationCycle, cycle_id)
    if not cycle:
        raise_app_error("NOT_FOUND", 404)
    if cycle.state != CycleState.BEFORE_OPEN or now_kst() >= to_kst(cycle.open_at):
        raise_app_error("VACATION_LOCKED")

    target_dates = set(dates)
    existing = await db.execute(select(Vacation).where(Vacation.cycle_id == cycle_id))
    existing_vacs = list(existing.scalars().all())
    existing_dates = {vac.vacation_date for vac in existing_vacs}
    for vac in existing_vacs:
        if vac.vacation_date not in target_dates:
            await db.delete(vac)
    for d in target_dates:
        if d not in existing_dates:
            db.add(Vacation(cycle_id=cycle_id, vacation_date=d, created_by=admin.id))

    week_end = cycle.target_week_end
    week_start = cycle.target_week_start
    slots = await db.execute(select(Slot).where(Slot.cycle_id == cycle_id))
    for slot in slots.scalars().all():
        in_week = week_start <= slot.slot_date <= week_end
        slot.is_vacation = in_week and slot.slot_date in target_dates

    await db.commit()


async def register_vacation(
    db: AsyncSession, admin: AdminUser, cycle_id: int, dates: list[date]
) -> None:
    cycle = await db.get(ReservationCycle, cycle_id)
    if not cycle:
        raise_app_error("NOT_FOUND", 404)
    if cycle.state not in (CycleState.BEFORE_OPEN,):
        raise_app_error("VACATION_LOCKED")

    for d in dates:
        existing = await db.execute(
            select(Vacation).where(Vacation.cycle_id == cycle_id).where(Vacation.vacation_date == d)
        )
        if not existing.scalar_one_or_none():
            db.add(Vacation(cycle_id=cycle_id, vacation_date=d, created_by=admin.id))
    await apply_vacations_to_slots(db, cycle_id)
    await db.commit()


async def delete_vacation(db: AsyncSession, cycle_id: int, vacation_date: date) -> None:
    cycle = await db.get(ReservationCycle, cycle_id)
    if not cycle or cycle.state != CycleState.BEFORE_OPEN or now_kst() >= to_kst(cycle.open_at):
        raise_app_error("VACATION_LOCKED")
    result = await db.execute(
        select(Vacation).where(Vacation.cycle_id == cycle_id).where(Vacation.vacation_date == vacation_date)
    )
    vac = result.scalar_one_or_none()
    if vac:
        await db.delete(vac)
        slots = await db.execute(
            select(Slot).where(Slot.cycle_id == cycle_id).where(Slot.slot_date == vacation_date)
        )
        for slot in slots.scalars().all():
            slot.is_vacation = False
        await db.commit()


async def list_vacations(db: AsyncSession, cycle_id: int) -> list[str]:
    result = await db.execute(select(Vacation.vacation_date).where(Vacation.cycle_id == cycle_id))
    return [d.isoformat() for d in result.scalars().all()]


async def _get_or_create_cycle(db: AsyncSession, monday: date) -> ReservationCycle:
    result = await db.execute(
        select(ReservationCycle).where(ReservationCycle.target_week_start == monday)
    )
    cycle = result.scalar_one_or_none()
    if cycle:
        return cycle
    return await create_cycle_for_week(db, monday, CycleState.BEFORE_OPEN)


def _is_vacation_date_locked(d: date, cycle: Optional[ReservationCycle], now) -> bool:
    """이번 주·과거 주차 또는 예약 오픈(수 09:00 KST) 이후 주차는 휴가 수정 불가."""
    now = to_kst(now)
    today = now.date()
    if week_monday(d) <= week_monday(today):
        return True
    if cycle and now >= to_kst(cycle.open_at):
        return True
    return False


def _is_vacation_week_locked(monday: date, cycle: ReservationCycle, now) -> bool:
    now = to_kst(now)
    if monday <= week_monday(now.date()):
        return True
    if now >= to_kst(cycle.open_at):
        return True
    return False


async def vacation_month(db: AsyncSession, year: int, month: int) -> dict:
    now = now_kst()
    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])

    cycles_result = await db.execute(
        select(ReservationCycle)
        .where(ReservationCycle.target_week_start <= month_end)
        .where(ReservationCycle.target_week_end >= month_start)
    )
    cycles = list(cycles_result.scalars().all())
    cycle_by_monday = {c.target_week_start: c for c in cycles}
    cycle_ids = [c.id for c in cycles]

    vacation_dates: set[date] = set()
    if cycle_ids:
        vac_result = await db.execute(
            select(Vacation.vacation_date).where(Vacation.cycle_id.in_(cycle_ids))
        )
        vacation_dates = set(vac_result.scalars().all())

    cal = calendar.Calendar(firstweekday=6)
    weeks = []
    vacation_count = 0
    editable_count = 0
    locked_count = 0

    for week in cal.monthdatescalendar(year, month):
        row = []
        for d in week:
            in_month = d.month == month
            is_service = in_month and d.weekday() < 5
            cycle = cycle_by_monday.get(week_monday(d)) if is_service else None
            locked = True
            cycle_id = None
            is_vacation = False

            if is_service:
                if cycle:
                    cycle_id = cycle.id
                locked = _is_vacation_date_locked(d, cycle, now)
                is_vacation = d in vacation_dates
                if is_vacation:
                    vacation_count += 1
                if locked:
                    locked_count += 1
                else:
                    editable_count += 1

            row.append(
                {
                    "date": d.isoformat(),
                    "inMonth": in_month,
                    "isServiceDay": is_service,
                    "cycleId": cycle_id,
                    "locked": locked,
                    "isVacation": is_vacation,
                    "weekStart": week_monday(d).isoformat() if is_service else None,
                }
            )
        weeks.append(row)

    return {
        "year": year,
        "month": month,
        "weeks": weeks,
        "summary": {
            "vacationDays": vacation_count,
            "editableDays": editable_count,
            "lockedDays": locked_count,
        },
    }


async def sync_vacations_month(
    db: AsyncSession, admin: AdminUser, year: int, month: int, dates: list[str]
) -> None:
    now = now_kst()
    target_vacations = {date.fromisoformat(d) for d in dates}
    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])

    mondays: set[date] = set()
    cursor = month_start
    while cursor <= month_end:
        if cursor.weekday() < 5:
            mondays.add(week_monday(cursor))
        cursor += timedelta(days=1)

    for mon in sorted(mondays):
        cycle = await _get_or_create_cycle(db, mon)
        if _is_vacation_week_locked(mon, cycle, now):
            week_end = week_friday(mon)
            attempted = {d for d in target_vacations if mon <= d <= week_end}
            if attempted:
                raise_app_error("VACATION_LOCKED")
            continue

        week_end = week_friday(mon)
        week_target = sorted(d for d in target_vacations if mon <= d <= week_end)
        await sync_vacations(db, admin, cycle.id, week_target)


async def get_settings(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(OperationSetting))
    return {row.setting_key: row.setting_value for row in result.scalars().all()}


async def update_settings(db: AsyncSession, updates: dict[str, str]) -> dict[str, str]:
    for key, value in updates.items():
        row = await db.get(OperationSetting, key)
        if row:
            row.setting_value = value
        else:
            db.add(OperationSetting(setting_key=key, setting_value=value))
    await db.commit()
    return await get_settings(db)


async def send_reapply_notice(
    db: AsyncSession, cycle_id: int, member_ids: Optional[list[int]] = None
) -> int:
    from app.models import Member

    cycle = await db.get(ReservationCycle, cycle_id)
    if not cycle:
        raise_app_error("NOT_FOUND", 404)

    empty = await get_empty_slots(db, cycle_id)
    empty_text = ", ".join(_slot_chip_label(s.slot_date, s.start_time) for s in empty)
    chip_style = (
        "display:inline-block;margin:0 6px 6px 0;padding:6px 12px;"
        "background:#ffffff;border:1px solid #d4e0ed;border-radius:999px;"
        "font-size:13px;color:#0b3558;"
    )
    empty_html = "".join(
        f'<span style="{chip_style}">{_slot_chip_label(s.slot_date, s.start_time)}</span>'
        for s in empty
    ) or f'<span style="{chip_style}">없음</span>'
    reapply_open = _reapply_open_label(cycle.reapply_open_at)
    deadline = _reapply_deadline_label(cycle.reapply_close_at)

    eligible_ids = await _reapply_drop_member_ids(db, cycle_id)
    if member_ids:
        target_ids = eligible_ids.intersection(member_ids)
    else:
        target_ids = eligible_ids

    count = 0
    for member_id in sorted(target_ids):
        member = await db.get(Member, member_id)
        if not member:
            continue
        mail = await enqueue_mail(
            db,
            mail_type=MailType.DROP_REAPPLY_NOTICE,
            to_email=member.email,
            to_member_id=member.id,
            cycle_id=cycle_id,
            context={
                "name": member.name,
                "emptySlots": empty_text or "없음",
                "emptySlotsHtml": empty_html,
                "reapplyOpenAt": reapply_open,
                "reapplyDeadline": deadline,
            },
            dedupe_key=f"drop:{cycle_id}:{member_id}",
        )
        if mail:
            queue_mail_after_commit(mail.id)
            count += 1
    await db.commit()
    return count
