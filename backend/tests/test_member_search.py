"""동료 고르기 목록(검색어 없음) 순서 — ① 최근 함께 ② 같은 부서 ③ 요즘 아케이드(최근 순) ④ 최근 로그인 순.
이름순(가나다)만으로 채우면 김씨만 줄줄이 나오던 것을 막는다.
  cd /tmp && PYTHONPATH=<저장소>/backend <파이썬> -m unittest discover -s <저장소>/backend/tests -p "test_member_search.py" -v
"""
from __future__ import annotations

import asyncio
import os
import unittest
from datetime import date, timedelta
from unittest import mock

os.environ.setdefault("DEBUG", "false")

from sqlalchemy import BigInteger, event  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402

from app.core.time import now_kst  # noqa: E402
from app.models import GamePlay, Member, MemberStatus  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.services import match as match_service  # noqa: E402


@compiles(BigInteger, "sqlite")
def _bigint_sqlite(type_, compiler, **kw):
    return "INTEGER"


def run(loop, coro):
    return loop.run_until_complete(coro)


class MemberSearch(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        self.engine = create_async_engine("sqlite+aiosqlite://")

        @event.listens_for(self.engine.sync_engine, "connect")
        def _fns(conn, _):
            conn.create_function("split_part", 3, lambda v, sep, n: ((v or "").split(sep) + [""] * n)[n - 1])

        def make(conn):
            for t in Base.metadata.sorted_tables:
                try:
                    t.create(conn)
                except Exception:  # noqa: BLE001
                    pass

        async def schema():
            async with self.engine.begin() as c:
                await c.run_sync(make)

        run(self.loop, schema())
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        p = mock.patch("app.services.match._real_person", lambda m: True)
        p.start()
        self.addCleanup(p.stop)

    def tearDown(self):
        run(self.loop, self.engine.dispose())
        self.loop.close()

    def test_order_without_query(self):
        now = now_kst()
        people = [  # (id, 이름, 부서, 마지막 로그인 몇 시간 전)
            (1, "나", "솔루션개발", 1),
            (2, "김가", "영업", 50), (3, "김나", "영업", 40), (4, "김다", "영업", 30),
            (5, "박팀", "솔루션개발", 90),  # 같은 부서
            (6, "이놀이", "재무", 80),  # 요즘 아케이드(가장 최근)
            (7, "최놀이", "재무", 70),  # 요즘 아케이드
            (8, "정로그인", "인사", 2),  # 최근 로그인
        ]

        async def go():
            async with self.Session() as db:
                for i, name, dept, h in people:
                    db.add(Member(id=i, email=f"u{i}@3ibank.com", name=name, department=dept, status=MemberStatus.ACTIVE,
                                  entra_oid=f"oid-{i}", last_login_at=now - timedelta(hours=h)))
                await db.flush()
                db.add(GamePlay(member_id=7, game="tetris", score=10, played_on=date.today(), played_at=now - timedelta(days=2)))
                db.add(GamePlay(member_id=6, game="tetris", score=10, played_on=date.today(), played_at=now - timedelta(hours=3)))
                db.add(GamePlay(member_id=2, game="tetris", score=10, played_on=date.today(), played_at=now - timedelta(days=20)))  # 오래전 — 요즘 아님
                await db.commit()
                me = await db.get(Member, 1)
                out = await match_service.search_members(db, me, "")
                found = await match_service.search_members(db, me, "김")
                return out, found

        out, found = run(self.loop, go())
        self.assertEqual([x["id"] for x in out], [5, 6, 7, 8, 4, 3, 2])
        self.assertEqual([x["tag"] for x in out[:3]], ["team", "active", "active"])
        self.assertEqual(sorted(x["id"] for x in found), [2, 3, 4])  # 이름 검색은 그대로


if __name__ == "__main__":
    unittest.main()
