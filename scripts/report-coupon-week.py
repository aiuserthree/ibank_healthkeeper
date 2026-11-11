"""읽기 전용 — 방금 마감된 주차의 무적 쿠폰 신호 보고 (매주 수요일 마감 뒤).

운영 서버에서: ssh root@115.68.221.73 'cd /opt/healthkeeper/app/backend && .venv/bin/python -' < scripts/report-coupon-week.py
DB 에 쓰지 않는다(READ ONLY 트랜잭션 + healthkeeper DB 확인).

「쿠폰은 매일 13:30 · 14:30만」으로 좁힐 신호
  실행 기준(사용자 확정 2026-10-30): 한 주 확정 자리 중 쿠폰으로 확정된 자리가 5개쯤
    (탈락 · 아케이드 쿠폰 합산, 떨어져 돌려받은 쿠폰은 세지 않음)
  미리 알림: 쿠폰 확정 3개 이상이 최근 3주 중 2주 넘게 · 같은 시간대에 쿠폰끼리 겹침
"""
import asyncio
import sys
from collections import Counter, defaultdict
from datetime import timedelta

sys.path.insert(0, ".")
from sqlalchemy import select, text

from app.core.time import KST, now_kst
from app.database import AsyncSessionLocal
from app.models import Coupon, Reservation, ReservationCycle, Slot
from app.models.enums import ReservationStatus as RS

WD = "월화수목금토일"


async def main():
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET TRANSACTION READ ONLY"))
        assert (await db.execute(text("select current_database()"))).scalar() == "healthkeeper"
        now = now_kst()
        cycles = (
            await db.execute(select(ReservationCycle).where(ReservationCycle.close_at <= now).order_by(ReservationCycle.close_at.desc()).limit(6))
        ).scalars().all()
        if not cycles:
            print("마감된 주차 없음")
            return
        print(f"조회 {now:%Y-%m-%d %H:%M} KST")
        hist = []
        for i, cy in enumerate(cycles):
            rs = (await db.execute(select(Reservation).where(Reservation.cycle_id == cy.id))).scalars().all()
            slots = {s.id: s for s in (await db.execute(select(Slot).where(Slot.cycle_id == cy.id))).scalars().all()}
            live = [r for r in rs if r.status != RS.CANCELLED]
            coup = [r for r in rs if r.coupon_id]
            coup_live = [r for r in coup if r.status != RS.CANCELLED]
            by_slot = defaultdict(list)
            for r in live:
                by_slot[r.slot_id].append(r)
            clash = [sid for sid, lst in by_slot.items() if sum(1 for r in lst if r.coupon_id) >= 2]
            # 쿠폰이 가져간 경합 시간대(다른 신청자가 있던 곳)와 그 시간대에서 떨어진 일반 신청자
            won = [r0 for r0 in coup if r0.status == RS.CONFIRMED]
            contested = sum(1 for r0 in won if any(x.id != r0.id for x in by_slot[r0.slot_id]))
            pushed = sum(sum(1 for r in by_slot[r0.slot_id] if not r.coupon_id and r.status == RS.DROPPED) for r0 in won)
            confirmed_total = sum(1 for r in rs if r.status == RS.CONFIRMED)
            hist.append((cy, len(live), len(coup_live), len(clash), contested, pushed, len(won), confirmed_total))
            if i == 0:
                print(f"\n■ 이번 주차 #{cy.id} ({cy.target_week_start:%m-%d}~{cy.target_week_end:%m-%d}) 마감 {cy.close_at.astimezone(KST):%m-%d %H:%M}")
                print(f"  전체 신청(취소 제외) {len(live)}건 · 쿠폰 신청 {len(coup_live)}건 (취소 포함 {len(coup)}건)")
                print(f"  확정 자리 {sum(1 for r in rs if r.status == RS.CONFIRMED)}개 중 쿠폰으로 확정 {len(won)}개 (실행 기준 5개쯤)")
                print("  쿠폰 신청 결과", dict(Counter(r.status.value for r in coup)))
                for r in sorted(coup, key=lambda r: (slots[r.slot_id].slot_date, slots[r.slot_id].start_time)):
                    s = slots[r.slot_id]
                    others = [x for x in by_slot[r.slot_id] if x.id != r.id]
                    print(f"   - {s.slot_date:%m-%d}({WD[s.slot_date.weekday()]}) {s.start_time:%H:%M} {r.status.value} · 같은 시간대 다른 신청 {len(others)}건(쿠폰 {sum(1 for x in others if x.coupon_id)})")
                print(f"  쿠폰끼리 겹친 시간대 {len(clash)}곳 · 쿠폰이 가져간 경합 시간대 {contested}곳(그 시간대에서 떨어진 일반 신청자 {pushed}명)")
                tcount = Counter(slots[r.slot_id].start_time.strftime("%H:%M") for r in coup_live)
                if tcount:
                    print("  쿠폰 신청 시각", dict(sorted(tcount.items())))
        print("\n■ 최근 주차 흐름 (최신 → 과거): 전체 신청 / 쿠폰 신청 / 쿠폰 확정(확정 자리) / 쿠폰끼리 겹침 / 쿠폰이 가져간 경합 시간대(떨어진 일반 신청자)")
        for cy, n, c, k, w, p, cw, ct in hist:
            print(f"  #{cy.id} {cy.target_week_start:%m-%d}주  {n} / {c} / {cw}({ct}) / {k} / {w}({p}명)")
        cs = (await db.execute(select(Coupon))).scalars().all()
        hold = [c for c in cs if c.status in ("AVAILABLE", "RESERVED")]
        holders = Counter(c.member_id for c in hold)
        week_ago = now - timedelta(days=7)
        print("\n■ 쿠폰 보유")
        print(f"  지금 보유 {len(hold)}장 · {len(holders)}명 · 한 사람 최다 {max(holders.values()) if holders else 0}장")
        print("  최근 7일 발급", dict(Counter(c.source for c in cs if c.issued_at >= week_ago)), "· 최근 7일 사용", sum(1 for c in cs if c.used_at and c.used_at >= week_ago))
        soon = [c for c in hold if c.expires_at and c.expires_at <= now + timedelta(days=14)]
        print(f"  14일 안에 만료 {len(soon)}장")
        c0 = hist[0]
        sig, warn = [], []
        if c0[6] >= 5:
            sig.append(f"이번 주 쿠폰 확정 {c0[6]}개 — 실행 기준(5개쯤) 도달")
        if c0[6] >= 3 and sum(1 for h in hist[:3] if h[6] >= 3) >= 2:
            warn.append("쿠폰 확정 3개 이상이 최근 3주 중 2주 넘게")
        if c0[3]:
            warn.append("쿠폰끼리 겹친 시간대 있음")
        print("\n■ 신호:", " / ".join(sig) if sig else "없음 — 지금처럼 유지")
        print("■ 미리 알림:", " / ".join(warn) if warn else "없음")


asyncio.run(main())
