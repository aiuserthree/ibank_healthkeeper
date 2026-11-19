"""관리자 「아케이드 이용현황」(arcade_stats) — 여러 명 대전(game_party)도 판 수에 드는지 시험 (실제 Postgres 없이).

DB 는 SQLite(메모리, aiosqlite). 가짜 회원 · 가짜 판만 쓴다.
돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend <파이썬> -m unittest discover -s <저장소>/backend/tests -p "test_arcade_stats.py" -v
"""

from __future__ import annotations

import asyncio
import os
import unittest
from datetime import date, datetime, timedelta

os.environ.setdefault("DEBUG", "false")

from sqlalchemy import BigInteger  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402

from app.core.time import KST  # noqa: E402
from app.models import ArcadeStamp, GameMatch, GameParty, GamePartySeat, GamePlay, Member, MemberStatus  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.services import arcade_stats  # noqa: E402
from app.services import party as party_service  # noqa: E402


@compiles(BigInteger, "sqlite")
def _bigint_sqlite(type_, compiler, **kw):  # SQLite 는 INTEGER 여야 스스로 번호가 붙는다
    return "INTEGER"


DAY = date(2026, 11, 18)
AT = datetime(2026, 11, 18, 12, 40, tzinfo=KST)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class ArcadeStatsParty(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.engine = create_async_engine("sqlite+aiosqlite://")
        run(self._schema())
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        run(self._people())

    def tearDown(self):
        run(self.engine.dispose())
        self.loop.close()

    async def _schema(self):
        def make(conn):
            for t in Base.metadata.sorted_tables:
                try:
                    t.create(conn)
                except Exception:  # noqa: BLE001 — SQLite 가 못 만드는 표(Postgres 전용 형식)는 건너뛴다
                    pass
        async with self.engine.begin() as c:
            await c.run_sync(make)

    async def _people(self):
        async with self.Session() as db:
            for i in range(1, 10):
                db.add(Member(id=i, email=f"u{i}@example.com", name=f"사람{i}", department="가부" if i <= 5 else "나부",
                              status=MemberStatus.ACTIVE, entra_oid=f"oid-{i}"))
            await db.commit()

    def add(self, *rows):
        async def go():
            async with self.Session() as db:
                for r in rows:
                    db.add(r)
                await db.commit()
        run(go())

    def party(self, pid, players, *, game="bumpervs", status="DONE", reason="FINISH", extra_seats=(), at=AT):
        """끝난 여러 명 대전 한 판 — players[0] 이 주인, 나머지는 들어옴(JOINED). extra_seats 는 (id, 자리 상태)."""
        p = GameParty(id=pid, game=game, host_id=players[0], status=status, end_reason=reason,
                      state={"players": list(players), "bots": list(range(len(players), 6))},
                      winner_id=players[0] if reason in party_service.WIN_REASONS else None,
                      started_at=at - timedelta(minutes=3), finished_at=at)
        seats = [GamePartySeat(party_id=pid, member_id=players[0], status="HOST")]
        seats += [GamePartySeat(party_id=pid, member_id=m, status="JOINED") for m in players[1:]]
        seats += [GamePartySeat(party_id=pid, member_id=m, status=s) for m, s in extra_seats]
        self.add(p, *seats)

    def stats(self):
        async def go():
            async with self.Session() as db:
                return await arcade_stats.admin_arcade_stats(db, DAY, DAY)
        return run(go())

    @staticmethod
    def person(out, mid):
        return next((p for p in out["people"] if p["id"] == mid), None)

    @staticmethod
    def game(out, key):
        return next(g for g in out["games"] if g["key"] == key)

    # ① 끝난 여러 명 대전 한 판 = 달린 사람 각각 1판, 게임별은 1판
    def test_six_player_party_counts_each_runner_once(self):
        self.party(1, [1, 2, 3, 4, 5, 6])
        out = self.stats()
        self.assertEqual(out["summary"]["plays"], 1)
        self.assertEqual(out["summary"]["versus"], 1)
        self.assertEqual(out["summary"]["players"], 6)
        g = self.game(out, "bumpervs")
        self.assertEqual((g["plays"], g["members"], g["kind"]), (1, 6, "versus"))
        for mid in range(1, 7):
            p = self.person(out, mid)
            self.assertEqual(p["plays"], 1, mid)
            self.assertEqual(p["last"], DAY.isoformat())
        day = next(d for d in out["daily"] if d["date"] == DAY.isoformat())
        self.assertEqual((day["members"], day["versus"]), (6, 1))
        self.assertEqual(out["hours"][12], 1)
        self.assertEqual(out["weekdays"][DAY.weekday()], 1)
        dept = {d["name"]: d for d in out["departments"]}
        self.assertEqual((dept["가부"]["active"], dept["가부"]["plays"]), (5, 5))
        self.assertEqual((dept["나부"]["active"], dept["나부"]["plays"]), (1, 1))

    def test_jelly_and_mansion_parties_count_as_versus(self):
        self.party(1, [1, 2, 3], game="jellyvs", reason="BIGGEST")
        self.party(2, [1, 2], game="mansion", reason="WIN")
        self.party(3, [4, 5], game="jellyvs", reason="BOT")
        self.party(4, [4, 5], game="bumpervs", reason="DRAW")
        out = self.stats()
        self.assertEqual(out["summary"]["versus"], 4)
        self.assertEqual(self.game(out, "jellyvs")["plays"], 2)
        self.assertEqual(self.game(out, "mansion")["kind"], "versus")
        self.assertEqual(self.person(out, 1)["plays"], 2)
        self.assertEqual(self.person(out, 4)["plays"], 2)

    # ② 닫힘 · 만료 · 무효 판은 안 잡힌다
    def test_cancelled_expired_and_void_parties_ignored(self):
        self.party(1, [1, 2], status="CANCELLED", reason=None)
        self.party(2, [1, 2], status="EXPIRED", reason=None)
        self.party(3, [1, 2], reason="MISMATCH")
        self.party(4, [1, 2], reason="NO_REPORT")
        self.party(5, [1, 2], status="RACING", reason=None)
        self.party(6, [1, 2], at=AT - timedelta(days=1))  # 기간 밖(끝난 날 기준)
        out = self.stats()
        self.assertEqual(out["summary"]["plays"], 0)
        self.assertEqual(self.game(out, "bumpervs")["plays"], 0)
        self.assertEqual(out["people"], [])

    def test_counted_ends_match_party_reasons(self):
        # 세는 끝 + 무효 두 가지 = party.py 의 끝 이유 전부(새 끝이 생기면 여기서 알린다)
        self.assertEqual(set(arcade_stats.PARTY_COUNT_ENDS) | {"MISMATCH", "NO_REPORT"}, set(party_service.REASONS))
        self.assertTrue(set(party_service.WIN_REASONS) <= set(arcade_stats.PARTY_COUNT_ENDS))

    # ③ 초대만 받은 사람 · 거절 · 나간 사람 · 대기실에 있었지만 안 달린 사람은 안 잡힌다
    def test_only_runners_counted(self):
        self.party(1, [1, 2, 3], extra_seats=[(4, "INVITED"), (5, "DECLINED"), (6, "LEFT"), (7, "JOINED")])
        out = self.stats()
        for mid in (1, 2, 3):
            self.assertEqual(self.person(out, mid)["plays"], 1)
        for mid in (4, 5, 6, 7):
            self.assertIsNone(self.person(out, mid), mid)
        self.assertEqual(self.game(out, "bumpervs")["members"], 3)

    # ④ 여러 명 대전을 한 사람의 게임 목록에 「0판(연습)」이 아니라 판 수가 나온다
    def test_person_game_list_shows_party_plays_not_practice(self):
        self.party(1, [1, 2, 3, 4, 5, 6])
        self.party(2, [1, 2, 3, 4, 5, 6], at=AT + timedelta(minutes=5))
        self.add(*[ArcadeStamp(member_id=m, stamp_date=DAY, game="bumpervs") for m in range(1, 7)])
        out = self.stats()
        p = self.person(out, 3)
        g = next(x for x in p["games"] if x["key"] == "bumpervs")
        self.assertEqual((g["plays"], g["stamps"]), (2, 1))
        self.assertEqual(p["favorite"], arcade_stats.GAMES["bumpervs"].title)
        self.assertEqual(p["favoritePlays"], 2)
        self.assertEqual(self.game(out, "bumpervs")["plays"], 2)

    # ⑤ 1:1 대전 · 혼자 하는 게임 · 진짜 연습(도장만)은 그대로
    def test_match_solo_and_practice_unchanged(self):
        solo_game = next(k for k in arcade_stats.GAMES if arcade_stats._kind(k) == "solo")
        self.add(
            GamePlay(member_id=8, game=solo_game, score=100, played_on=DAY, played_at=AT),
            GameMatch(game="gomoku", challenger_id=8, opponent_id=9, status="DONE", moves=[[0, 0]] * 12,
                      winner_id=8, end_reason="FIVE", finished_at=AT),
            ArcadeStamp(member_id=9, stamp_date=DAY, game=solo_game),  # 9 는 그 게임을 연습으로만
        )
        self.party(1, [1, 2])
        out = self.stats()
        s = out["summary"]
        self.assertEqual((s["plays"], s["solo"], s["versus"]), (3, 1, 2))
        self.assertEqual(self.person(out, 8)["plays"], 2)
        p9 = self.person(out, 9)
        self.assertEqual(p9["plays"], 1)
        practice = next(x for x in p9["games"] if x["key"] == solo_game)
        self.assertEqual((practice["plays"], practice["stamps"]), (0, 1))
        self.assertEqual(self.game(out, "gomoku")["plays"], 1)


if __name__ == "__main__":
    unittest.main()
