from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from sqlalchemy import collate, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import get_settings
from app.core.errors import raise_app_error
from app.core.time import format_kst_iso, now_kst
from app.models import (
    Member,
    MemberStatus,
    Reservation,
    ReservationCycle,
    ReservationStatus,
    ReservationType,
    Slot,
    SwapProposal,
    SwapProposalStatus,
)
from app.services.admin_assign import recompute_member_last_used_date
from app.services.avatar import member_avatar_url
from app.services.transfer import (
    _NAME_COLLATION,
    _TRANSFER_EXCLUDED_EMAIL_DOMAINS,
    _TRANSFER_EXCLUDED_EMAIL_LOCAL,
    _has_pending_transfer,
    _is_mock_entra_oid,
    _is_transfer_excluded_email,
    _transfer_excluded_emails,
    is_transfer_window_open,
    slot_start_dt,
)


class SwapAcceptFailedError(Exception):
    """수락 재검증 실패 — 제안은 FAILED로 닫힌 뒤 Teams 발송용 id를 담아 올린다."""

    def __init__(self, teams_message_ids: list[int]):
        self.teams_message_ids = teams_message_ids
        super().__init__("SWAP_ACCEPT_FAILED")

SWAPPABLE_TYPES = (
    ReservationType.NORMAL,
    ReservationType.REAPPLY,
    ReservationType.TRANSFER,
    ReservationType.ADMIN_ASSIGN,
)

FAIL_REASON_KO = {
    "ALREADY_TRANSFERRED": "상대 예약이 이미 양도·취소되었습니다.",
    "CANCELLED": "상대 예약이 이미 양도·취소되었습니다.",
    "SLOT_STARTED": "예약 시작 시간이 지나 교환할 수 없습니다.",
    "NOT_CONFIRMED": "예약 상태가 변경되어 교환할 수 없습니다.",
    "CONFLICT": "다른 양도·교환과 충돌하여 교환할 수 없습니다.",
    "SLOT_MISMATCH": "예약 상태가 변경되어 교환할 수 없습니다.",
    "MEMBER_MISMATCH": "예약 상태가 변경되어 교환할 수 없습니다.",
}


def can_swap_slots(
    cycle: ReservationCycle,
    proposer_slot: Slot,
    target_slot: Slot,
    now: datetime | None = None,
) -> bool:
    """수 17:00 이후 ~ 양측 슬롯 시작 전."""
    now = now or now_kst()
    if not is_transfer_window_open(cycle, now):
        return False
    return now < slot_start_dt(proposer_slot) and now < slot_start_dt(target_slot)


def _is_swap_org_member(member: Member) -> bool:
    """교환 후보 — 양도와 동일하되 mock SSO 로컬에서는 mock OID 허용."""
    if member.status != MemberStatus.ACTIVE:
        return False
    if not member.entra_oid:
        return False
    settings = get_settings()
    if settings.sso_provider != "mock" and _is_mock_entra_oid(member.entra_oid):
        return False
    if _is_transfer_excluded_email(member.email):
        return False
    allowed = settings.allowed_email_domains()
    if allowed:
        domain = (member.email or "").strip().lower().rsplit("@", 1)[-1]
        if domain not in allowed:
            return False
    return True


async def has_pending_swap_involving(
    db: AsyncSession, reservation_id: int
) -> bool:
    result = await db.execute(
        select(SwapProposal.id)
        .where(SwapProposal.status == SwapProposalStatus.PENDING)
        .where(
            or_(
                SwapProposal.proposer_reservation_id == reservation_id,
                SwapProposal.target_reservation_id == reservation_id,
            )
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_pending_swap_map(
    db: AsyncSession, reservation_ids: list[int]
) -> dict[int, dict]:
    """예약 id → PENDING 교환 제안 메타 (제안자/피제안자 모두)."""
    if not reservation_ids:
        return {}
    Proposer = aliased(Member)
    Target = aliased(Member)
    result = await db.execute(
        select(SwapProposal, Proposer, Target)
        .join(Proposer, Proposer.id == SwapProposal.proposer_member_id)
        .join(Target, Target.id == SwapProposal.target_member_id)
        .where(SwapProposal.status == SwapProposalStatus.PENDING)
        .where(
            or_(
                SwapProposal.proposer_reservation_id.in_(reservation_ids),
                SwapProposal.target_reservation_id.in_(reservation_ids),
            )
        )
    )
    out: dict[int, dict] = {}
    for swap, proposer, target in result.all():
        meta_proposer = {
            "swapId": swap.id,
            "swapRole": "proposer",
            "counterpartName": target.name,
        }
        meta_target = {
            "swapId": swap.id,
            "swapRole": "target",
            "counterpartName": proposer.name,
        }
        if swap.proposer_reservation_id in reservation_ids:
            out[swap.proposer_reservation_id] = meta_proposer
        if swap.target_reservation_id in reservation_ids:
            out[swap.target_reservation_id] = meta_target
    return out


async def count_incoming_pending_swaps(db: AsyncSession, member_id: int) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(SwapProposal)
        .where(SwapProposal.target_member_id == member_id)
        .where(SwapProposal.status == SwapProposalStatus.PENDING)
    )
    return int(result.scalar_one() or 0)


def _slot_payload(reservation_id: int, slot: Slot) -> dict:
    return {
        "reservationId": reservation_id,
        "slotDate": slot.slot_date.isoformat(),
        "startTime": slot.start_time.strftime("%H:%M"),
        "endTime": slot.end_time.strftime("%H:%M"),
    }


async def _lock_reservations(
    db: AsyncSession, id_a: int, id_b: int
) -> dict[int, Reservation]:
    ids = sorted({id_a, id_b})
    result = await db.execute(
        select(Reservation)
        .where(Reservation.id.in_(ids))
        .order_by(Reservation.id)
        .with_for_update()
    )
    rows = list(result.scalars().all())
    if len(rows) != len(ids):
        raise_app_error("NOT_FOUND", 404)
    return {r.id: r for r in rows}


async def _lock_slots(db: AsyncSession, id_a: int, id_b: int) -> dict[int, Slot]:
    ids = sorted({id_a, id_b})
    result = await db.execute(
        select(Slot).where(Slot.id.in_(ids)).order_by(Slot.id).with_for_update()
    )
    rows = list(result.scalars().all())
    if len(rows) != len(ids):
        raise_app_error("NOT_FOUND", 404)
    return {s.id: s for s in rows}


async def search_swap_targets(
    db: AsyncSession,
    member: Member,
    reservation_id: int,
    *,
    q: str = "",
    limit: int = 100,
) -> list[dict]:
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
    reservation, proposer_slot, cycle = row

    if reservation.status != ReservationStatus.CONFIRMED:
        raise_app_error("NOT_SWAPPABLE")
    if reservation.type not in SWAPPABLE_TYPES:
        raise_app_error("NOT_SWAPPABLE")
    if await has_pending_swap_involving(db, reservation.id):
        raise_app_error("SWAP_ALREADY_PENDING")
    if await _has_pending_transfer(db, reservation.id):
        raise_app_error("TRANSFER_IN_PROGRESS")

    now = now_kst()
    if not is_transfer_window_open(cycle, now):
        raise_app_error("NOT_SWAP_PERIOD")
    if now >= slot_start_dt(proposer_slot):
        raise_app_error("SLOT_ALREADY_STARTED")

    # FO는 검색어 입력 후에만 후보를 보여 줌 — 빈 쿼리면 전체 목록을 내려주지 않음
    query = q.strip()
    if not query:
        return []

    pending_proposer_res = select(SwapProposal.proposer_reservation_id).where(
        SwapProposal.status == SwapProposalStatus.PENDING
    )
    pending_target_res = select(SwapProposal.target_reservation_id).where(
        SwapProposal.status == SwapProposalStatus.PENDING
    )
    from app.models import TransferRequest, TransferRequestStatus

    pending_transfer_res = select(TransferRequest.reservation_id).where(
        TransferRequest.status == TransferRequestStatus.PENDING
    )

    excluded_emails = _transfer_excluded_emails()
    allowed_domains = get_settings().allowed_email_domains()
    allow_mock = get_settings().sso_provider == "mock"
    pattern = f"%{query}%"

    stmt = (
        select(Reservation, Slot, Member)
        .join(Slot, Slot.id == Reservation.slot_id)
        .join(Member, Member.id == Reservation.member_id)
        .where(Reservation.cycle_id == cycle.id)
        .where(Reservation.status == ReservationStatus.CONFIRMED)
        .where(Reservation.type.in_(SWAPPABLE_TYPES))
        .where(Reservation.id != reservation.id)
        .where(Reservation.member_id != member.id)
        .where(Member.status == MemberStatus.ACTIVE)
        .where(Member.entra_oid.isnot(None))
        .where(Reservation.id.not_in(pending_proposer_res))
        .where(Reservation.id.not_in(pending_target_res))
        .where(Reservation.id.not_in(pending_transfer_res))
        .where(
            func.lower(func.split_part(Member.email, "@", 1))
            != _TRANSFER_EXCLUDED_EMAIL_LOCAL
        )
        .where(
            ~func.lower(func.split_part(Member.email, "@", 2)).in_(
                list(_TRANSFER_EXCLUDED_EMAIL_DOMAINS)
            )
        )
        .where(
            or_(
                Member.name.ilike(pattern),
                Member.email.ilike(pattern),
                Member.department.ilike(pattern),
            )
        )
        .order_by(Slot.slot_date, Slot.start_time, collate(Member.name, _NAME_COLLATION))
        .limit(min(max(limit, 1), 200))
    )
    if not allow_mock:
        stmt = stmt.where(~func.lower(Member.entra_oid).like("mock-%"))
    if excluded_emails:
        stmt = stmt.where(func.lower(Member.email).not_in(excluded_emails))
    if allowed_domains:
        stmt = stmt.where(
            func.lower(func.split_part(Member.email, "@", 2)).in_(allowed_domains)
        )

    result = await db.execute(stmt)
    members_out: list[dict] = []
    for target_res, target_slot, target_member in result.all():
        if not can_swap_slots(cycle, proposer_slot, target_slot, now):
            continue
        if not _is_swap_org_member(target_member):
            continue
        members_out.append(
            {
                "id": target_member.id,
                "name": target_member.name,
                "email": target_member.email,
                "department": target_member.department,
                "position": target_member.position,
                "avatarUrl": member_avatar_url(target_member.id),
                "reservationId": target_res.id,
                "slotDate": target_slot.slot_date.isoformat(),
                "startTime": target_slot.start_time.strftime("%H:%M"),
                "endTime": target_slot.end_time.strftime("%H:%M"),
            }
        )
    return members_out


async def create_swap_proposal(
    db: AsyncSession,
    member: Member,
    reservation_id: int,
    target_reservation_id: int,
) -> tuple[SwapProposal, list[int]]:
    from app.services.teams import enqueue_swap_proposed_notice

    if reservation_id == target_reservation_id:
        raise_app_error("TARGET_NOT_SWAPPABLE")

    locked = await _lock_reservations(db, reservation_id, target_reservation_id)
    proposer_res = locked[reservation_id]
    target_res = locked[target_reservation_id]

    if proposer_res.member_id != member.id:
        raise_app_error("FORBIDDEN", 403)

    slots = await _lock_slots(db, proposer_res.slot_id, target_res.slot_id)
    proposer_slot = slots[proposer_res.slot_id]
    target_slot = slots[target_res.slot_id]

    cycle = await db.get(ReservationCycle, proposer_res.cycle_id)
    if not cycle or target_res.cycle_id != cycle.id:
        raise_app_error("TARGET_NOT_SWAPPABLE")

    now = now_kst()
    if proposer_res.status != ReservationStatus.CONFIRMED:
        raise_app_error("NOT_SWAPPABLE")
    if proposer_res.type not in SWAPPABLE_TYPES:
        raise_app_error("NOT_SWAPPABLE")
    if target_res.status != ReservationStatus.CONFIRMED:
        raise_app_error("TARGET_NOT_SWAPPABLE")
    if target_res.type not in SWAPPABLE_TYPES:
        raise_app_error("TARGET_NOT_SWAPPABLE")
    if target_res.member_id == member.id:
        raise_app_error("TARGET_NOT_SWAPPABLE")

    if not is_transfer_window_open(cycle, now):
        raise_app_error("NOT_SWAP_PERIOD")
    if now >= slot_start_dt(proposer_slot) or now >= slot_start_dt(target_slot):
        raise_app_error("SLOT_ALREADY_STARTED")

    if await has_pending_swap_involving(db, proposer_res.id):
        raise_app_error("SWAP_ALREADY_PENDING")
    if await has_pending_swap_involving(db, target_res.id):
        raise_app_error("SWAP_ALREADY_PENDING")
    if await _has_pending_transfer(db, proposer_res.id) or await _has_pending_transfer(
        db, target_res.id
    ):
        raise_app_error("TRANSFER_IN_PROGRESS")

    target_member = await db.get(Member, target_res.member_id)
    if not target_member or not _is_swap_org_member(target_member):
        raise_app_error("TARGET_NOT_SWAPPABLE")

    swap = SwapProposal(
        cycle_id=cycle.id,
        proposer_member_id=member.id,
        target_member_id=target_member.id,
        proposer_reservation_id=proposer_res.id,
        target_reservation_id=target_res.id,
        proposer_slot_id=proposer_slot.id,
        target_slot_id=target_slot.id,
        status=SwapProposalStatus.PENDING,
    )
    db.add(swap)
    await db.flush()

    teams_message_ids = await enqueue_swap_proposed_notice(
        db,
        swap=swap,
        proposer=member,
        target=target_member,
        proposer_slot=proposer_slot,
        target_slot=target_slot,
    )
    await db.commit()
    await db.refresh(swap)
    return swap, teams_message_ids


async def list_my_swap_proposals(
    db: AsyncSession,
    member: Member,
    *,
    role: Literal["received", "sent"] = "received",
    status: Optional[str] = "PENDING",
) -> list[dict]:
    ProposerSlot = aliased(Slot)
    TargetSlot = aliased(Slot)
    Proposer = aliased(Member)
    Target = aliased(Member)

    stmt = (
        select(SwapProposal, Proposer, Target, ProposerSlot, TargetSlot)
        .join(Proposer, Proposer.id == SwapProposal.proposer_member_id)
        .join(Target, Target.id == SwapProposal.target_member_id)
        .join(ProposerSlot, ProposerSlot.id == SwapProposal.proposer_slot_id)
        .join(TargetSlot, TargetSlot.id == SwapProposal.target_slot_id)
        .order_by(SwapProposal.requested_at.desc())
    )
    if role == "received":
        stmt = stmt.where(SwapProposal.target_member_id == member.id)
    else:
        stmt = stmt.where(SwapProposal.proposer_member_id == member.id)

    if status:
        try:
            status_enum = SwapProposalStatus(status)
        except ValueError:
            raise_app_error("NOT_FOUND", 404)
        stmt = stmt.where(SwapProposal.status == status_enum)

    result = await db.execute(stmt)
    items = []
    for swap, proposer, target, proposer_slot, target_slot in result.all():
        is_target = member.id == swap.target_member_id
        is_proposer = member.id == swap.proposer_member_id
        pending = swap.status == SwapProposalStatus.PENDING
        my_slot = target_slot if is_target else proposer_slot
        other_slot = proposer_slot if is_target else target_slot
        my_res_id = (
            swap.target_reservation_id if is_target else swap.proposer_reservation_id
        )
        other_res_id = (
            swap.proposer_reservation_id if is_target else swap.target_reservation_id
        )
        items.append(
            {
                "id": swap.id,
                "status": swap.status.value,
                "requestedAt": format_kst_iso(swap.requested_at),
                "proposer": {"id": proposer.id, "name": proposer.name},
                "target": {"id": target.id, "name": target.name},
                "mySlot": _slot_payload(my_res_id, my_slot),
                "otherSlot": _slot_payload(other_res_id, other_slot),
                "actions": {
                    "canAccept": pending and is_target,
                    "canReject": pending and is_target,
                    "canCancel": pending and is_proposer,
                },
            }
        )
    return items


def _accept_fail_reason(
    *,
    proposer_res: Reservation,
    target_res: Reservation,
    swap: SwapProposal,
    cycle: ReservationCycle,
    proposer_slot: Slot,
    target_slot: Slot,
    now: datetime,
) -> Optional[str]:
    if (
        proposer_res.status != ReservationStatus.CONFIRMED
        or target_res.status != ReservationStatus.CONFIRMED
    ):
        if (
            proposer_res.status == ReservationStatus.CANCELLED
            or target_res.status == ReservationStatus.CANCELLED
        ):
            return "CANCELLED"
        return "NOT_CONFIRMED"
    if (
        proposer_res.member_id != swap.proposer_member_id
        or target_res.member_id != swap.target_member_id
    ):
        return "MEMBER_MISMATCH"
    if (
        proposer_res.slot_id != swap.proposer_slot_id
        or target_res.slot_id != swap.target_slot_id
    ):
        return "SLOT_MISMATCH"
    if not is_transfer_window_open(cycle, now):
        return "SLOT_STARTED"
    if now >= slot_start_dt(proposer_slot) or now >= slot_start_dt(target_slot):
        return "SLOT_STARTED"
    return None


async def accept_swap_proposal(
    db: AsyncSession, member: Member, swap_id: int
) -> tuple[SwapProposal, list[int], Optional[dict]]:
    """성공 시 (swap, teams_ids, my_reservation_payload). 실패 시 Teams 후 예외."""
    from app.services.teams import (
        enqueue_swap_accept_failed_notice,
        enqueue_swap_accepted_notices,
    )

    result = await db.execute(
        select(SwapProposal)
        .where(SwapProposal.id == swap_id)
        .with_for_update()
    )
    swap = result.scalar_one_or_none()
    if not swap:
        raise_app_error("NOT_FOUND", 404)
    if swap.status != SwapProposalStatus.PENDING:
        raise_app_error("SWAP_NOT_PENDING")
    if swap.target_member_id != member.id:
        raise_app_error("FORBIDDEN", 403)

    locked = await _lock_reservations(
        db, swap.proposer_reservation_id, swap.target_reservation_id
    )
    proposer_res = locked[swap.proposer_reservation_id]
    target_res = locked[swap.target_reservation_id]
    slots = await _lock_slots(db, swap.proposer_slot_id, swap.target_slot_id)
    proposer_slot = slots[swap.proposer_slot_id]
    target_slot = slots[swap.target_slot_id]
    cycle = await db.get(ReservationCycle, swap.cycle_id)
    if not cycle:
        raise_app_error("NOT_FOUND", 404)

    now = now_kst()
    fail_reason = _accept_fail_reason(
        proposer_res=proposer_res,
        target_res=target_res,
        swap=swap,
        cycle=cycle,
        proposer_slot=proposer_slot,
        target_slot=target_slot,
        now=now,
    )
    if fail_reason is None:
        if await _has_pending_transfer(db, proposer_res.id) or await _has_pending_transfer(
            db, target_res.id
        ):
            fail_reason = "CONFLICT"

    proposer = await db.get(Member, swap.proposer_member_id)
    target = await db.get(Member, swap.target_member_id)
    if not proposer or not target:
        raise_app_error("NOT_FOUND", 404)

    if fail_reason:
        swap.status = SwapProposalStatus.FAILED
        swap.fail_reason = fail_reason
        swap.resolved_at = now
        teams_message_ids = await enqueue_swap_accept_failed_notice(
            db,
            swap=swap,
            proposer=proposer,
            target=target,
            proposer_slot=proposer_slot,
            fail_reason=fail_reason,
        )
        await db.commit()
        raise SwapAcceptFailedError(teams_message_ids)

    # unique(slot_id WHERE CONFIRMED) 회피 — 잠시 비확정으로 내린 뒤 슬롯 맞교환
    proposer_res.status = ReservationStatus.REQUESTED
    target_res.status = ReservationStatus.REQUESTED
    proposer_slot.confirmed_reservation_id = None
    target_slot.confirmed_reservation_id = None
    await db.flush()

    proposer_res.slot_id = target_slot.id
    target_res.slot_id = proposer_slot.id
    await db.flush()

    proposer_res.status = ReservationStatus.CONFIRMED
    target_res.status = ReservationStatus.CONFIRMED
    # 교차 후: proposer_slot에는 target 예약, target_slot에는 proposer 예약
    proposer_slot.confirmed_reservation_id = target_res.id
    target_slot.confirmed_reservation_id = proposer_res.id
    await db.flush()

    await recompute_member_last_used_date(db, proposer)
    await recompute_member_last_used_date(db, target)

    swap.status = SwapProposalStatus.ACCEPTED
    swap.resolved_at = now

    teams_message_ids = await enqueue_swap_accepted_notices(
        db,
        swap=swap,
        proposer=proposer,
        target=target,
        new_proposer_slot=target_slot,
        new_target_slot=proposer_slot,
    )
    await db.commit()
    await db.refresh(swap)

    my_reservation = {
        "id": target_res.id,
        "slotDate": proposer_slot.slot_date.isoformat(),
        "startTime": proposer_slot.start_time.strftime("%H:%M"),
        "endTime": proposer_slot.end_time.strftime("%H:%M"),
    }
    return swap, teams_message_ids, my_reservation


async def reject_swap_proposal(
    db: AsyncSession, member: Member, swap_id: int
) -> tuple[SwapProposal, list[int]]:
    from app.services.teams import enqueue_swap_rejected_notice

    result = await db.execute(
        select(SwapProposal)
        .where(SwapProposal.id == swap_id)
        .with_for_update()
    )
    swap = result.scalar_one_or_none()
    if not swap:
        raise_app_error("NOT_FOUND", 404)
    if swap.status != SwapProposalStatus.PENDING:
        raise_app_error("SWAP_NOT_PENDING")
    if swap.target_member_id != member.id:
        raise_app_error("FORBIDDEN", 403)

    proposer = await db.get(Member, swap.proposer_member_id)
    target = await db.get(Member, swap.target_member_id)
    proposer_slot = await db.get(Slot, swap.proposer_slot_id)
    target_slot = await db.get(Slot, swap.target_slot_id)
    if not proposer or not target or not proposer_slot or not target_slot:
        raise_app_error("NOT_FOUND", 404)

    swap.status = SwapProposalStatus.REJECTED
    swap.resolved_at = now_kst()
    teams_message_ids = await enqueue_swap_rejected_notice(
        db,
        swap=swap,
        proposer=proposer,
        target=target,
        proposer_slot=proposer_slot,
        target_slot=target_slot,
    )
    await db.commit()
    await db.refresh(swap)
    return swap, teams_message_ids


async def cancel_swap_proposal(
    db: AsyncSession, member: Member, swap_id: int
) -> tuple[SwapProposal, list[int]]:
    from app.services.teams import enqueue_swap_cancelled_notice

    result = await db.execute(
        select(SwapProposal)
        .where(SwapProposal.id == swap_id)
        .with_for_update()
    )
    swap = result.scalar_one_or_none()
    if not swap:
        raise_app_error("NOT_FOUND", 404)
    if swap.status != SwapProposalStatus.PENDING:
        raise_app_error("SWAP_NOT_PENDING")
    if swap.proposer_member_id != member.id:
        raise_app_error("FORBIDDEN", 403)

    proposer = await db.get(Member, swap.proposer_member_id)
    target = await db.get(Member, swap.target_member_id)
    target_slot = await db.get(Slot, swap.target_slot_id)
    if not proposer or not target or not target_slot:
        raise_app_error("NOT_FOUND", 404)

    swap.status = SwapProposalStatus.CANCELLED
    swap.resolved_at = now_kst()
    teams_message_ids = await enqueue_swap_cancelled_notice(
        db,
        swap=swap,
        proposer=proposer,
        target=target,
        target_slot=target_slot,
    )
    await db.commit()
    await db.refresh(swap)
    return swap, teams_message_ids
