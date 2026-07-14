from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import collate, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import raise_app_error
from app.core.time import KST, format_kst_iso, now_kst, to_kst
from app.models import (
    AdminUser,
    ConfirmedBy,
    Member,
    MemberStatus,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    ReservationType,
    Slot,
    SlotStatus,
    TransferRequest,
    TransferRequestStatus,
)
from app.services.admin_assign import recompute_member_last_used_date
from app.services.avatar import member_avatar_url
from app.services.reservation import ACTIVE_APPLY_STATUSES, _member_cycle_active_apply

# DB 기본 collation(en_US)은 한글 가나다 순이 깨지므로 ICU 한국어 정렬 사용
_NAME_COLLATION = "ko-KR-x-icu"

TRANSFERABLE_TYPES = (ReservationType.NORMAL, ReservationType.REAPPLY)

TRANSFER_ADMIN_NOTIFY_EMAILS = (
    "yshong@3ibank.com",
    "jhcho@3ibank.com",
)

# Teams/SMTP 발송용 시스템 계정 — 양도 수신자로 노출·선택되지 않도록 제외
_TRANSFER_EXCLUDED_EMAIL_LOCAL = "healthkeeper"
# 로컬 시드/데모 계정 도메인 (scripts/dev-seed-reservations.py 등)
_TRANSFER_EXCLUDED_EMAIL_DOMAINS = frozenset({"healthkeeper.local"})


def _transfer_excluded_emails() -> set[str]:
    settings = get_settings()
    emails = {
        (settings.teams_sender_email or "").strip().lower(),
        (settings.smtp_user or "").strip().lower(),
        (settings.smtp_from or "").strip().lower(),
    }
    return {e for e in emails if e and "@" in e}


def _email_domain(email: str | None) -> str:
    value = (email or "").strip().lower()
    if "@" not in value:
        return ""
    return value.rsplit("@", 1)[-1]


def _is_mock_entra_oid(entra_oid: str | None) -> bool:
    """MockSSOProvider(mock-001 …) — 실제 Entra OID가 아님."""
    return bool(entra_oid) and entra_oid.lower().startswith("mock-")


def _is_allowed_org_email(email: str | None) -> bool:
    """SSO_ALLOWED_DOMAIN에 맞는 실제 조직 이메일만 허용.

    도메인이 비어 있으면(미설정) 도메인 제한은 건너뛰고,
    mock OID / healthkeeper.local 제외는 별도 검사한다.
    """
    value = (email or "").strip().lower()
    if not value or "@" not in value:
        return False
    domain = _email_domain(value)
    if domain in _TRANSFER_EXCLUDED_EMAIL_DOMAINS:
        return False
    allowed = get_settings().allowed_email_domains()
    if not allowed:
        return True
    return domain in allowed


def _is_transfer_excluded_email(email: str | None) -> bool:
    value = (email or "").strip().lower()
    if not value or "@" not in value:
        return False
    local, _, domain = value.partition("@")
    if local == _TRANSFER_EXCLUDED_EMAIL_LOCAL:
        return True
    if domain in _TRANSFER_EXCLUDED_EMAIL_DOMAINS:
        return True
    return value in _transfer_excluded_emails()


def _is_transfer_org_member(member: Member) -> bool:
    """양도 후보로 쓸 수 있는 실제 iBank(허용 도메인) SSO 회원인지."""
    if member.status != MemberStatus.ACTIVE:
        return False
    if not member.entra_oid or _is_mock_entra_oid(member.entra_oid):
        return False
    if _is_transfer_excluded_email(member.email):
        return False
    if not _is_allowed_org_email(member.email):
        return False
    return True


def transfer_window_start(cycle: ReservationCycle) -> datetime:
    """양도 가능 시작: 재신청 마감(목 17:00) 이후."""
    return to_kst(cycle.reapply_close_at)


def slot_start_dt(slot: Slot) -> datetime:
    return datetime.combine(slot.slot_date, slot.start_time, tzinfo=KST)


def can_transfer_slot(
    cycle: ReservationCycle, slot: Slot, now: datetime | None = None
) -> bool:
    """목 17:00 이후 ~ 해당 슬롯 시작 전까지 양도 가능."""
    now = now or now_kst()
    return transfer_window_start(cycle) <= now < slot_start_dt(slot)


def transfer_meta(cycle: ReservationCycle, slot: Slot) -> dict:
    start = transfer_window_start(cycle)
    end = slot_start_dt(slot)
    return {
        "canTransfer": can_transfer_slot(cycle, slot),
        "transferFrom": format_kst_iso(start),
        "transferUntil": format_kst_iso(end),
    }


async def _get_transferable_reservation(
    db: AsyncSession, member: Member, reservation_id: int
) -> tuple[Reservation, Slot, ReservationCycle]:
    result = await db.execute(
        select(Reservation, Slot, ReservationCycle)
        .join(Slot, Slot.id == Reservation.slot_id)
        .join(ReservationCycle, ReservationCycle.id == Reservation.cycle_id)
        .where(Reservation.id == reservation_id)
        .where(Reservation.member_id == member.id)
    )
    row = result.one_or_none()
    if not row:
        raise_app_error("NOT_FOUND", 404)
    reservation, slot, cycle = row
    if reservation.status != ReservationStatus.CONFIRMED:
        raise_app_error("NOT_TRANSFERABLE")
    if reservation.type not in TRANSFERABLE_TYPES:
        raise_app_error("NOT_TRANSFERABLE")
    if not can_transfer_slot(cycle, slot):
        raise_app_error("NOT_TRANSFER_PERIOD")
    return reservation, slot, cycle


async def _has_pending_transfer(db: AsyncSession, reservation_id: int) -> bool:
    result = await db.execute(
        select(TransferRequest.id)
        .where(TransferRequest.reservation_id == reservation_id)
        .where(TransferRequest.status == TransferRequestStatus.PENDING)
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _get_recipient_member(
    db: AsyncSession,
    recipient_id: int,
    *,
    cycle_id: int,
    donor_id: int,
) -> Member:
    member = await db.get(Member, recipient_id)
    if not member or not _is_transfer_org_member(member):
        raise_app_error("MEMBER_NOT_TRANSFERABLE")
    if member.id == donor_id:
        raise_app_error("MEMBER_NOT_TRANSFERABLE")
    if await _member_cycle_active_apply(db, member.id, cycle_id):
        raise_app_error("MEMBER_NOT_TRANSFERABLE")
    return member


async def search_transfer_recipients(
    db: AsyncSession,
    member: Member,
    reservation_id: int,
    *,
    q: str = "",
    limit: int = 100,
) -> list[dict]:
    reservation, slot, cycle = await _get_transferable_reservation(
        db, member, reservation_id
    )
    _ = reservation

    confirmed_member_ids = select(Reservation.member_id).where(
        Reservation.cycle_id == cycle.id,
        Reservation.status.in_(ACTIVE_APPLY_STATUSES),
    )

    excluded_emails = _transfer_excluded_emails()
    allowed_domains = get_settings().allowed_email_domains()
    stmt = (
        select(Member)
        .where(Member.status == MemberStatus.ACTIVE)
        # 실제 Teams SSO(Entra) 로그인 회원만 — mock-* OID·시드 계정 제외
        .where(Member.entra_oid.isnot(None))
        .where(~func.lower(Member.entra_oid).like("mock-%"))
        .where(Member.id != member.id)
        .where(Member.id.not_in(confirmed_member_ids))
        # Teams/SMTP 발송 계정(healthkeeper@…)·로컬 시드 도메인 제외
        .where(
            func.lower(func.split_part(Member.email, "@", 1))
            != _TRANSFER_EXCLUDED_EMAIL_LOCAL
        )
        .where(
            ~func.lower(func.split_part(Member.email, "@", 2)).in_(
                list(_TRANSFER_EXCLUDED_EMAIL_DOMAINS)
            )
        )
        .order_by(collate(Member.name, _NAME_COLLATION), Member.id)
        .limit(min(max(limit, 1), 200))
    )
    if excluded_emails:
        stmt = stmt.where(func.lower(Member.email).not_in(excluded_emails))
    # SSO_ALLOWED_DOMAIN(ibank.co.kr, 3ibank.com, …) — 조직 외 이메일 제외
    if allowed_domains:
        stmt = stmt.where(
            func.lower(func.split_part(Member.email, "@", 2)).in_(allowed_domains)
        )
    query = q.strip()
    if query:
        from sqlalchemy import or_

        pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                Member.name.ilike(pattern),
                Member.email.ilike(pattern),
                Member.department.ilike(pattern),
            )
        )

    result = await db.execute(stmt)
    return [
        {
            "id": m.id,
            "name": m.name,
            "email": m.email,
            "department": m.department,
            "position": m.position,
            "avatarUrl": member_avatar_url(m.id),
        }
        for m in result.scalars().all()
    ]


async def _complete_transfer(
    db: AsyncSession,
    *,
    transfer: TransferRequest,
    reservation: Reservation,
    slot: Slot,
    cycle: ReservationCycle,
    donor: Member,
    recipient: Member,
    admin: AdminUser | None = None,
) -> list[int]:
    """양도인 예약 취소 → 양수인 TRANSFER 확정 생성 → Teams 완료 알림."""
    from app.services.teams import enqueue_transfer_completed_notices

    now = now_kst()
    reservation.status = ReservationStatus.CANCELLED
    reservation.cancelled_at = now
    await recompute_member_last_used_date(db, donor)

    new_reservation = Reservation(
        slot_id=slot.id,
        member_id=recipient.id,
        cycle_id=cycle.id,
        type=ReservationType.TRANSFER,
        status=ReservationStatus.CONFIRMED,
        applied_at=now,
        confirmed_at=now,
        confirmed_by=ConfirmedBy.TRANSFER,
    )
    db.add(new_reservation)
    await db.flush()

    slot.confirmed_reservation_id = new_reservation.id
    slot.status = SlotStatus.CONFIRMED

    if recipient.last_used_date is None or slot.slot_date > recipient.last_used_date:
        recipient.last_used_date = slot.slot_date

    transfer.status = TransferRequestStatus.APPROVED
    transfer.new_reservation_id = new_reservation.id
    transfer.resolved_by_admin_id = admin.id if admin else None
    transfer.resolved_at = now

    return await enqueue_transfer_completed_notices(
        db,
        transfer=transfer,
        donor=donor,
        recipient=recipient,
        slot=slot,
    )


async def request_transfer(
    db: AsyncSession,
    member: Member,
    reservation_id: int,
    recipient_id: int,
) -> tuple[TransferRequest, list[int]]:
    """회원 양도 — 관리자 승인 없이 즉시 완료."""
    if await _has_pending_transfer(db, reservation_id):
        raise_app_error("TRANSFER_ALREADY_PENDING")

    reservation_result = await db.execute(
        select(Reservation, Slot, ReservationCycle)
        .join(Slot, Slot.id == Reservation.slot_id)
        .join(ReservationCycle, ReservationCycle.id == Reservation.cycle_id)
        .where(Reservation.id == reservation_id)
        .where(Reservation.member_id == member.id)
        .with_for_update(of=Reservation)
    )
    row = reservation_result.one_or_none()
    if not row:
        raise_app_error("NOT_FOUND", 404)
    reservation, slot, cycle = row

    slot_result = await db.execute(
        select(Slot).where(Slot.id == slot.id).with_for_update()
    )
    slot = slot_result.scalar_one()

    if reservation.status != ReservationStatus.CONFIRMED:
        raise_app_error("NOT_TRANSFERABLE")
    if reservation.type not in TRANSFERABLE_TYPES:
        raise_app_error("NOT_TRANSFERABLE")
    if not can_transfer_slot(cycle, slot):
        raise_app_error("NOT_TRANSFER_PERIOD")

    recipient = await _get_recipient_member(
        db,
        recipient_id,
        cycle_id=cycle.id,
        donor_id=member.id,
    )

    transfer = TransferRequest(
        reservation_id=reservation.id,
        donor_member_id=member.id,
        recipient_member_id=recipient.id,
        cycle_id=cycle.id,
        slot_id=slot.id,
        status=TransferRequestStatus.PENDING,
    )
    db.add(transfer)
    await db.flush()

    teams_message_ids = await _complete_transfer(
        db,
        transfer=transfer,
        reservation=reservation,
        slot=slot,
        cycle=cycle,
        donor=member,
        recipient=recipient,
        admin=None,
    )
    await db.commit()
    await db.refresh(transfer)
    return transfer, teams_message_ids


async def list_pending_transfers(
    db: AsyncSession, cycle_id: Optional[int] = None
) -> list[dict]:
    """레거시 PENDING 양도(승인제 시절) 조회 — 신규 흐름에서는 보통 비어 있음."""
    from sqlalchemy.orm import aliased

    Donor = aliased(Member)
    Recipient = aliased(Member)
    stmt = (
        select(TransferRequest, Reservation, Slot, Donor, Recipient)
        .join(Reservation, Reservation.id == TransferRequest.reservation_id)
        .join(Slot, Slot.id == TransferRequest.slot_id)
        .join(Donor, Donor.id == TransferRequest.donor_member_id)
        .join(Recipient, Recipient.id == TransferRequest.recipient_member_id)
        .where(TransferRequest.status == TransferRequestStatus.PENDING)
        .order_by(TransferRequest.requested_at.asc())
    )
    if cycle_id is not None:
        stmt = stmt.where(TransferRequest.cycle_id == cycle_id)

    result = await db.execute(stmt)
    items = []
    for transfer, reservation, slot, donor, recipient in result.all():
        items.append(
            {
                "id": transfer.id,
                "reservationId": reservation.id,
                "cycleId": transfer.cycle_id,
                "slotDate": slot.slot_date.isoformat(),
                "startTime": slot.start_time.strftime("%H:%M"),
                "endTime": slot.end_time.strftime("%H:%M"),
                "reservationType": reservation.type.value,
                "requestedAt": format_kst_iso(transfer.requested_at),
                "donor": {
                    "id": donor.id,
                    "name": donor.name,
                    "email": donor.email,
                    "department": donor.department,
                },
                "recipient": {
                    "id": recipient.id,
                    "name": recipient.name,
                    "email": recipient.email,
                    "department": recipient.department,
                },
            }
        )
    return items


async def approve_transfer(
    db: AsyncSession, admin: AdminUser, transfer_id: int
) -> tuple[TransferRequest, list[int]]:
    """레거시 PENDING 양도 수동 승인(신규 흐름에서는 사용하지 않음)."""
    result = await db.execute(
        select(TransferRequest)
        .where(TransferRequest.id == transfer_id)
        .where(TransferRequest.status == TransferRequestStatus.PENDING)
        .with_for_update()
    )
    transfer = result.scalar_one_or_none()
    if not transfer:
        raise_app_error("NOT_FOUND", 404)

    reservation_result = await db.execute(
        select(Reservation, Slot, ReservationCycle)
        .join(Slot, Slot.id == Reservation.slot_id)
        .join(ReservationCycle, ReservationCycle.id == Reservation.cycle_id)
        .where(Reservation.id == transfer.reservation_id)
        .with_for_update(of=Reservation)
    )
    row = reservation_result.one_or_none()
    if not row:
        raise_app_error("NOT_FOUND", 404)
    reservation, slot, cycle = row

    slot_result = await db.execute(
        select(Slot).where(Slot.id == slot.id).with_for_update()
    )
    slot = slot_result.scalar_one()

    if reservation.status != ReservationStatus.CONFIRMED:
        raise_app_error("NOT_TRANSFERABLE")
    if reservation.member_id != transfer.donor_member_id:
        raise_app_error("NOT_TRANSFERABLE")
    if not can_transfer_slot(cycle, slot):
        raise_app_error("NOT_TRANSFER_PERIOD")

    donor = await db.get(Member, transfer.donor_member_id)
    recipient = await _get_recipient_member(
        db,
        transfer.recipient_member_id,
        cycle_id=cycle.id,
        donor_id=transfer.donor_member_id,
    )
    if not donor:
        raise_app_error("NOT_FOUND", 404)

    teams_message_ids = await _complete_transfer(
        db,
        transfer=transfer,
        reservation=reservation,
        slot=slot,
        cycle=cycle,
        donor=donor,
        recipient=recipient,
        admin=admin,
    )
    await db.commit()
    await db.refresh(transfer)
    return transfer, teams_message_ids


async def reject_transfer(
    db: AsyncSession, admin: AdminUser, transfer_id: int
) -> TransferRequest:
    """레거시 PENDING 양도 반려(신규 흐름에서는 사용하지 않음)."""
    result = await db.execute(
        select(TransferRequest)
        .where(TransferRequest.id == transfer_id)
        .where(TransferRequest.status == TransferRequestStatus.PENDING)
        .with_for_update()
    )
    transfer = result.scalar_one_or_none()
    if not transfer:
        raise_app_error("NOT_FOUND", 404)

    transfer.status = TransferRequestStatus.REJECTED
    transfer.resolved_by_admin_id = admin.id
    transfer.resolved_at = now_kst()
    await db.commit()
    await db.refresh(transfer)
    return transfer


async def get_pending_transfer_map(
    db: AsyncSession, reservation_ids: list[int]
) -> dict[int, dict]:
    """레거시 PENDING 표시용 — 즉시 완료 흐름에서는 보통 비어 있음."""
    if not reservation_ids:
        return {}
    from sqlalchemy.orm import aliased

    Recipient = aliased(Member)
    result = await db.execute(
        select(TransferRequest, Recipient)
        .join(Recipient, Recipient.id == TransferRequest.recipient_member_id)
        .where(TransferRequest.reservation_id.in_(reservation_ids))
        .where(TransferRequest.status == TransferRequestStatus.PENDING)
    )
    out: dict[int, dict] = {}
    for transfer, recipient in result.all():
        out[transfer.reservation_id] = {
            "transferId": transfer.id,
            "recipientName": recipient.name,
        }
    return out
