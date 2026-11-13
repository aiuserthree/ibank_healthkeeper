"""여러 명 대전(선다운 범퍼스 최대 6명) — 초대 · 대기실 · 출발 · 결과 판정 · 순위 · 실시간 통로 시험 (실제 Postgres · Redis 없이).

DB 는 SQLite(메모리, aiosqlite), Redis 는 fakeredis 로 대신한다.
돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend <파이썬> -m unittest discover -s <저장소>/backend/tests -p "test_party.py" -v
"""

from __future__ import annotations

import asyncio
import os
import time
import unittest
from datetime import timedelta
from unittest import mock

os.environ.setdefault("DEBUG", "false")

from sqlalchemy import BigInteger  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402

from fastapi import HTTPException as AppError  # noqa: E402 — raise_app_error 는 HTTPException 을 던진다
from app.models import GameParty, GamePartySeat, Member, MemberStatus  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.services import party  # noqa: E402


@compiles(BigInteger, "sqlite")
def _bigint_sqlite(type_, compiler, **kw):  # SQLite 는 INTEGER 여야 스스로 번호가 붙는다
    return "INTEGER"


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class PartyFlow(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.engine = create_async_engine("sqlite+aiosqlite://")
        run(self._schema())
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        self.stamps = []
        self.notices = []
        self.now_ms = [10**12]
        patches = [
            mock.patch.object(party, "ensure_open", lambda **kw: None),
            mock.patch.object(party, "_give_stamp", self._stamp),
            mock.patch.object(party.teams_service, "enqueue_party_invited_notice", self._notice),
            mock.patch("app.services.match._real_person", lambda p: True),
            mock.patch.object(party, "_now_ms", lambda: self.now_ms[0]),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.people = run(self._people())

    def tearDown(self):
        run(self.engine.dispose())
        self.loop.close()

    async def _schema(self):
        def make(conn):
            # 회원에 딸린 표(관계로 함께 읽힘)까지 — SQLite 가 못 만드는 표(Postgres 전용 형식)는 건너뛴다
            for t in Base.metadata.sorted_tables:
                try:
                    t.create(conn)
                except Exception:  # noqa: BLE001
                    pass
        async with self.engine.begin() as c:
            await c.run_sync(make)

    async def _people(self):
        async with self.Session() as db:
            out = []
            for i, name in enumerate(["주인", "가", "나", "다", "라", "마", "바"], 1):
                m = Member(id=i, email=f"u{i}@3ibank.com", name=name, status=MemberStatus.ACTIVE, entra_oid=f"oid-{i}")
                db.add(m)
                out.append(m)
            await db.commit()
            return out

    async def _stamp(self, db, member, key, today):
        self.stamps.append((member.id, key))
        return {"new": True}

    async def _notice(self, db, **kw):
        self.notices.append(kw["target"].id)
        return [len(self.notices)]

    def call(self, fn, who, *args):
        async def go():
            async with self.Session() as db:
                m = await db.get(Member, who)
                return await fn(db, m, *args)
        return run(go())

    def result(self, cars_done, winner, track=1):
        order = [None] * 6
        for i, t in cars_done.items():
            order[i] = t
        dist = [1.0 if order[i] is not None else 0.5 for i in range(6)]
        return {"winner": winner, "order": order, "dist": dist, "track": track, "sec": 60.0}

    def open_race(self, guests=(2, 3, 4), joins=(2, 3), track=1):
        data, notify = self.call(party.create, 1, "bumpervs", list(guests), track)
        self.assertEqual(sorted(self.notices), sorted(guests))
        pid = data["id"]
        for g in joins:
            self.call(party.accept, g, pid)
        d = self.call(party.start, 1, pid, list(joins), track)
        self.assertEqual(d["status"], "RACING")
        self.now_ms[0] = int(time.time() * 1000) + 40_000  # 출발 40초 뒤
        return pid, d

    # ── 시험 ──

    def test_create_accept_start(self):
        data, notify = self.call(party.create, 1, "bumpervs", [2, 3, 4])
        self.assertEqual(data["status"], "OPEN")
        self.assertEqual([s["seat"] for s in data["seats"]], ["HOST", "INVITED", "INVITED", "INVITED"])
        self.assertEqual(len(notify), 3)
        pid = data["id"]
        ov = self.call(party.overview, 2, "bumpervs")
        self.assertEqual([x["id"] for x in ov["invites"]], [pid])
        self.assertEqual(self.call(party.incoming_count, 2, "bumpervs"), 1)
        self.call(party.accept, 2, pid)
        self.call(party.decline, 4, pid)
        with self.assertRaises(AppError):
            self.call(party.start, 2, pid, [], 1)  # 주인만 출발
        with self.assertRaises(AppError):
            self.call(party.start, 1, pid, [3], 1)  # 3 은 아직 안 들어옴 → 달릴 사람 부족
        d = self.call(party.start, 1, pid, [2, 3], 2)
        self.assertEqual(d["players"], [1, 2])
        self.assertEqual(d["bots"], [2, 3, 4, 5])
        self.assertEqual(d["track"], 2)
        with self.assertRaises(AppError):
            self.call(party.accept, 3, pid)  # 출발한 뒤에는 못 들어옴

    def test_human_winner_counts(self):
        pid, d = self.open_race()
        r = self.result({1: 40.0, 0: 41.0, 3: 42.0}, winner=1)
        self.call(party.report, 1, pid, r)
        self.call(party.report, 2, pid, r)
        out = self.call(party.report, 3, pid, r)
        self.assertEqual(out["status"], "DONE")
        self.assertEqual(out["winner"]["id"], 2)
        self.assertEqual(out["endReason"], "FINISH")
        self.assertEqual(sorted(x for x, _ in self.stamps), [1, 2, 3])
        wins = run(self._wins())
        self.assertEqual(list(wins), [2])

    async def _wins(self):
        async with self.Session() as db:
            return await party.ranking_wins(db, "bumpervs")

    def test_bot_winner_no_win(self):
        pid, d = self.open_race(joins=(2,))
        r = self.result({4: 38.0, 0: 40.0}, winner=4)
        self.call(party.report, 1, pid, r)
        out = self.call(party.report, 2, pid, r)
        self.assertEqual(out["endReason"], "BOT")
        self.assertIsNone(out["winner"])
        self.assertEqual(run(self._wins()), {})
        self.assertEqual(len(self.stamps), 2)  # 그래도 참여 도장

    def test_mismatch_no_count(self):
        pid, d = self.open_race(joins=(2,))
        self.call(party.report, 1, pid, self.result({0: 40.0}, winner=0))
        out = self.call(party.report, 2, pid, self.result({1: 40.0}, winner=1))
        self.assertEqual(out["endReason"], "MISMATCH")
        self.assertEqual(self.stamps, [])
        self.assertEqual(run(self._wins()), {})

    def test_majority_and_timeout(self):
        pid, d = self.open_race(joins=(2, 3))
        good = self.result({0: 40.0}, winner=0)
        self.call(party.report, 1, pid, good)
        self.call(party.report, 2, pid, good)  # 3 은 안 보냄
        # 기한(첫 보고 + 3분)이 지나면 받은 것으로 판정
        async def expire():
            async with self.Session() as db:
                p = await db.get(GameParty, pid)
                p.deadline_at = party.now_kst() - timedelta(seconds=1)
                await db.commit()
        run(expire())
        out = self.call(party.detail, 1, pid)
        self.assertEqual(out["status"], "DONE")
        self.assertEqual(out["winner"]["id"], 1)
        self.assertEqual(sorted(x for x, _ in self.stamps), [1, 2])

    def test_bad_results(self):
        pid, d = self.open_race(joins=(2,))
        self.now_ms[0] -= 30_000  # 출발 10초 뒤
        with self.assertRaises(AppError):
            self.call(party.report, 1, pid, self.result({0: 40.0}, winner=0))
        self.now_ms[0] += 30_000
        bad = [
            self.result({0: 10.0}, winner=0),  # 너무 빠른 기록
            self.result({0: 40.0}, winner=1),  # 못 들어온 차가 1등
            {**self.result({0: 40.0}, winner=0), "order": [40.0]},  # 차 수가 다름
            {**self.result({0: 40.0}, winner=0), "track": 9},
            {**self.result({0: 40.0}, winner=0), "winner": True},
        ]
        for b in bad:
            with self.assertRaises(AppError):
                self.call(party.report, 1, pid, b)
        with self.assertRaises(AppError):
            self.call(party.report, 3, pid, self.result({0: 40.0}, winner=0))  # 달리지 않은 사람

    def test_cancel_and_invite_more(self):
        data, _ = self.call(party.create, 1, "bumpervs", [2])
        pid = data["id"]
        d, notify = self.call(party.invite, 1, pid, [3, 4, 5, 6])
        self.assertEqual(len(notify), 4)
        with self.assertRaises(AppError):
            self.call(party.invite, 1, pid, [7])  # 7명째
        with self.assertRaises(AppError):
            self.call(party.invite, 2, pid, [7])  # 주인만
        d = self.call(party.decline, 1, pid)
        self.assertEqual(d["status"], "CANCELLED")

    def test_rt_seat(self):
        data, _ = self.call(party.create, 1, "bumpervs", [2, 3])
        pid = data["id"]
        self.call(party.accept, 2, pid)

        async def seat(mid):
            async with self.Session() as db:
                return await party.seat_for_rt(db, pid, mid)
        self.assertEqual(run(seat(1))[:2], ("host", "OPEN"))
        self.assertEqual(run(seat(2))[0], "guest")
        self.assertIsNone(run(seat(3)))  # 아직 안 들어옴
        self.assertIsNone(run(seat(5)))


class PartyRealtime(unittest.TestCase):
    """실시간 통로 — 주인 ↔ 손님 둘. fakeredis 로 pub/sub · Lua 를 대신한다."""

    def test_relay(self):
        import fakeredis
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from app.core.deps import get_redis_client
        from app.routers import realtime_party, realtime_ws

        server = fakeredis.FakeServer()
        app = FastAPI()
        app.include_router(realtime_party.router, prefix="/api")

        async def redis_dep():
            return fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

        app.dependency_overrides[get_redis_client] = redis_dep
        seats = {1: ("host", "OPEN", [1, 2, 3]), 2: ("guest", "OPEN", [1, 2, 3]), 3: ("guest", "OPEN", [1, 2, 3])}

        async def who(redis, sid):
            return realtime_ws.RtMember(int(sid), MemberStatus.ACTIVE.value, sid) if sid else None

        async def seat(pid, mid):
            return seats.get(mid)

        with mock.patch.object(realtime_party, "member_from_session", who), mock.patch.object(realtime_party, "load_party_seat", seat):
            cookie = realtime_party.get_settings().session_cookie_name
            c = TestClient(app)
            self.assertEqual(c.get("/api/play/rt-check/party/9", cookies={cookie: "5"}).json(), {"ok": False, "code": "MATCH_NOT_FOUND"})
            with c.websocket_connect("/api/play/rt/party/9", cookies={cookie: "1"}) as h:
                hello = h.receive_json()
                self.assertEqual((hello["role"], hello["here"]), ("host", []))
                with c.websocket_connect("/api/play/rt/party/9", cookies={cookie: "2"}) as g2, c.websocket_connect("/api/play/rt/party/9", cookies={cookie: "3"}) as g3:
                    self.assertEqual(g2.receive_json()["peerHere"], True)
                    self.assertEqual(g3.receive_json()["role"], "guest")
                    got = {h.receive_json()["id"], h.receive_json()["id"]}
                    self.assertEqual(got, {2, 3})
                    g2.send_json({"t": "in", "a": 1})
                    self.assertEqual(h.receive_json(), {"t": "in", "a": 1, "from": 2})
                    h.send_json({"t": "s", "d": 1})
                    self.assertEqual(g2.receive_json(), {"t": "s", "d": 1, "from": "host"})
                    self.assertEqual(g3.receive_json(), {"t": "s", "d": 1, "from": "host"})
                    h.send_json({"t": "only", "to": 3})
                    self.assertEqual(g3.receive_json(), {"t": "only", "from": "host"})
                    g3.send_json({"t": "x", "to": 2, "from": 99})
                    self.assertEqual(h.receive_json(), {"t": "x", "from": 3})  # 손님은 주인에게만 · from 은 서버가 정한다


if __name__ == "__main__":
    unittest.main()
