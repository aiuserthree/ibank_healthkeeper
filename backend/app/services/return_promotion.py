"""반납 자리 자동 확정 — 회원 본인 반납과 같은 트랜잭션에서 실행한다.

같은 시간대에 신청했다가 마감 때 탈락(DROPPED)한 분 중 지금 받을 수 있는 분을
마감과 같은 우선권 순서로 골라, 그분의 탈락 행을 확정(CONFIRMED)으로 바꾸고
왜 확정됐는지 적은 메일을 보낸다.
- 우선권: 마지막 이용일이 오래된 순(이용 이력 없음이 최우선) → 먼저 신청한 순 → id
  마감 정렬(priority.rank_applicants)에서 무적 쿠폰 단계만 뺀 것이다.
  탈락 때 쿠폰은 이미 돌려받았으므로, 여기서 쿠폰을 1순위로 두면 쓰지 않은 쿠폰으로 우선권을 얻게 된다.
- 쿠폰은 쓰지도 · 소멸시키지도 · 돌려주지도 않는다(쿠폰 행은 읽지도 바꾸지도 않음).
- 받을 수 있는 분: 회원 ACTIVE + 그 주에 신청·확정(REQUESTED/CONFIRMED)이 없는 분 (재신청 자격과 같음)
  단, 그 주 예약을 직접 반납한 분은 뺀다 — 이번 주 이용을 스스로 내놓은 분에게 동의 없이 다시 확정하지 않는다
  (월 1회 반납을 이미 써서 이 확정은 반납도 못 한다). 원하면 지금처럼 재신청으로 직접 받을 수 있다.
- 마감이 자동 확정하지 않는 시간대는 건너뛴다: 수동 확정 모드 · 월 15:30 지정 확정 · 휴가 · 공휴일 · 이미 시작
- 커밋은 하지 않는다 — 반납과 자동 확정은 같이 성공하거나 같이 실패한다(호출부가 한 번만 커밋).
"""

from __future__ import annotations

import html
import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional, Union

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.time import KST, to_kst
from app.models import (
    ConfirmedBy,
    MailType,
    Member,
    MemberStatus,
    Reservation,
    ReservationStatus,
    Slot,
    SlotStatus,
)
from app.services.admin_assign import recompute_member_last_used_date
from app.services.mail import enqueue_mail, format_slot_date_kr, queue_mail_after_commit
from app.services.reservation import ACTIVE_APPLY_STATUSES

logger = logging.getLogger(__name__)

# 자동 확정을 건너뛴 이유 — 관리자 반납 알림 문구에 쓴다
SKIP_MANUAL_MODE = "MANUAL_MODE"
SKIP_DESIGNATED_SLOT = "DESIGNATED_SLOT"
SKIP_SLOT_OFF = "SLOT_OFF"
SKIP_SLOT_STARTED = "SLOT_STARTED"
SKIP_NO_CANDIDATE = "NO_CANDIDATE"
SKIP_ALL_FAILED = "ALL_FAILED"

# 확정 사유 — 1위와 바로 다음 자격자가 처음 갈리는 우선권 키
REASON_SOLE_ONLY = "SOLE_ONLY"  # 탈락자가 그분 한 명
REASON_SOLE_ELIGIBLE = "SOLE_ELIGIBLE"  # 탈락자는 여럿이지만 지금 받을 수 있는 분이 그분뿐
REASON_NO_HISTORY = "NO_HISTORY"  # 이용 이력 없음
REASON_OLDEST = "OLDEST"  # 마지막 이용일이 가장 오래됨
REASON_EARLIER_NO_HISTORY = "EARLIER_NO_HISTORY"  # 이력 없음끼리 → 먼저 신청
REASON_EARLIER_SAME_DATE = "EARLIER_SAME_DATE"  # 마지막 이용일이 같음 → 먼저 신청


@dataclass(frozen=True)
class PromotionCandidate:
    """후보 스냅샷 — 세이브포인트를 롤백하면 ORM 객체가 만료되므로 값만 복사해 둔다."""

    reservation_id: int
    member_id: int
    name: str
    email: str
    last_used_date: Optional[date]
    applied_at: datetime


@dataclass(frozen=True)
class PromotionResult:
    reservation_id: int
    member_id: int
    reason: str
    candidate_count: int
    mail_id: Optional[int]

    @property
    def promoted(self) -> bool:
        return True


@dataclass(frozen=True)
class PromotionSkip:
    reason: str

    @property
    def promoted(self) -> bool:
        return False


PromotionOutcome = Union[PromotionResult, PromotionSkip]


class _NotEligible(Exception):
    """잠근 뒤 다시 보니 받을 수 없는 분(그사이 탈퇴 등) — 세이브포인트를 되돌리고 다음 분으로."""


def promotion_key(c: PromotionCandidate) -> tuple:
    """우선권 정렬 키 — SQL ORDER BY(last_used_date NULLS FIRST → applied_at → id)와 같다."""
    return (
        c.last_used_date is not None,
        c.last_used_date or date.min,
        c.applied_at,
        c.reservation_id,
    )


def explain_promotion(
    top: PromotionCandidate,
    runner_up: Optional[PromotionCandidate],
    *,
    dropped_total: int,
) -> str:
    """사전식 정렬이라 1위와 바로 다음 자격자가 처음 갈리는 키가 결정적인 사유다."""
    if runner_up is None:
        return REASON_SOLE_ONLY if dropped_total <= 1 else REASON_SOLE_ELIGIBLE
    kt, kr = promotion_key(top), promotion_key(runner_up)
    if kt[0] != kr[0]:
        return REASON_NO_HISTORY
    if kt[1] != kr[1]:
        return REASON_OLDEST
    # 신청 시각·id 동률까지 포함 — 「먼저 신청」으로 안내
    return REASON_EARLIER_NO_HISTORY if top.last_used_date is None else REASON_EARLIER_SAME_DATE


def _mail_text(value: str) -> str:
    """메일 HTML에 넣는 값 — HTML 이스케이프 + 템플릿 치환 중괄호 무력화."""
    return html.escape(value or "").replace("{", "&#123;").replace("}", "&#125;")


def _datetime_label_kr(dt: datetime) -> str:
    kst = to_kst(dt)
    return f"{format_slot_date_kr(kst.date())} {kst.strftime('%H:%M')}"


def promotion_reason_html(
    reason: str,
    *,
    name: str,
    last_used_date: Optional[date],
    returned_at: datetime,
    today: date,
) -> str:
    """회원 메일 「확정 사유」 두 줄 — 다른 분의 이름·날짜는 넣지 않는다."""
    who = f"<b>{_mail_text(name)}님</b>"
    # 반납한 분이 처음 확정자가 아닐 수 있다(자동 확정·양도·교환·재신청·관리자 지정 뒤 반납) — 「처음」은 쓰지 않는다
    first = f"· 확정됐던 분이 {_datetime_label_kr(returned_at)}에 예약을 반납했어요."
    if reason == REASON_SOLE_ONLY:
        second = f"· 이 시간대에 함께 신청하셨던 분 중 남아 계신 분이 {who} 한 분이었어요."
    elif reason == REASON_SOLE_ELIGIBLE:
        second = f"· 함께 신청하셨던 분 중 지금 이 시간대를 받으실 수 있는 분이 {who}뿐이었어요."
    elif reason == REASON_NO_HISTORY:
        second = f"· {who}은 이용 이력이 없어 남은 신청자 중 우선권이 가장 높았어요."
    elif reason == REASON_OLDEST:
        # 마지막 이용일은 우선권용이라 다음 주 확정일이 들어 있을 수 있다 — 지난 날짜일 때만 적는다.
        # 올해가 아니면 연도를 붙인다(작년 12월 20일이 다가올 날짜처럼 읽히지 않게)
        if last_used_date and last_used_date < today:
            ymd = f"{last_used_date.month}월 {last_used_date.day}일"
            if last_used_date.year != today.year:
                ymd = f"{last_used_date.year}년 {ymd}"
            when = f"({ymd})"
        else:
            when = ""
        second = f"· 남은 신청자 중 {who}의 마지막 이용일{when}이 가장 오래돼 우선권이 가장 높았어요."
    elif reason == REASON_EARLIER_NO_HISTORY:
        second = f"· 이용 이력이 없는 분이 여럿이라, 그중 가장 먼저 신청하신 {who}이 우선이었어요."
    else:
        second = f"· 마지막 이용일이 같은 분이 여럿이라, 그중 가장 먼저 신청하신 {who}이 우선이었어요."
    return f"{first}<br>\n          {second}"


async def _skip_reason(db: AsyncSession, slot: Slot, now: datetime) -> Optional[str]:
    """마감 로직이 자동 확정하지 않는 시간대면 이유 코드, 아니면 None."""
    from app.services.cycle import get_setting
    from app.services.designated_slot import is_designated_confirm_slot
    from app.services.korean_holidays import is_public_holiday

    if await get_setting(db, "confirm.mode", "AUTO") != "AUTO":
        return SKIP_MANUAL_MODE
    if is_designated_confirm_slot(slot):
        return SKIP_DESIGNATED_SLOT
    if slot.is_vacation or is_public_holiday(slot.slot_date):
        return SKIP_SLOT_OFF
    # 반납은 시작 2시간 전까지라 실제로는 생기지 않지만 방어용
    if to_kst(now) >= datetime.combine(slot.slot_date, slot.start_time, tzinfo=KST):
        return SKIP_SLOT_STARTED
    return None


async def _load_candidates(db: AsyncSession, slot: Slot) -> list[PromotionCandidate]:
    """같은 슬롯 탈락 행 중 지금 받을 수 있는 분 — 행 잠금(FOR UPDATE) 후 우선권 순."""
    other = aliased(Reservation)
    busy_this_week = (
        select(other.id)
        .where(other.member_id == Reservation.member_id)
        # 반납은 다음 주 사이클이 열린 수~금에도 일어난다 — 활성 사이클이 아니라 슬롯의 주차 기준
        .where(other.cycle_id == slot.cycle_id)
        .where(other.status.in_(ACTIVE_APPLY_STATUSES))
        .exists()
    )
    # 그 주 예약을 직접 반납한 분(예: 재신청 확정분을 반납한 탈락자)은 자동 확정하지 않는다 —
    # 이번 주 이용을 스스로 내놓았고, 월 1회 반납을 이미 써서 원치 않는 확정을 되돌릴 수도 없다
    returned = aliased(Reservation)
    returned_this_week = (
        select(returned.id)
        .where(returned.member_id == Reservation.member_id)
        .where(returned.cycle_id == slot.cycle_id)
        .where(returned.returned_at.isnot(None))
        .exists()
    )
    rows = (
        await db.execute(
            select(Reservation, Member)
            .join(Member, Member.id == Reservation.member_id)
            .where(Reservation.slot_id == slot.id)
            .where(Reservation.status == ReservationStatus.DROPPED)
            .where(Member.status == MemberStatus.ACTIVE)
            .where(~busy_this_week)
            .where(~returned_this_week)
            .order_by(
                Member.last_used_date.asc().nulls_first(),
                Reservation.applied_at.asc(),
                Reservation.id.asc(),
            )
            .with_for_update(of=Reservation)
            # Slot.reservations(selectin)로 탈락 행이 이미 identity map에 있다 — 잠근 뒤 값으로 덮어쓴다
            .execution_options(populate_existing=True)
        )
    ).all()
    candidates = [
        PromotionCandidate(
            reservation_id=res.id,
            member_id=mem.id,
            name=mem.name,
            email=mem.email,
            last_used_date=mem.last_used_date,
            applied_at=res.applied_at,
        )
        for res, mem in rows
    ]
    # 사유 계산과 어긋나지 않게 같은 키로 한 번 더 정렬
    return sorted(candidates, key=promotion_key)


async def promote_after_return(
    db: AsyncSession,
    *,
    slot: Slot,
    returned: Reservation,
    now: datetime,
) -> PromotionOutcome:
    """반납으로 빈 슬롯을 같은 시간대 탈락자에게 자동 확정한다 (커밋 없음).

    호출 전제: 반납 예약 → 슬롯 순으로 이미 FOR UPDATE 잠금, 반납 변경은 flush 됨.
    잠금 순서: 반납 예약 → 슬롯 → 탈락 예약들 → 후보 회원 (다른 흐름은 탈락 행을 잠그지 않는다).
    """
    # 남은 변경을 세이브포인트 밖에서 먼저 내보낸다 — 세이브포인트 안에서 autoflush 되면
    # 롤백 때 함께 되돌아가 버린다(반납자 마지막 이용일 재계산 등)
    await db.flush()

    skip = await _skip_reason(db, slot, now)
    if skip:
        return PromotionSkip(skip)

    ordered = await _load_candidates(db, slot)
    if not ordered:
        return PromotionSkip(SKIP_NO_CANDIDATE)

    # 사유 문구용 — 회원 상태와 상관없이 같은 슬롯의 탈락 행 수
    dropped_total = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Reservation)
                .where(Reservation.slot_id == slot.id)
                .where(Reservation.status == ReservationStatus.DROPPED)
            )
        ).scalar_one()
        or 0
    )

    slot_date = slot.slot_date
    start_label = slot.start_time.strftime("%H:%M")
    slot_time = f"{start_label} – {slot.end_time.strftime('%H:%M')}"

    for i, c in enumerate(ordered):
        try:
            async with db.begin_nested():
                res = await db.get(Reservation, c.reservation_id)
                mem = (
                    await db.execute(
                        select(Member)
                        .where(Member.id == c.member_id)
                        .with_for_update()
                        # 수 17:00 다음 주 마감 배치가 같은 회원의 마지막 이용일을 올리는 것과 겹쳐도 잃지 않게
                        .execution_options(populate_existing=True)
                    )
                ).scalar_one()
                # 후보를 읽은 뒤 잠금을 기다리는 사이 탈퇴했을 수 있다 — 잠근 뒤의 값으로 다시 확인
                # (탈퇴도 회원 행을 먼저 잠그므로, 반납이 먼저 잠그면 탈퇴 쪽이 확정 예약을 보고 막힌다)
                if mem.status != MemberStatus.ACTIVE:
                    raise _NotEligible()
                res.status = ReservationStatus.CONFIRMED
                res.confirmed_at = now
                res.confirmed_by = ConfirmedBy.RETURN_PROMOTE
                res.dropped_at = None
                res.is_priority = True
                # 이 확정에는 쿠폰을 쓰지 않았다 — 남겨 두면 「무적 쿠폰 확정(양도·교환 불가)」으로 잘못 잠긴다.
                # 쿠폰 행 자체는 건드리지 않는다(탈락 때 이미 돌려받음).
                res.coupon_id = None
                slot.status = SlotStatus.CONFIRMED
                slot.confirmed_reservation_id = res.id
                await db.flush()
                await recompute_member_last_used_date(db, mem)
                await db.flush()
        except (IntegrityError, _NotEligible) as exc:
            # 그사이 후보가 다른 시간대를 재신청·양도받아 주 1회 인덱스에 걸렸거나 탈퇴한 경우 — 다음 분으로.
            # 롤백으로 만료된 슬롯을 다시 읽는다(OPEN · 비어 있음)
            await db.refresh(slot)
            logger.warning(
                "return promote skipped reservation=%s slot=%s (%s)",
                c.reservation_id,
                slot.id,
                "not eligible" if isinstance(exc, _NotEligible) else "race",
            )
            continue

        runner_up = ordered[i + 1] if i + 1 < len(ordered) else None
        reason = explain_promotion(c, runner_up, dropped_total=dropped_total)
        reason_html = promotion_reason_html(
            reason,
            name=c.name,
            last_used_date=c.last_used_date,
            returned_at=returned.returned_at or now,
            today=to_kst(now).date(),
        )
        mail = await enqueue_mail(
            db,
            mail_type=MailType.RESERVE_DONE_NORMAL,
            to_email=c.email,
            to_member_id=c.member_id,
            reservation_id=c.reservation_id,
            cycle_id=slot.cycle_id,
            context={
                "name": _mail_text(c.name),
                "slotDate": slot_date,
                "slotTime": slot_time,
                "slotStart": start_label,
                "returnPromoted": True,
                "reasonHtml": reason_html,
            },
            dedupe_key=f"done:ret:{c.reservation_id}",
        )
        if mail:
            queue_mail_after_commit(mail.id)
        logger.info(
            "return promote slot=%s reservation=%s reason=%s candidates=%s",
            slot.id,
            c.reservation_id,
            reason,
            len(ordered),
        )
        return PromotionResult(
            reservation_id=c.reservation_id,
            member_id=c.member_id,
            reason=reason,
            candidate_count=len(ordered),
            mail_id=mail.id if mail else None,
        )

    return PromotionSkip(SKIP_ALL_FAILED)


async def return_promoted_in_place_ids(db: AsyncSession, reservations) -> set[int]:
    """「반납 자리 · 자동 확정」으로 보여 줄 예약 id — 자동 확정된 바로 그 시간대에 아직 있는 예약만.

    교환은 slot_id만 맞바꾸고 confirmed_by(RETURN_PROMOTE)는 그대로 둔다. 표시가 반납된 적 없는
    다른 시간대로 따라가지 않게, 지금 슬롯에 「이 예약이 확정된 바로 그 시각」에 반납된 행이 있는지 본다
    (반납과 자동 확정은 같은 트랜잭션에서 같은 시각으로 기록된다 — reservation_return.return_reservation).
    """
    promoted = [
        r
        for r in reservations
        if r.confirmed_by == ConfirmedBy.RETURN_PROMOTE and r.confirmed_at is not None
    ]
    if not promoted:
        return set()
    rows = await db.execute(
        select(Reservation.slot_id, Reservation.returned_at)
        .where(Reservation.slot_id.in_({r.slot_id for r in promoted}))
        .where(Reservation.returned_at.isnot(None))
    )
    returned = {(slot_id, returned_at) for slot_id, returned_at in rows.all()}
    return {r.id for r in promoted if (r.slot_id, r.confirmed_at) in returned}
