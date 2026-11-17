"""참여 도장 · 대전 승리 보너스 시험 — 사내 동료(사람)를 이긴 날은 도장 2개(일반 1 + 보너스 1), 하루 최대 2개 · 보너스는 한 달 5개까지.

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

    def noon(self):
        return datetime.combine(self.day[0], datetime.min.time(), tzinfo=KST).replace(hour=12)

    def finish_match(self, a, b, winner, reason="FIVE", bot=None, game="gomoku", moves=12, state=None, played_sec=600):
        """끝난 1:1 판을 만들고 공통 지점(_stamp_both)을 지난다 — a 가 마지막에 둔 사람. 판은 played_sec 초 전에 시작(수락)."""
        async def go(db):
            end = self.noon()
            st = {**(state or {}), "_at": int((end - timedelta(seconds=played_sec)).timestamp() * 1000)}
            m = GameMatch(
                game=game, challenger_id=a, opponent_id=None if bot else b, bot=bot, black_id=a, status="DONE",
                moves=[[i, 0] for i in range(moves)], state=st, winner_id=winner, end_reason=reason,
                finished_at=end,
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
        # 마지막 수를 둔 쪽이 진 사람이어도(상대가 이겨 끝난 판) 이긴 사람은 공통 지점에서 보너스
        mid, mine = self.finish_match(2, 1, winner=1, reason="FIVE", moves=12)
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
        # 10수 전에 기권한 판은 도장도 순위도 없다. 10수 넘게 둔 뒤 기권승은 순위 · 일반 도장은 그대로지만 보너스는 없다
        self.finish_match(2, 1, winner=1, reason="RESIGN", moves=3)
        self.assertEqual(self.today_count(1), 0)
        mid, _ = self.finish_match(2, 1, winner=1, reason="RESIGN", moves=10)
        self.assertEqual(self.today_count(1), 1)
        self.assertEqual(self.wins(1), [])
        self.assertIsNone(self.view(1, mid)["winBonus"])
        self.assertEqual(self.view(1, mid)["result"], "win")  # 결과 · 전적은 그대로

    def test_engine_game_resign_counts_by_min_acts(self):
        # 엔진 게임 — 행동 수 _v 가 MIN_ACTS 미만인 기권은 안 셈, 넘었으면 일반 도장만(기권승은 보너스 없음)
        self.finish_match(2, 1, winner=1, reason="RESIGN", game="boxes", moves=0, state={"_v": 2})
        self.assertEqual(self.today_count(1), 0)
        self.finish_match(2, 1, winner=1, reason="RESIGN", game="boxes", moves=0, state={"_v": 10})
        self.assertEqual(self.today_count(1), 1)
        self.assertEqual(self.wins(1), [])

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
        self.assertIsNone(self.view(1, mid)["winBonus"])  # 기권승은 보너스 없음
        self.assertEqual(self.view(1, mid)["result"], "win")
        self.assertEqual(self.today_count(1), 1)
        self.assertEqual(self.today_count(2), 1)

    # ── 한 달 한도 (WIN_BONUS_MONTHLY_CAP = 5) — 상대가 누구든 ──

    def wins(self, who):
        return [r for r in self.stamps(who) if r[1] == "WIN"]

    def test_cap_is_five(self):
        self.assertEqual(game_service.WIN_BONUS_MONTHLY_CAP, 5)

    def test_same_rival_every_day_keeps_giving(self):
        # 같은 상대를 날마다 이겨도(어느 쪽이 이기든) 날짜가 다르면 계속 받는다 — 쌍 규칙 없음
        for i, (a, b, w) in enumerate([(1, 2, 1), (2, 1, 2), (1, 2, 1)]):
            self.day[0] = date(2026, 11, 10) + timedelta(days=i)
            mid, _ = self.finish_match(a, b, winner=w)
            self.assertEqual(self.view(w, mid)["winBonus"], "got")
        self.assertEqual(len(self.wins(1)), 2)
        self.assertEqual(len(self.wins(2)), 1)

    def test_month_cap_five_then_full(self):
        for i in range(5):  # 같은 상대 2 를 11/2 ~ 11/6 날마다 이김 → 5개
            self.day[0] = date(2026, 11, 2) + timedelta(days=i)
            mid, mine = self.finish_match(1, 2, winner=1)
            self.assertTrue(mine["bonus"]["new"])
            self.assertEqual((mine["bonus"]["month"], mine["bonus"]["monthCap"]), (i + 1, 5))
            v = self.view(1, mid)
            self.assertEqual(v["winBonus"], "got")
            self.assertEqual(v["winBonusMonth"], {"count": i + 1, "cap": 5})  # 토스트 「이번 달 n/5」
        self.assertEqual(len(self.wins(1)), 5)
        # 6번째(다른 상대여도) — 이번 달 한도 다 참, 일반 도장은 그대로
        self.day[0] = date(2026, 11, 7)
        mid, mine = self.finish_match(1, 3, winner=1)
        self.assertFalse(mine["bonus"]["new"])
        self.assertTrue(mine["bonus"]["full"])
        self.assertEqual(mine["bonus"]["month"], 5)
        self.assertEqual(len(self.wins(1)), 5)
        self.assertEqual(self.today_count(1), 1)
        v = self.view(1, mid)
        self.assertEqual(v["winBonus"], "full")
        self.assertEqual(v["winBonusMonth"], {"count": 5, "cap": 5})
        st = self.db(lambda db: self._status(db, 1))
        self.assertEqual((st["winMonth"], st["winMonthCap"]), (5, 5))  # 도장판 「이번 달 대전 보너스 5/5」
        # 여러 명 대전 1등이어도 한도는 같다
        self.day[0] = date(2026, 11, 8)
        pid = self.finish_party([1, 4, 5], winner_seat=0)
        self.assertEqual(len(self.wins(1)), 5)

        async def pv(db):
            return await party._view(db, await db.get(Member, 1), await db.get(GameParty, pid))
        self.assertEqual(self.db(pv)["winBonus"], "full")
        # 진 상대 쪽은 아무 표시 없음
        self.assertIsNone(self.view(3, mid)["winBonus"])
        self.assertIsNone(self.view(3, mid)["winBonusMonth"])

    def test_next_month_again(self):
        for i in range(5):  # 11/26 ~ 11/30 — 그달 마지막 날까지 5개
            self.day[0] = date(2026, 11, 26) + timedelta(days=i)
            self.finish_match(1, 2, winner=1)
        self.assertEqual(len(self.wins(1)), 5)
        self.day[0] = date(2026, 12, 1)  # 바로 다음 날이 새 달 — 다시 받는다
        mid, mine = self.finish_match(1, 2, winner=1)
        self.assertTrue(mine["bonus"]["new"])
        self.assertEqual(mine["bonus"]["month"], 1)
        self.assertEqual(self.view(1, mid)["winBonusMonth"], {"count": 1, "cap": 5})
        st = self.db(lambda db: self._status(db, 1))
        self.assertEqual(st["winMonth"], 1)

    def test_daily_limit_message_before_full(self):
        # 오늘 이미 받았으면 5번째였어도 「오늘 이미」(한도 문구보다 먼저)
        for i in range(5):
            self.day[0] = date(2026, 11, 2) + timedelta(days=i)
            self.finish_match(1, 2, winner=1)
        mid, mine = self.finish_match(1, 2, winner=1)  # 11/6 같은 날 또
        self.assertTrue(mine["bonus"]["already"])
        self.assertFalse(mine["bonus"]["full"])
        self.assertEqual(self.view(1, mid)["winBonus"], "already")
        self.assertEqual(self.today_count(1), 2)

    def test_party_same_people_again(self):
        # 여러 명 대전도 같은 사람들과 다시 해서 이기면 날마다 받는다(「새 동료」 조건 없음)
        for i in range(2):
            self.day[0] = date(2026, 11, 10) + timedelta(days=i)
            pid = self.finish_party([1, 2, 3], winner_seat=0)
            win = self.wins(1)[-1]
            self.assertEqual((win[2], win[3]), (f"party:{pid}", "2,3"))  # 판정 근거 · 상대 기록은 그대로
        self.assertEqual(len(self.wins(1)), 2)

    # ── 꼼수 막기 — 보너스만 엄격하게(결과 · 순위 · 일반 도장은 그대로) ──

    def test_timeout_win_no_bonus(self):
        mid, _ = self.finish_match(2, 1, winner=1, reason="TIMEOUT", moves=12)
        self.assertEqual(self.wins(1), [])
        self.assertIsNone(self.view(1, mid)["winBonus"])

    def test_too_short_game_no_bonus(self):
        # 시작 뒤 WIN_BONUS_MIN_SEC(60초) 안에 끝난 판은 보너스 없음 — 일반 도장은 그대로
        self.assertEqual(match.WIN_BONUS_MIN_SEC, 60)
        mid, _ = self.finish_match(1, 2, winner=1, played_sec=59)
        self.assertEqual(self.wins(1), [])
        self.assertEqual(self.today_count(1), 1)
        self.assertIsNone(self.view(1, mid)["winBonus"])
        self.finish_match(1, 2, winner=1, played_sec=60)
        self.assertEqual(len(self.wins(1)), 1)

    def test_classic_few_moves_no_bonus(self):
        self.assertEqual(match.WIN_BONUS_MIN_MOVES, 10)
        self.finish_match(1, 2, winner=1, moves=9)  # 오목 9수 만에 끝(상대가 막지 않음) — 보너스 없음
        self.assertEqual(self.wins(1), [])
        self.assertEqual(self.today_count(1), 1)
        self.finish_match(1, 2, winner=1, moves=10)
        self.assertEqual(len(self.wins(1)), 1)

    def test_report_game_needs_agreement_and_engine_min_time(self):
        # 결과를 보고하는 게임(배구) — 두 사람 보고가 맞아 끝난 판(SCORE)만, 그리고 엔진 MIN_PLAY_SEC(40초) 이상
        self.finish_match(1, 2, winner=None, reason="MISMATCH", game="volley", moves=0)
        self.assertEqual(self.today_count(1), 0)
        self.finish_match(1, 2, winner=1, reason="SCORE", game="volley", moves=0, played_sec=39)
        self.assertEqual(self.wins(1), [])
        self.day[0] = DAY + timedelta(days=1)
        self.finish_match(1, 2, winner=1, reason="SCORE", game="volley", moves=0, played_sec=41)
        self.assertEqual(len(self.wins(1)), 1)

    def test_old_match_without_start_uses_created_at(self):
        # 배포 전에 시작한 판(state 에 시작 시각 없음)은 도전을 건 시각으로 잰다
        async def go(db):
            end = self.noon()
            m = GameMatch(game="gomoku", challenger_id=1, opponent_id=2, black_id=1, status="DONE", moves=[[i, 0] for i in range(12)],
                          winner_id=1, end_reason="FIVE", finished_at=end, created_at=end - timedelta(minutes=30))
            db.add(m)
            await db.commit()
            return m
        m = self.db(go)
        self.assertTrue(match._bonus_win(m))
        m.created_at = self.noon() - timedelta(seconds=10)
        self.assertFalse(match._bonus_win(m))

    def test_accept_records_start_and_blocks_self(self):
        async def make(db, a, b):
            m = GameMatch(game="gomoku", challenger_id=a, opponent_id=b, status="PENDING", moves=[],
                          deadline_at=self.noon() + timedelta(hours=1))
            db.add(m)
            await db.commit()
            return m.id
        mid = self.db(lambda db: make(db, 1, 2))
        with mock.patch.object(match.teams_service, "enqueue_match_accepted_notice", mock.AsyncMock(return_value=[])):
            self.db(lambda db: self._accept(db, 2, mid))
        m = self.db(lambda db: db.get(GameMatch, mid))
        self.assertEqual(m.status, "ACTIVE")
        self.assertIsInstance((m.state or {}).get("_at"), int)  # 판 시작 시각(보너스 최소 시간)
        # 자기 자신과의 판 — 도전도, (혹시 있는 판의) 수락도 막는다
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as e:
            self.db(lambda db: self._create(db, 1, 1))
        self.assertIn("MATCH_BAD_OPPONENT", str(e.exception.detail))
        bad = self.db(lambda db: make(db, 1, 1))
        with self.assertRaises(HTTPException) as e:
            self.db(lambda db: self._accept(db, 1, bad))
        self.assertIn("MATCH_NOT_PENDING", str(e.exception.detail))

    def test_engine_state_keeps_start_time(self):
        # 엔진이 행동마다 state 를 새 dict 로 바꿔도 판 시작 시각(_at)은 남는다
        class Eng:
            STALE_CHECK = False

            @staticmethod
            def act(m, member_id, data, now):
                m.state = {"fresh": True}
                return None

        m = GameMatch(game="x", challenger_id=1, opponent_id=2, status="ACTIVE", moves=[], state={"_v": 3, "_at": 123})
        with mock.patch.object(match, "_waiting", lambda m: {1}), mock.patch.object(match, "_next_deadline", lambda *a: None):
            run(match._engine_move(m, Eng, 1, 3, {}))
        self.assertEqual((m.state["_at"], m.state["_v"], m.state["fresh"]), (123, 4, True))

    async def _accept(self, db, who, mid):
        return await match.accept(db, await db.get(Member, who), mid)

    async def _create(self, db, who, rival):
        return await match.create(db, await db.get(Member, who), rival)

    def test_self_rival_no_bonus(self):
        async def go(db):
            return await game_service.give_win_bonus(db, await db.get(Member, 1), "gomoku", self.day[0], "match:1", [1])
        out = self.db(go)
        self.assertFalse(out["new"])
        self.assertEqual(self.wins(1), [])
        # 1:1 판이 같은 사람끼리면(있을 수 없는 판) 보너스 없음
        self.finish_match(1, 1, winner=1)
        self.assertEqual(self.wins(1), [])

    def test_concurrent_insert_becomes_already(self):
        # 거의 동시에 끝난 다른 판이 오늘 보너스 줄을 먼저 넣은 경우 — 유니크 키 오류를 잡아 「오늘 이미」(500 아님)
        real = game_service.win_bonus_month_count
        sneaked = []

        async def sneak(db, member_id, day):
            if not sneaked:
                sneaked.append(1)
                await db.execute(sa.text(
                    "INSERT INTO arcade_stamp (member_id, stamp_date, game, kind, ref, created_at) "
                    "VALUES (:m, :d, 'chess', 'WIN', 'match:777', CURRENT_TIMESTAMP)"), {"m": member_id, "d": day})
            return await real(db, member_id, day)

        with mock.patch.object(game_service, "win_bonus_month_count", sneak):
            mid, mine = self.finish_match(1, 2, winner=1)
        self.assertFalse(mine["bonus"]["new"])
        self.assertTrue(mine["bonus"]["already"])
        self.assertEqual([r[2] for r in self.wins(1)], ["match:777"])
        self.assertEqual(self.today_count(1), 2)  # 일반 도장도 그대로 찍힘
        self.assertEqual(self.today_count(2), 1)  # 진 사람 도장도 빠지지 않음

    def test_bonus_day_is_finish_day(self):
        # 11/30 23:59:59 에 끝난 판을 자정 넘어 처리해도 보너스는 끝난 날(11월 몫)
        self.day[0] = date(2026, 12, 1)

        async def go(db):
            end = datetime(2026, 11, 30, 23, 59, 59, tzinfo=KST)
            m = GameMatch(game="gomoku", challenger_id=1, opponent_id=2, black_id=1, status="DONE", moves=[[i, 0] for i in range(12)],
                          state={"_at": int((end - timedelta(minutes=5)).timestamp() * 1000)},
                          winner_id=1, end_reason="FIVE", finished_at=end)
            db.add(m)
            await db.commit()
            await match._stamp_both(db, m, await db.get(Member, 1))
        self.db(go)
        self.assertEqual([r[0] for r in self.wins(1)], [date(2026, 11, 30)])

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

    def test_party_majority_only_no_bonus(self):
        # 3명 중 2명만 같은 결과(1명은 다른 결과) — 판 결과 · 순위는 다수대로, 1등 보너스는 없음
        pid = self.finish_party([1, 2, 3], winner_seat=1, agreed=[2, 3])
        self.assertEqual(self.wins(2), [])
        self.assertEqual(self.today_count(2), 1)
        self.assertEqual(self.today_count(1), 0)  # 다른 결과를 보낸 사람은 도장도 없음(기존 규칙)

        async def v(db):
            return await party._view(db, await db.get(Member, 2), await db.get(GameParty, pid))
        out = self.db(v)
        self.assertEqual(out["result"], "win")
        self.assertIsNone(out["winBonus"])

    def test_party_someone_did_not_report_no_bonus(self):
        # 사람 한 명이 결과를 보내지 않음(손 놓음 · 연결 끊김) — 나머지가 같아도 보너스 없음
        self.finish_party([1, 2, 3], winner_seat=0, agreed=[1, 2])
        self.assertEqual(self.wins(1), [])
        self.assertEqual(self.today_count(1), 1)

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
        for i in range(5):
            self.day[0] = date(2026, 11, 2) + timedelta(days=i)
            self.finish_match(1, 2, winner=1)
        coupons = self.db(lambda db: self._coupons(db, 1))
        self.assertEqual(coupons, 1)  # 하루 2개 × 5일 = 10개 → 쿠폰 1장
        st = self.db(lambda db: self._status(db, 1))
        self.assertTrue(st["done"])
        self.assertEqual(st["count"], 10)
        # 같은 달에 또 10개를 채워도 쿠폰은 월 1장 — 다 찬 판은 기다림(pending), 그동안은 쌓지 않는다
        # (이번 달 대전 보너스 5개를 다 받아 이제 하루 1개씩 — 10일)
        for i in range(5, 16):
            self.day[0] = date(2026, 11, 2) + timedelta(days=i)
            self.finish_match(1, 2, winner=1)
        self.assertEqual(len(self.wins(1)), 5)
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
