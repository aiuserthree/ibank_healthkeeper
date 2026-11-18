"""참여 도장 목표 바뀜 시험 — 2026-12-01(한국 날짜)부터 도장판 한 장의 목표가 10개 → 15개.

규칙(game.stamp_goal_for): 그 판의 10번째 도장이 12월 1일보다 앞 날짜에 찍혔으면 10, 아니면 15.
받은 쿠폰 한 장마다 그 판의 목표만큼 쓴 것으로 보고 처음부터 차례로 자른다(game.stamp_cards).

DB 는 SQLite(메모리, aiosqlite) 로 대신한다(실제 Postgres · Redis · Teams 없이). 「오늘」은 바꿔 가며 돌린다.
돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend <파이썬> -m unittest discover -s <저장소>/backend/tests -p "test_stamp_goal.py" -v
"""

from __future__ import annotations

import asyncio
import os
import random
import unittest
from datetime import date, datetime, timedelta
from unittest import mock

os.environ.setdefault("DEBUG", "false")

from sqlalchemy import BigInteger, func, select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402

from app.core.time import KST  # noqa: E402
from app.models import ArcadeStamp, Coupon, CouponSource, Member, MemberStatus  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.services import game as game_service  # noqa: E402

NOV30 = date(2026, 11, 30)
DEC1 = date(2026, 12, 1)


@compiles(BigInteger, "sqlite")
def _bigint_sqlite(type_, compiler, **kw):  # SQLite 는 INTEGER 여야 스스로 번호가 붙는다
    return "INTEGER"


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def old_stamp_status(db, member, day):
    """바꾸기 전 stamp_status(목표 10 고정) 그대로 — 12월 전 응답이 같은지 견주는 잣대."""
    GOAL = 10
    rows = (
        await db.execute(
            select(ArcadeStamp.stamp_date, ArcadeStamp.kind)
            .where(ArcadeStamp.member_id == member.id)
            .order_by(ArcadeStamp.stamp_date, ArcadeStamp.id)
        )
    ).all()
    dates = [d for d, _ in rows]
    kinds = [k or "PLAY" for _, k in rows]
    month = f"{day.year:04d}-{day.month:02d}"
    used = await db.scalar(
        select(func.count()).select_from(Coupon).where(Coupon.member_id == member.id, Coupon.source == CouponSource.ARCADE)
    ) or 0
    this_month = await db.scalar(
        select(func.count()).select_from(Coupon).where(
            Coupon.member_id == member.id, Coupon.source == CouponSource.ARCADE, Coupon.grant_month == month
        )
    ) or 0
    card = list(dates[used * GOAL :])
    filled = min(len(card), GOAL)
    done = used > 0 and not card and len(dates) >= used * GOAL and dates[used * GOAL - 1] == day
    lo = (used - 1) * GOAL if done else used * GOAL
    shown = list(dates[lo : lo + GOAL])
    return {
        "month": month,
        "days": [d.isoformat() for d in shown],
        "kinds": kinds[lo : lo + len(shown)],
        "count": GOAL if done else filled,
        "filled": filled,
        "goal": GOAL,
        "today": any(d == day and k == "PLAY" for d, k in zip(dates, kinds)),
        "todayBonus": any(d == day and k == "WIN" for d, k in zip(dates, kinds)),
        "winMonth": sum(1 for d, k in zip(dates, kinds) if k == "WIN" and (d.year, d.month) == (day.year, day.month)),
        "winMonthCap": game_service.WIN_BONUS_MONTHLY_CAP,
        "done": done,
        "coupon": bool(this_month),
        "pending": filled >= GOAL and bool(this_month),
        "minSeconds": game_service.STAMP_MIN_SEC,
    }


class StampGoal(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.engine = create_async_engine("sqlite+aiosqlite://")
        run(self._schema())
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        self.day = [date(2026, 11, 1)]
        today = lambda: self.day[0]  # noqa: E731
        now = lambda: datetime.combine(self.day[0], datetime.min.time(), tzinfo=KST).replace(hour=12)  # noqa: E731
        for p in (mock.patch.object(game_service, "today_kst", today), mock.patch.object(game_service, "now_kst", now)):
            p.start()
            self.addCleanup(p.stop)
        run(self._people())

    def tearDown(self):
        run(self.engine.dispose())
        self.loop.close()

    async def _schema(self):
        def make(conn):
            for t in Base.metadata.sorted_tables:
                try:
                    t.create(conn)
                except Exception:  # noqa: BLE001 — SQLite 가 못 만드는 표는 건너뛴다
                    pass

        async with self.engine.begin() as c:
            await c.run_sync(make)

    async def _people(self):
        async with self.Session() as db:
            for i in range(1, 9):
                db.add(Member(id=i, email=f"t{i}@example.com", name=f"시험{i}", status=MemberStatus.ACTIVE, entra_oid=f"oid-{i}"))
            await db.commit()

    # ── 돕는 것 ──

    def db(self, fn):
        async def go():
            async with self.Session() as db:
                return await fn(db)
        return run(go())

    def on(self, d):
        self.day[0] = d

    def play(self, who, d=None):
        """d 날(없으면 오늘)에 한 판 — 일반 도장."""
        if d:
            self.on(d)

        async def go(db):
            return await game_service._give_stamp(db, await db.get(Member, who), "snake", self.day[0])
        return self.db(go)

    def win(self, who, d=None):
        """d 날(없으면 오늘)에 동료(8번)를 이김 — 대전 승리 보너스."""
        if d:
            self.on(d)

        async def go(db):
            return await game_service.give_win_bonus(db, await db.get(Member, who), "gomoku", self.day[0], f"match:{who}-{self.day[0]}", [8])
        return self.db(go)

    def days(self, who, start, n):
        """start 부터 n 일 매일 한 판."""
        for i in range(n):
            self.play(who, start + timedelta(days=i))

    def status(self, who, d=None):
        day = d or self.day[0]

        async def go(db):
            return await game_service.stamp_status(db, await db.get(Member, who), day)
        return self.db(go)

    def old_status(self, who, d=None):
        day = d or self.day[0]

        async def go(db):
            return await old_stamp_status(db, await db.get(Member, who), day)
        return self.db(go)

    def coupons(self, who):
        async def go(db):
            return (
                await db.execute(
                    select(Coupon).where(Coupon.member_id == who, Coupon.source == CouponSource.ARCADE).order_by(Coupon.id)
                )
            ).scalars().all()
        return self.db(go)

    def pending_job(self, d):
        self.on(d)
        return self.db(game_service.issue_pending_arcade_coupons)

    def stamp_count(self, who):
        async def go(db):
            return await db.scalar(select(func.count()).select_from(ArcadeStamp).where(ArcadeStamp.member_id == who))
        return self.db(go)

    # ── 상수 · 미리 알림 ──

    def test_constants(self):
        self.assertEqual((game_service.STAMP_GOAL_OLD, game_service.STAMP_GOAL, game_service.STAMP_GOAL_FROM), (10, 15, DEC1))
        self.assertEqual(game_service.stamp_goal_change(NOV30), {"from": "2026-12-01", "goal": 15})
        self.assertIsNone(game_service.stamp_goal_change(DEC1))
        st = self.status(1, NOV30)
        self.assertEqual((st["goal"], st["goalChange"]), (10, {"from": "2026-12-01", "goal": 15}))
        st = self.status(1, DEC1)
        self.assertEqual((st["goal"], st["goalChange"]), (15, None))

    def test_goal_for_rule(self):
        # 판의 10번째 도장 날짜로만 정한다 — 11/30 이면 10, 12/1 이면 15, 아직 10개가 안 됐으면 오늘로
        nov = [date(2026, 11, 21) + timedelta(days=i) for i in range(10)]  # 10번째 = 11/30
        self.assertEqual(game_service.stamp_goal_for(nov, 0, date(2027, 1, 5)), 10)
        dec = [date(2026, 11, 22) + timedelta(days=i) for i in range(10)]  # 10번째 = 12/1
        self.assertEqual(game_service.stamp_goal_for(dec, 0, DEC1), 15)
        self.assertEqual(game_service.stamp_goal_for(dec[:9], 0, NOV30), 10)
        self.assertEqual(game_service.stamp_goal_for(dec[:9], 0, DEC1), 15)
        self.assertEqual(game_service.stamp_goal_for([], 0, NOV30), 10)
        self.assertEqual(game_service.stamp_goal_for([], 0, DEC1), 15)

    # (가) 11월 30일에 10번째 도장 → 10개 기준으로 쿠폰
    def test_a_tenth_on_nov30_gets_coupon(self):
        self.days(1, date(2026, 11, 21), 10)  # 11/21 ~ 11/30
        cs = self.coupons(1)
        self.assertEqual(len(cs), 1)
        self.assertEqual((cs[0].grant_month, cs[0].note), ("2026-11", "아케이드 도장 10개"))
        st = self.status(1, NOV30)
        self.assertTrue(st["done"])
        self.assertEqual((st["count"], st["goal"], len(st["days"])), (10, 10, 10))
        st = self.status(1, DEC1)  # 다음 날부터 새 판 — 15개
        self.assertEqual((st["count"], st["goal"], st["done"], st["days"]), (0, 15, False, []))

    # (나) 11월 쿠폰을 이미 받고 판이 또 10개 참 → 12월 1일에 쿠폰, 그 뒤 새 판은 15개
    def test_b_pending_from_november_paid_on_dec1(self):
        self.days(1, date(2026, 11, 1), 10)
        self.assertEqual(len(self.coupons(1)), 1)
        self.days(1, date(2026, 11, 11), 12)  # 11/11 ~ 11/22 — 10개째(11/20)에 꽉 차고 그 뒤는 안 쌓임
        st = self.status(1, NOV30)
        self.assertTrue(st["pending"])
        self.assertEqual((st["count"], st["goal"]), (10, 10))
        self.assertEqual(self.stamp_count(1), 20)
        # 자정 일(scheduler)이 12월 1일에 준다
        self.assertEqual(self.pending_job(DEC1), 1)
        cs = self.coupons(1)
        self.assertEqual([c.grant_month for c in cs], ["2026-11", "2026-12"])
        self.assertEqual(cs[1].note, "아케이드 도장 10개")
        st = self.status(1, DEC1)
        self.assertEqual((st["count"], st["goal"], st["pending"], st["coupon"]), (0, 15, False, True))
        # 새 판은 15개 — 10개째에도 기다림(pending) 아님, 15개째에 기다림(이번 달 몫은 이미 받음)
        self.days(1, DEC1, 10)
        st = self.status(1)
        self.assertEqual((st["count"], st["goal"], st["pending"]), (10, 15, False))
        self.days(1, date(2026, 12, 11), 5)
        st = self.status(1)
        self.assertEqual((st["count"], st["goal"], st["pending"]), (15, 15, True))
        self.days(1, date(2026, 12, 16), 3)  # 꽉 찬 동안은 안 쌓인다
        self.assertEqual(self.stamp_count(1), 35)
        self.assertEqual(len(self.coupons(1)), 2)
        self.assertEqual(self.pending_job(date(2027, 1, 1)), 1)
        self.assertEqual(self.coupons(1)[-1].note, "아케이드 도장 15개")

    def test_b2_pending_paid_by_first_play_on_dec1(self):
        # 자정 일보다 그날 첫 판이 먼저여도 — 기다리던 10개 판 쿠폰을 받고, 그 판 도장이 새 15개 판의 1번째
        self.days(2, date(2026, 11, 1), 20)
        self.assertTrue(self.status(2, NOV30)["pending"])
        r = self.play(2, DEC1)
        self.assertTrue(r["coupon"] and r["new"])
        self.assertEqual((r["count"], r["goal"]), (1, 15))
        self.assertEqual(self.pending_job(DEC1), 0)  # 이미 받음 — 두 번 안 준다
        self.assertEqual(len(self.coupons(2)), 2)

    # (다) 11월 말 9개 → 12월 1일 10번째로는 쿠폰 없음, 15개째에 쿠폰
    def test_c_nine_in_november_needs_fifteen(self):
        self.days(3, date(2026, 11, 22), 9)  # 11/22 ~ 11/30
        st = self.status(3, NOV30)
        self.assertEqual((st["count"], st["goal"]), (9, 10))
        r = self.play(3, DEC1)
        self.assertFalse(r["coupon"])
        self.assertEqual((r["count"], r["goal"]), (10, 15))
        self.assertEqual(self.coupons(3), [])
        self.days(3, date(2026, 12, 2), 4)  # 14개
        self.assertEqual(self.coupons(3), [])
        self.assertEqual(self.status(3)["count"], 14)
        r = self.play(3, date(2026, 12, 6))  # 15개째
        self.assertTrue(r["coupon"])
        self.assertEqual((r["count"], r["goal"], r["done"]), (15, 15, True))
        st = self.status(3)
        self.assertEqual(len(st["days"]), 15)
        self.assertEqual(st["days"][0], "2026-11-22")  # 11월에 찍은 9개가 그대로 이어짐
        self.assertEqual(self.coupons(3)[0].note, "아케이드 도장 15개")

    # (다-2) 11월 말 7개 — 도장은 그대로 남고 15개를 채워야 한다
    def test_c2_seven_in_november(self):
        self.days(4, date(2026, 11, 24), 7)  # 11/24 ~ 11/30
        self.assertEqual((self.status(4, NOV30)["count"], self.status(4, NOV30)["goal"]), (7, 10))
        st = self.status(4, DEC1)
        self.assertEqual((st["count"], st["goal"], len(st["days"])), (7, 15, 7))
        self.days(4, DEC1, 7)  # 14개
        self.assertEqual(self.coupons(4), [])
        self.assertTrue(self.play(4, date(2026, 12, 8))["coupon"])

    # (라) 12월 1일 이후 새로 시작 → 15개
    def test_d_new_card_after_dec1(self):
        self.days(4, date(2026, 12, 3), 14)
        self.assertEqual(self.coupons(4), [])
        st = self.status(4)
        self.assertEqual((st["count"], st["goal"], st["goalChange"]), (14, 15, None))
        r = self.play(4, date(2026, 12, 17))
        self.assertTrue(r["coupon"])
        self.assertEqual(len(self.coupons(4)), 1)
        st = self.status(4, date(2026, 12, 18))
        self.assertEqual((st["count"], st["goal"]), (0, 15))

    # (마) 12월 전의 모든 응답 값이 바꾸기 전 코드와 같다 — 같은 자료로 옛 함수와 견준다
    def test_e_before_dec_same_as_old(self):
        rng = random.Random(20261201)
        start = date(2026, 9, 1)
        for who in (5, 6, 7):
            d = start
            while d < DEC1:
                self.on(d)
                if rng.random() < 0.75:
                    self.play(who)
                if rng.random() < 0.3:
                    self.win(who)
                if rng.random() < 0.2:
                    self.pending_job(d)
                for check in (d, d + timedelta(days=1)):
                    if check >= DEC1:
                        continue
                    new = self.status(who, check)
                    self.assertEqual(new.pop("goalChange"), {"from": "2026-12-01", "goal": 15})
                    self.assertEqual(new, self.old_status(who, check), f"{who} {check}")
                d += timedelta(days=1)
            self.assertGreaterEqual(len(self.coupons(who)), 2)  # 쿠폰 · 기다림 · 다 찬 날이 실제로 섞였는지

    def test_e2_play_and_win_results_same_as_old_before_dec(self):
        # _give_stamp · give_win_bonus 가 돌려주는 값(개수 · 목표 · 기다림 · 다 참)도 12월 전에는 늘 목표 10
        for i in range(40):
            d = date(2026, 10, 1) + timedelta(days=i)
            r = self.play(1, d)
            old = self.old_status(1, d)
            self.assertEqual((r["count"], r["goal"], r["pending"], r["done"]), (old["count"], 10, old["pending"], old["done"]))
            w = self.win(1, d)
            old = self.old_status(1, d)
            self.assertEqual((w["count"], w["goal"], w["pending"]), (old["count"], 10, old["pending"]))

    # (바) 쿠폰을 여러 장 받은 사람의 판 자르기 — 10 + 10 + 15 …
    def test_f_cut_cards_10_10_15(self):
        self.days(6, date(2026, 10, 1), 10)  # 10월 쿠폰 (10개)
        self.days(6, date(2026, 11, 1), 10)  # 11월 쿠폰 (10개)
        self.days(6, date(2026, 12, 1), 15)  # 12월 쿠폰 (15개) — 12/15 에 받음
        self.assertEqual([c.grant_month for c in self.coupons(6)], ["2026-10", "2026-11", "2026-12"])
        st = self.status(6, date(2026, 12, 15))
        self.assertTrue(st["done"])
        self.assertEqual((st["count"], st["goal"], st["days"][0], st["days"][-1]), (15, 15, "2026-12-01", "2026-12-15"))
        self.days(6, date(2026, 12, 16), 30)  # 1월 14일까지 — 15개째(12/30)에 판이 차 기다리고, 1/1 에 받은 뒤 새 판
        self.assertEqual([c.grant_month for c in self.coupons(6)], ["2026-10", "2026-11", "2026-12", "2027-01"])
        st = self.status(6, date(2027, 1, 14))
        self.assertEqual((st["count"], st["goal"], st["days"][0]), (14, 15, "2027-01-01"))

        async def go(db):
            rows = (await db.execute(select(ArcadeStamp.stamp_date).where(ArcadeStamp.member_id == 6).order_by(ArcadeStamp.stamp_date))).scalars().all()
            return game_service.stamp_cards(list(rows), 4, date(2027, 1, 14))
        self.assertEqual(self.db(go), [(0, 10), (10, 10), (20, 15), (35, 15), (50, 15)])

    # (사) 하루 2개(PLAY + WIN)가 경계 날짜를 걸칠 때
    def test_g_two_a_day_on_the_boundary(self):
        # 8개 + 11/30 일반(9) + 승리(10) → 10번째가 11월 — 10개 기준 쿠폰
        self.days(1, date(2026, 11, 22), 8)
        self.play(1, NOV30)
        r = self.win(1, NOV30)
        self.assertTrue(r["coupon"])
        self.assertEqual(self.coupons(1)[0].note, "아케이드 도장 10개")
        # 9개 + 11/30 일반(10) + 승리(11) → 쿠폰, 11번째는 새 판으로 넘어가 12월부터 15개 판의 1개
        self.days(2, date(2026, 11, 21), 9)
        self.assertTrue(self.play(2, NOV30)["coupon"])
        self.win(2, NOV30)
        self.assertEqual(len(self.coupons(2)), 1)
        st = self.status(2, DEC1)
        self.assertEqual((st["count"], st["goal"], st["kinds"]), (1, 15, ["WIN"]))
        # 9개(11월) + 12/1 일반(10) + 승리(11) → 10번째가 12월 — 쿠폰 없음, 15개 판
        self.days(3, date(2026, 11, 22), 9)
        self.play(3, DEC1)
        r = self.win(3, DEC1)
        self.assertFalse(r["coupon"])
        self.assertEqual(self.coupons(3), [])
        st = self.status(3, DEC1)
        self.assertEqual((st["count"], st["goal"]), (11, 15))
        # 이번 달 쿠폰을 받고 다시 9개 + 11/30 승리(10번째) → 기다림(10개 기준) → 12/1 에 받음
        self.days(4, date(2026, 11, 1), 10)
        self.days(4, date(2026, 11, 21), 9)
        self.win(4, NOV30)
        st = self.status(4, NOV30)
        self.assertEqual((st["count"], st["goal"], st["pending"]), (10, 10, True))
        self.assertEqual(self.pending_job(DEC1), 1)
        self.assertEqual(self.status(4, DEC1)["goal"], 15)

    # (사-2) 11/30에 끝난 대전의 보너스를 12/1에 처리 — 쿠폰은 10개 기준, 응답의 새 판 목표는 15(오늘 기준)
    def test_g2_late_win_bonus_for_nov30_on_dec1(self):
        self.days(1, date(2026, 11, 21), 9)  # 11/21 ~ 11/29
        self.play(1, DEC1)  # 12/1 일반 → 10/15
        self.assertEqual((self.status(1, DEC1)["count"], self.status(1, DEC1)["goal"]), (10, 15))

        async def go(db):  # 오늘은 12/1, 보너스 날짜는 판이 끝난 11/30(match._stamp_both · party._stamp_agreed 가 넘기는 값)
            return await game_service.give_win_bonus(db, await db.get(Member, 1), "gomoku", NOV30, "match:late", [8])
        r = self.db(go)
        # 날짜 순서로 10번째가 11/30 → 10개 기준 쿠폰(11월 몫)
        self.assertTrue(r["coupon"])
        self.assertEqual([c.grant_month for c in self.coupons(1)], ["2026-11"])
        # 응답과 지금 현황이 같은 판(1/15)을 말한다
        st = self.status(1, DEC1)
        self.assertEqual((r["count"], r["goal"]), (st["count"], st["goal"]))
        self.assertEqual((st["count"], st["goal"]), (1, 15))
        # 지난 날짜로 현황을 물어도 아직 덜 찬 판의 목표는 실제 오늘(12/1) 기준
        self.assertEqual(self.status(1, NOV30)["goal"], 15)

    # (아) 같은 요청을 여러 번 해도 쿠폰은 한 번만
    def test_h_repeat_requests_one_coupon(self):
        self.days(5, date(2026, 12, 1), 14)
        day15 = date(2026, 12, 15)
        results = [self.play(5, day15) for _ in range(4)]
        self.assertEqual([r["coupon"] for r in results], [True, False, False, False])
        self.assertEqual([r["new"] for r in results], [True, False, False, False])
        self.win(5, day15)
        self.win(5, day15)
        self.assertEqual(self.pending_job(day15), 0)
        self.assertEqual(self.pending_job(day15), 0)
        self.assertEqual(len(self.coupons(5)), 1)
        # 11월 기다림 판 — 12/1 에 자정 일 · 첫 판 · 대전 승리가 몇 번 겹쳐도 1장
        self.days(7, date(2026, 11, 1), 20)
        self.assertEqual(self.pending_job(DEC1), 1)
        self.assertEqual(self.pending_job(DEC1), 0)
        self.play(7, DEC1)
        self.play(7, DEC1)
        self.win(7, DEC1)
        self.assertEqual([c.grant_month for c in self.coupons(7)], ["2026-11", "2026-12"])


    # (아-2) 쿠폰을 줄지 보기 전에 그 회원 행을 잠근다(Postgres FOR UPDATE — SQLite 는 그냥 지나간다) · 일이 끝나면 늘 커밋해 푼다
    def test_h2_coupon_check_locks_member_row(self):
        from sqlalchemy.ext.asyncio import AsyncSession

        seen, commits = [], []
        real_exec, real_commit = AsyncSession.execute, AsyncSession.commit

        async def spy_exec(db, stmt, *a, **kw):
            if getattr(stmt, "_for_update_arg", None) is not None:
                seen.append(str(stmt.compile()))
            return await real_exec(db, stmt, *a, **kw)

        async def spy_commit(db):
            commits.append(1)
            return await real_commit(db)

        with mock.patch.object(AsyncSession, "execute", spy_exec), mock.patch.object(AsyncSession, "commit", spy_commit):
            self.play(1, DEC1)  # 새 도장 — 잠금 두 번(찍기 전 · 뒤), 커밋
            n_lock, n_commit = len(seen), len(commits)
            self.play(1, DEC1)  # 같은 날 또 — 찍을 것이 없어도 잠그고, 커밋해 잠금을 푼다
            self.assertGreater(len(seen), n_lock)
            self.assertGreater(len(commits), n_commit)
            n_commit = len(commits)
            self.pending_job(DEC1)  # 자정 일 — 줄 것이 없어도 커밋해 푼다
            self.assertGreater(len(commits), n_commit)
        self.assertTrue(seen and all("FROM member" in q for q in seen))


if __name__ == "__main__":
    unittest.main()
