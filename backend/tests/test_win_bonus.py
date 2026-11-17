"""참여 도장 · 대전 승리 보너스 시험 — 사내 동료(사람)를 이긴 날은 도장 2개(일반 1 + 보너스 1), 하루 최대 2개.

DB 는 SQLite(메모리, aiosqlite) 로 대신한다(실제 Postgres · Redis · Teams 없이). 마이그레이션 0038 은 SQLite 에 올렸다 내려 본다.
돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend <파이썬> -m unittest discover -s <저장소>/backend/tests -p "test_win_bonus.py" -v
"""

from __future__ import annotations

import asyncio
import importlib.util
import os
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest import mock

os.environ.setdefault("DEBUG", "false")

import sqlalchemy as sa  # noqa: E402
from sqlalchemy import BigInteger, event, select  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402

from app.core.time import KST  # noqa: E402
from app.models import ArcadeStamp, Coupon, CouponSource, GameMatch, GameParty, Member, MemberStatus  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.services import game as game_service  # noqa: E402
from app.services import match, party  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
DAY = date(2026, 11, 17)


@compiles(BigInteger, "sqlite")
def _bigint_sqlite(type_, compiler, **kw):  # SQLite 는 INTEGER 여야 스스로 번호가 붙는다
    return "INTEGER"


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class WinBonus(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.engine = create_async_engine("sqlite+aiosqlite://")

        @event.listens_for(self.engine.sync_engine, "connect")
        def _fns(conn, _):
            conn.create_function("split_part", 3, lambda v, sep, n: ((v or "").split(sep) + [""] * n)[n - 1])

        run(self._schema())
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        self.day = [DAY]
        today = lambda: self.day[0]  # noqa: E731
        now = lambda: datetime.combine(self.day[0], datetime.min.time(), tzinfo=KST).replace(hour=12)  # noqa: E731
        patches = [
            mock.patch.object(game_service, "today_kst", today),
            mock.patch.object(game_service, "now_kst", now),
            mock.patch.object(match, "today_kst", today),
            mock.patch.object(match, "now_kst", now),
            mock.patch.object(party, "today_kst", today),
            mock.patch.object(match, "ensure_open", lambda **kw: None),
            mock.patch.object(match, "_publish", mock.AsyncMock()),
            # Teams 로 보내지 않는다 — 혹시 불리면 실패
            mock.patch.object(match.teams_service, "_send_chat_message", mock.AsyncMock(side_effect=AssertionError("Teams 금지"))),
        ]
        for p in patches:
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
            for i, name in enumerate(["가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파"], 1):
                db.add(Member(id=i, email=f"u{i}@3ibank.com", name=name, status=MemberStatus.ACTIVE, entra_oid=f"oid-{i}"))
            await db.commit()

    # ── 돕는 것 ──

    def db(self, fn):
        async def go():
            async with self.Session() as db:
                return await fn(db)
        return run(go())

    def stamps(self, who):
        return self.db(lambda db: self._rows(db, who))

    async def _rows(self, db, who):
        return [
            (r.stamp_date, r.kind, r.ref, r.rivals)
            for r in (await db.execute(select(ArcadeStamp).where(ArcadeStamp.member_id == who).order_by(ArcadeStamp.id))).scalars()
        ]

    def today_count(self, who):
        return sum(1 for d, *_ in self.stamps(who) if d == self.day[0])

    def solo(self, who, key="snake"):
        async def go(db):
            return await game_service._give_stamp(db, await db.get(Member, who), key, self.day[0])
        return self.db(go)

    def finish_match(self, a, b, winner, reason="FIVE", bot=None, game="gomoku", moves=12, state=None):
        """끝난 1:1 판을 만들고 공통 지점(_stamp_both)을 지난다 — a 가 마지막에 둔 사람."""
        async def go(db):
            m = GameMatch(
                game=game, challenger_id=a, opponent_id=None if bot else b, bot=bot, black_id=a, status="DONE",
                moves=[[i, 0] for i in range(moves)], state=state, winner_id=winner, end_reason=reason,
                finished_at=datetime.combine(self.day[0], datetime.min.time(), tzinfo=KST).replace(hour=12),
            )
            db.add(m)
            await db.commit()
            mine = await match._stamp_both(db, m, await db.get(Member, a))
            return m.id, mine
        return self.db(go)

    def view(self, who, match_id):
        async def go(db):
            return await match._view(db, await db.get(Member, who), await db.get(GameMatch, match_id))
        return self.db(go)

    def finish_party(self, players, winner_seat, reason="FINISH", game="bumpervs", agreed=None):
        async def go(db):
            p = GameParty(
                game=game, host_id=players[0], status="DONE",
                state={"players": players, "bots": list(range(len(players), 6)), "agreed": agreed if agreed is not None else players},
                winner_id=players[winner_seat] if winner_seat is not None and winner_seat < len(players) else None,
                end_reason=reason, finished_at=datetime.combine(self.day[0], datetime.min.time(), tzinfo=KST).replace(hour=12),
            )
            db.add(p)
            await db.commit()
            await party._stamp_agreed(db, p)
            return p.id
        return self.db(go)

    # ── 1:1 대전 ──

    def test_human_win_gives_two(self):
        mid, mine = self.finish_match(1, 2, winner=1)
        self.assertEqual(self.today_count(1), 2)
        self.assertEqual(self.today_count(2), 1)  # 진 사람은 1개
        self.assertEqual(sorted(k for _, k, *_ in self.stamps(1)), ["PLAY", "WIN"])
        win = next(r for r in self.stamps(1) if r[1] == "WIN")
        self.assertEqual((win[2], win[3]), (f"match:{mid}", "2"))  # 판정 근거 — 어떤 판에서 누구를 이겼는지
        self.assertTrue(mine["bonus"]["new"])
        self.assertEqual(mine["count"], 2)
        self.assertEqual(self.view(1, mid)["winBonus"], "got")
        self.assertIsNone(self.view(2, mid)["winBonus"])
        st = self.db(lambda db: self._status(db, 1))
        self.assertTrue(st["today"] and st["todayBonus"])
        self.assertEqual(st["days"], [DAY.isoformat()] * 2)
        self.assertEqual(sorted(st["kinds"]), ["PLAY", "WIN"])

    async def _status(self, db, who):
        return await game_service.stamp_status(db, await db.get(Member, who), self.day[0])

    def test_winner_who_did_not_move_gets_bonus(self):
        # 진 사람이 마지막에 기권 — 이긴 사람(상대)도 공통 지점에서 보너스
        mid, mine = self.finish_match(2, 1, winner=1, reason="RESIGN", moves=12)
        self.assertNotIn("bonus", mine)
        self.assertEqual(self.today_count(1), 2)
        self.assertEqual(self.today_count(2), 1)
        self.assertEqual(self.view(1, mid)["winBonus"], "got")

    def test_bot_win_gives_one(self):
        mid, _ = self.finish_match(1, None, winner=1, bot="hard")
        self.assertEqual(self.today_count(1), 1)
        self.assertIsNone(self.view(1, mid)["winBonus"])

    def test_two_wins_same_day_still_two(self):
        m1, _ = self.finish_match(1, 2, winner=1)
        m2, _ = self.finish_match(1, 3, winner=1)
        m3, _ = self.finish_match(1, 2, winner=1)  # 같은 상대 또
        self.assertEqual(self.today_count(1), 2)
        self.assertEqual(self.view(1, m1)["winBonus"], "got")
        self.assertEqual(self.view(1, m2)["winBonus"], "already")
        self.assertEqual(self.view(1, m3)["winBonus"], "already")

    def test_order_solo_then_win_and_win_then_solo(self):
        self.assertTrue(self.solo(1)["new"])
        self.finish_match(1, 2, winner=1)
        self.assertEqual(self.today_count(1), 2)
        # 순서를 바꿔도(먼저 이기고 나중에 혼자 게임) 2개
        self.finish_match(3, 4, winner=3)
        self.assertFalse(self.solo(3)["new"])  # 대전에서 이미 일반 도장
        self.assertEqual(self.today_count(3), 2)
        # 이긴 사람이 보너스만 먼저 받은 경우도 — 일반 도장은 따로
        self.day[0] = DAY + timedelta(days=1)

        async def bonus_first(db):
            return await game_service.give_win_bonus(db, await db.get(Member, 4), "chess", self.day[0], "match:999", [1])
        self.assertTrue(self.db(bonus_first)["new"])
        st = self.db(lambda db: self._status(db, 4))
        self.assertFalse(st["today"])  # 일반 도장은 아직 — 혼자 게임 판 중간 도장(stageStamp)도 그대로 묻는다
        self.assertTrue(st["todayBonus"])
        self.assertTrue(self.solo(4)["new"])
        self.assertEqual(self.today_count(4), 2)

    def test_draw_no_bonus(self):
        mid, _ = self.finish_match(1, 2, winner=None, reason="DRAW")
        self.assertEqual(self.today_count(1), 1)
        self.assertEqual(self.today_count(2), 1)
        self.assertIsNone(self.view(1, mid)["winBonus"])

    def test_early_resign_like_ranking(self):
        # 순위와 같은 잣대 — 10수 전에 기권한 판은 도장도 순위도 보너스도 없다, 10수 넘게 둔 뒤 기권승은 보너스
        self.finish_match(2, 1, winner=1, reason="RESIGN", moves=3)
        self.assertEqual(self.today_count(1), 0)
        self.finish_match(2, 1, winner=1, reason="RESIGN", moves=10)
        self.assertEqual(self.today_count(1), 2)

    def test_engine_game_resign_counts_by_min_acts(self):
        # 엔진 게임(새 대전 게임도 같은 길) — 행동 수 _v 가 MIN_ACTS 미만인 기권은 안 셈
        self.finish_match(2, 1, winner=1, reason="RESIGN", game="boxes", moves=0, state={"_v": 2})
        self.assertEqual(self.today_count(1), 0)
        self.finish_match(2, 1, winner=1, reason="RESIGN", game="boxes", moves=0, state={"_v": 10})
        self.assertEqual(self.today_count(1), 2)

    def test_resign_api_sets_bonus_on_winner_view(self):
        async def make(db):
            m = GameMatch(game="gomoku", challenger_id=1, opponent_id=2, black_id=1, status="ACTIVE",
                          moves=[[i, 1] for i in range(12)])
            db.add(m)
            await db.commit()
            return m.id
        mid = self.db(make)

        async def resign(db):
            return await match.resign(db, await db.get(Member, 2), mid)
        out = self.db(resign)
        self.assertEqual(out["result"], "lose")
        self.assertIsNone(out["winBonus"])
        self.assertEqual(self.view(1, mid)["winBonus"], "got")
        self.assertEqual(self.today_count(1), 2)

    # ── 같은 두 사람 사이는 한 달에 한 번 ──

    def wins(self, who):
        return [r for r in self.stamps(who) if r[1] == "WIN"]

    def test_same_pair_once_a_month(self):
        self.day[0] = date(2026, 11, 10)
        m1, _ = self.finish_match(1, 2, winner=1)  # A가 B를 이김 → 보너스
        self.assertEqual(len(self.wins(1)), 1)
        self.assertEqual(self.view(1, m1)["winBonus"], "got")
        self.day[0] = date(2026, 11, 12)
        m2, mine = self.finish_match(2, 1, winner=2)  # 같은 달 B가 A를 이김 → 없음(방향 상관없이)
        self.assertEqual(self.wins(2), [])
        self.assertTrue(mine["bonus"]["pair"])
        self.assertFalse(mine["bonus"]["new"])
        self.assertEqual(self.today_count(2), 1)  # 일반 도장은 그대로
        self.assertEqual(self.view(2, m2)["winBonus"], "pair")
        self.day[0] = date(2026, 11, 13)
        m3, _ = self.finish_match(1, 2, winner=1)  # A가 B를 또 → 없음
        self.assertEqual(self.view(1, m3)["winBonus"], "pair")
        self.day[0] = date(2026, 11, 14)
        m4, _ = self.finish_match(1, 3, winner=1)  # 같은 달 다른 날 A가 C를 이김 → 보너스
        self.assertEqual(self.view(1, m4)["winBonus"], "got")
        self.assertEqual(len(self.wins(1)), 2)
        self.day[0] = date(2026, 12, 1)  # 다음 달 1일 — B가 A를 이기면 다시 보너스
        m5, _ = self.finish_match(2, 1, winner=2)
        self.assertEqual(self.view(2, m5)["winBonus"], "got")
        self.assertEqual(len(self.wins(2)), 1)

    def test_month_edge_day(self):
        self.day[0] = date(2026, 11, 30)  # 그달 마지막 날
        self.finish_match(1, 2, winner=1)
        self.assertEqual(len(self.wins(1)), 1)
        self.day[0] = date(2026, 12, 1)  # 바로 다음 날이 새 달 — 같은 두 사람도 다시 가능
        self.finish_match(1, 2, winner=1)
        self.assertEqual(len(self.wins(1)), 2)
        self.day[0] = date(2026, 12, 31)
        mid, _ = self.finish_match(2, 1, winner=2)  # 12월 안에서는 이미 주고받음
        self.assertEqual(self.view(2, mid)["winBonus"], "pair")

    def test_daily_limit_message_wins_over_pair(self):
        # 오늘 이미 보너스를 받았으면 「오늘 이미」 문구(이번 달 문구보다 먼저)
        self.finish_match(1, 2, winner=1)
        mid, _ = self.finish_match(1, 2, winner=1)
        self.assertEqual(self.view(1, mid)["winBonus"], "already")

    def test_party_some_new_people(self):
        self.day[0] = date(2026, 11, 10)
        self.finish_match(1, 2, winner=1)  # 1 ↔ 2 는 이번 달 주고받음
        self.day[0] = date(2026, 11, 11)
        pid = self.finish_party([1, 2, 3], winner_seat=0)  # 1등 1 — 2 는 이미, 3 은 새 사람 → 보너스
        win = self.wins(1)[-1]
        self.assertEqual((win[2], win[3]), (f"party:{pid}", "2,3"))  # 함께 한 사람 전원과 주고받은 것으로
        self.day[0] = date(2026, 11, 12)
        mid, _ = self.finish_match(3, 1, winner=3)  # 이제 3 ↔ 1 도 이번 달 주고받음
        self.assertEqual(self.view(3, mid)["winBonus"], "pair")
        self.assertEqual(self.wins(3), [])

    def test_party_all_already(self):
        self.day[0] = date(2026, 11, 10)
        self.finish_match(1, 2, winner=1)
        self.day[0] = date(2026, 11, 11)
        self.finish_match(3, 1, winner=3)  # 3 이 1 을 이겨도 1 ↔ 3 주고받음
        self.day[0] = date(2026, 11, 12)
        pid = self.finish_party([1, 2, 3], winner_seat=0, game="mansion", reason="WIN")  # 1등 1 — 2 · 3 모두 이미 → 없음
        self.assertEqual(len(self.wins(1)), 1)
        self.assertEqual(self.today_count(1), 1)

        async def v(db):
            return await party._view(db, await db.get(Member, 1), await db.get(GameParty, pid))
        self.assertEqual(self.db(v)["winBonus"], "pair")

    # ── 여러 명 대전 ──

    def test_party_human_winner(self):
        pid = self.finish_party([1, 2, 3], winner_seat=1)
        self.assertEqual(self.today_count(2), 2)
        self.assertEqual(self.today_count(1), 1)
        self.assertEqual(self.today_count(3), 1)
        win = next(r for r in self.stamps(2) if r[1] == "WIN")
        self.assertEqual((win[2], win[3]), (f"party:{pid}", "1,3"))

        async def v(db, who):
            return await party._view(db, await db.get(Member, who), await db.get(GameParty, pid))
        self.assertEqual(self.db(lambda db: v(db, 2))["winBonus"], "got")
        self.assertIsNone(self.db(lambda db: v(db, 1))["winBonus"])

    def test_party_one_human_with_bots_no_bonus(self):
        self.finish_party([1], winner_seat=0, game="jellyvs", reason="BIGGEST")
        self.assertEqual(self.today_count(1), 1)

    def test_party_bot_first_or_draw_no_bonus(self):
        self.finish_party([1, 2], winner_seat=None, reason="BOT", game="mansion")
        self.finish_party([3, 4], winner_seat=None, reason="DRAW", game="jellyvs")
        for who in (1, 2, 3, 4):
            self.assertEqual(self.today_count(who), 1)

    def test_party_mismatch_nothing(self):
        self.finish_party([1, 2], winner_seat=0, reason="MISMATCH")
        self.assertEqual(self.today_count(1), 0)

    # ── 쿠폰 · 기존 기록 ──

    def test_coupon_in_five_days(self):
        for i in range(5):  # 같은 동료와는 한 달에 한 번이라 날마다 다른 동료를 이긴다
            self.day[0] = date(2026, 11, 2) + timedelta(days=i)
            self.finish_match(1, 2 + i, winner=1)
        coupons = self.db(lambda db: self._coupons(db, 1))
        self.assertEqual(coupons, 1)  # 하루 2개 × 5일 = 10개 → 쿠폰 1장
        st = self.db(lambda db: self._status(db, 1))
        self.assertTrue(st["done"])
        self.assertEqual(st["count"], 10)
        # 같은 달에 또 10개를 채워도 쿠폰은 월 1장 — 다 찬 판은 기다림(pending), 그동안은 쌓지 않는다
        for i in range(5, 11):
            self.day[0] = date(2026, 11, 2) + timedelta(days=i)
            self.finish_match(1, 2 + i, winner=1)
        self.assertEqual(self.db(lambda db: self._coupons(db, 1)), 1)
        st = self.db(lambda db: self._status(db, 1))
        self.assertTrue(st["pending"])
        self.assertEqual(st["filled"], 10)

    async def _coupons(self, db, who):
        return len((await db.execute(select(Coupon).where(Coupon.member_id == who, Coupon.source == CouponSource.ARCADE))).scalars().all())

    def test_old_rows_are_play(self):
        # 마이그레이션 전 기록(kind 없이 넣은 줄) — 일반 도장으로 읽히고, 그날 보너스는 따로 받을 수 있다
        async def old(db):
            await db.execute(sa.text("INSERT INTO arcade_stamp (member_id, stamp_date, game, created_at) VALUES (1, :d, 'snake', CURRENT_TIMESTAMP)"), {"d": DAY})
            await db.commit()
        self.db(old)
        self.assertEqual(self.stamps(1), [(DAY, "PLAY", None, None)])
        self.assertFalse(self.solo(1)["new"])
        self.finish_match(1, 2, winner=1)
        self.assertEqual(self.today_count(1), 2)


class Migration0038(unittest.TestCase):
    """0038 — SQLite 에 0024 모양 표를 만들고 올렸다(upgrade) 내려(downgrade) 본다."""

    def _load(self, name):
        spec = importlib.util.spec_from_file_location(name, BACKEND / "alembic" / "versions" / f"{name}.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_chain_and_up_down(self):
        from alembic.migration import MigrationContext
        from alembic.operations import Operations

        mig = self._load("0038_arcade_stamp_kind")
        self.assertEqual((mig.revision, mig.down_revision), ("0038_arcade_stamp_kind", "0037_game_party"))
        heads = [p.stem for p in (BACKEND / "alembic" / "versions").glob("00*.py")]
        self.assertEqual(sorted(heads)[-1], "0038_arcade_stamp_kind")  # 마지막 번호 다음

        engine = sa.create_engine("sqlite://")
        with engine.begin() as conn:
            ops = Operations(MigrationContext.configure(conn))
            conn.execute(sa.text("CREATE TABLE member (id INTEGER PRIMARY KEY)"))  # 외래 키가 가리키는 표(최소)
            with mock.patch.object(mig, "op", ops):
                m24 = self._load("0024_arcade_stamp")
                with mock.patch.object(m24, "op", ops):
                    m24.upgrade()
                conn.execute(sa.text("INSERT INTO arcade_stamp (member_id, stamp_date, game) VALUES (1, '2026-11-16', 'snake'), (2, '2026-11-16', 'chess')"))
                mig.upgrade()
                rows = conn.execute(sa.text("SELECT member_id, kind, ref FROM arcade_stamp ORDER BY id")).all()
                self.assertEqual([tuple(r) for r in rows], [(1, "PLAY", None), (2, "PLAY", None)])  # 기존 기록 = 일반
                conn.execute(sa.text("INSERT INTO arcade_stamp (member_id, stamp_date, game, kind, ref, rivals) VALUES (1, '2026-11-16', 'chess', 'WIN', 'match:7', '2')"))
                with self.assertRaises(IntegrityError):
                    with conn.begin_nested():
                        conn.execute(sa.text("INSERT INTO arcade_stamp (member_id, stamp_date, game, kind) VALUES (1, '2026-11-16', 'snake', 'WIN')"))
                mig.downgrade()
                cols = {c["name"] for c in sa.inspect(conn).get_columns("arcade_stamp")}
                self.assertNotIn("kind", cols)
                self.assertEqual(conn.execute(sa.text("SELECT count(*) FROM arcade_stamp")).scalar(), 2)  # 보너스 줄만 지움
                with self.assertRaises(IntegrityError):
                    with conn.begin_nested():
                        conn.execute(sa.text("INSERT INTO arcade_stamp (member_id, stamp_date, game) VALUES (1, '2026-11-16', 'x')"))


if __name__ == "__main__":
    unittest.main()
