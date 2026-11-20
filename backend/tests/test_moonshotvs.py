"""뿅뿅 달나라 대포 대전 엔진(versus_moonshotvs) 시험 — 결과 검사 · 두 결과 대조 · 무효 · 기한 · 부정 입력 · 순위 반영 · 기존 대전에 영향 없음.

DB 가 필요한 흐름(도전 → 수락 → 두 사람 결과 → 순위)은 SQLite(메모리, aiosqlite)로 대신한다(실제 Postgres · Redis · Teams 없이).
돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend <파이썬> -m unittest <저장소>/backend/tests/test_moonshotvs.py -v
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import re
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

os.environ.setdefault("DEBUG", "false")

from fastapi import HTTPException as AppError  # noqa: E402 — raise_app_error 는 HTTPException 을 던진다
from sqlalchemy import BigInteger, event  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402

from app.core.time import KST  # noqa: E402
from app.models import GameMatch, Member, MemberStatus  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.services import game as game_service  # noqa: E402
from app.services import match, party  # noqa: E402
from app.services import versus_moonshotvs as mv  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
EMBED = ROOT / "web" / "games" / "embed" / "moonshot.html"
HOST, GUEST = 11, 22

# 화면 엔진(src/sim.js — M.encodeAct)이 만든 줄 그대로: 앞 여섯은 씨앗 12345 · 고리 행성 · 두더지 대 부엉이 · 컴퓨터(어려움)끼리 한 판,
# 뒤 셋은 이동 · 넘김 꼴(같은 encodeAct 로 다시 만들어도 같은 글자인지 확인함)
GOLDEN = [
    '{"m":[],"a":403,"p":798,"w":"starsplit","f":-1}',
    '{"m":[],"a":236,"p":806,"w":"drill","f":1,"i":"king"}',
    '{"m":[],"a":238,"p":893,"w":"starsplit","f":-1}',
    '{"m":[],"a":328,"p":707,"w":"drill","f":1,"i":"again"}',
    '{"m":[],"a":610,"p":659,"w":"drill","f":1}',
    '{"m":[],"a":511,"p":612,"w":"firefly","f":-1,"i":"band"}',
    '{"m":[[1,12],[-1,3]],"a":-120,"p":0,"w":"mochi","f":-1}',
    '{"m":[[-1,40]],"pass":1}',
    '{"m":[],"pass":1}',
]


def log_of(n):
    return [GOLDEN[i % len(GOLDEN)] for i in range(n)]


def result(**kw):
    d = {"winner": "host", "how": "hp", "hash": "5d6c077e", "turns": 12, "sec": 312.4, "map": 5, "ver": "m1-023b46ca", "log": log_of(13)}
    d.update(kw)
    return d


def new_match(seed=7):
    m = SimpleNamespace(challenger_id=HOST, opponent_id=GUEST, state=None, status="ACTIVE", end_reason=None)
    m.state = mv.start(m, (HOST, GUEST), random.Random(seed))
    return m


def later(m, sec=200):
    """수락 뒤 sec 초가 지난 시각."""
    return datetime.fromtimestamp(m.state["at"] / 1000 + sec, tz=timezone.utc)


class LineTest(unittest.TestCase):
    def test_engine_lines_pass_as_is(self):
        for s in GOLDEN:
            self.assertEqual(mv.clean_line(s), s, s)

    def test_bad_lines(self):
        bad = [
            None, 3, "", "[]", "{", '{"m":[],"p":798,"a":403,"w":"starsplit","f":-1}',  # 키 순서가 다름
            '{"m": [], "a": 403, "p": 798, "w": "starsplit", "f": -1}',  # 띄어 씀(엔진 글자와 다름)
            '{"m":[[true,1]],"pass":1}', '{"m":[[1,0]],"pass":1}', '{"m":[[2,1]],"pass":1}', '{"m":[[1,3001]],"pass":1}',
            '{"m":[[1,2000],[1,1001]],"pass":1}', '{"m":[[1]],"pass":1}', '{"m":{},"pass":1}',
            '{"m":[],"a":901,"p":10,"w":"mochi","f":1}', '{"m":[],"a":10,"p":1001,"w":"mochi","f":1}', '{"m":[],"a":10,"p":-1,"w":"mochi","f":1}',
            '{"m":[],"a":10.5,"p":10,"w":"mochi","f":1}', '{"m":[],"a":10,"p":10,"w":"laser","f":1}', '{"m":[],"a":10,"p":10,"w":"mochi","f":0}',
            '{"m":[],"a":10,"p":10,"w":"mochi","f":true}', '{"m":[],"a":10,"p":10,"w":"mochi","f":1,"i":"nuke"}',
            '{"m":[],"pass":1,"a":3}', '{"m":[],"a":10,"p":10,"w":"mochi","f":1,"x":1}', "x" * (mv.LINE_CHARS + 1),
        ]
        for s in bad:
            self.assertIsNone(mv.clean_line(s), repr(s)[:80])

    def test_too_many_move_parts(self):
        s = json.dumps({"m": [[1, 1]] * (mv.MOVE_PARTS + 1), "pass": 1}, separators=(",", ":"))
        self.assertIsNone(mv.clean_line(s))

    def test_keys_match_engine_file(self):
        # 서버 무기 · 아이템 · 맵 수 · 차례 상한이 화면 엔진(본체 파일 안 엔진 덩어리)과 같은지
        html = EMBED.read_text(encoding="utf-8")
        eng = re.search(r'<script id="moonshot-sim">(.*?)</script>', html, re.S).group(1)
        wblock = re.search(r"var WEAPONS = \{(.*?)\n  \};", eng, re.S).group(1)
        weapons = tuple(re.findall(r"^\s{4}(\w+):\s+\{ name:", wblock, re.M))
        self.assertEqual(weapons, mv.WEAPONS)
        items = tuple(re.findall(r"'(\w+)'", re.search(r"var ITEM_KEYS = \[(.*?)\];", eng).group(1)))
        self.assertEqual(items, mv.ITEMS)
        maps = re.findall(r"'(\w+)'", re.search(r"var MAP_KEYS = \[(.*?)\];", eng).group(1))
        self.assertEqual(len(maps), mv.MAP_COUNT)
        self.assertIn(f"var TURN_CAP = {mv.TURN_CAP};", eng)
        self.assertIn(f"var AIM_TICKS = {mv.TURN_SEC} * TPS;", eng)


class CheckTest(unittest.TestCase):
    def test_ok(self):
        got = mv._check(result())
        self.assertEqual(got["rep"]["winner"], "host")
        self.assertEqual(len(got["log"]), 13)

    def test_winner_how_agree(self):
        for w, h in (("host", "both"), ("guest", "cap"), ("draw", "hp"), ("draw", "sea"), ("draw", "more")):
            with self.assertRaises(AppError, msg=(w, h)):
                mv._check(result(winner=w, how=h))
        for w, h in (("host", "sea"), ("guest", "more"), ("draw", "both"), ("draw", "cap")):
            mv._check(result(winner=w, how=h))

    def test_bad_fields(self):
        bad = [
            {"winner": "me"}, {"how": "boom"}, {"hash": "5D6C077E"}, {"hash": "5d6c077"}, {"hash": 12}, {"ver": "m2-023b46ca"}, {"ver": "m1-023b46c"},
            {"turns": 0}, {"turns": mv.TURN_CAP + 1}, {"turns": 3.0}, {"turns": True}, {"map": 0}, {"map": mv.MAP_COUNT + 1}, {"map": "2"},
            {"sec": -1}, {"sec": mv.MAX_SEC + 1}, {"sec": "10"}, {"sec": True}, {"op": "score"},
            {"log": "x"}, {"log": log_of(9)}, {"log": log_of(17)}, {"log": log_of(13)[:-1] + ['{"m":[],"a":1,"p":1,"w":"laser","f":1}']},
            {"log": log_of(13)[:-1] + [5]},
        ]
        for kw in bad:
            with self.assertRaises(AppError, msg=repr(kw)[:80]):
                mv._check(result(**kw))

    def test_log_length_window(self):
        mv._check(result(turns=12, log=log_of(10)))  # 차례 수 − 2(끝 차례에 쏘지 않고 끝남 등)
        mv._check(result(turns=12, log=log_of(16)))  # + 4(「한 번 더」 둘째 발)
        mv._check(result(turns=1, log=[]))

    def test_log_char_cap(self):
        big = '{"m":[' + ",".join(["[1,1]"] * 380) + '],"pass":1}'
        self.assertEqual(mv.clean_line(big), big)
        with self.assertRaises(AppError):
            mv._check(result(turns=120, log=[big] * 120))


class FlowTest(unittest.TestCase):
    def test_start_has_server_seed(self):
        a, b = new_match(1), new_match(2)
        for m in (a, b):
            self.assertIsInstance(m.state["seed"], int)
            self.assertTrue(0 <= m.state["seed"] < 2**32)
        self.assertNotEqual(a.state["seed"], b.state["seed"])
        self.assertEqual(a.state["p"], [HOST, GUEST])
        self.assertIsInstance(mv.start(SimpleNamespace(challenger_id=1, opponent_id=2), (1, 2), None)["seed"], int)  # rnd 없이도

    def test_both_same(self):
        m = new_match()
        now = later(m)
        self.assertIsNone(mv.act(m, HOST, result(), now))
        self.assertEqual(mv.waiting_for(m), {GUEST})
        res = mv.act(m, GUEST, result(sec=313.0), now + timedelta(seconds=1))  # 경기 초는 화면마다 조금 달라도 된다
        self.assertEqual(res, (HOST, "HP"))
        self.assertEqual(m.state["final"]["log"], log_of(13))
        m.status, m.end_reason = "DONE", res[1]
        self.assertTrue(mv.counts(m))
        v = mv.view(m, GUEST, True)
        self.assertEqual((v["role"], v["how"], v["turns"], v["map"]), ("guest", "hp", 12, 5))

    def test_guest_wins_and_reasons(self):
        for how, reason in (("sea", "SEA"), ("more", "MORE")):
            m = new_match()
            mv.act(m, HOST, result(winner="guest", how=how), later(m))
            self.assertEqual(mv.act(m, GUEST, result(winner="guest", how=how), later(m)), (GUEST, reason))

    def test_draw(self):
        for how in ("both", "cap"):
            m = new_match()
            mv.act(m, GUEST, result(winner="draw", how=how), later(m))
            res = mv.act(m, HOST, result(winner="draw", how=how), later(m))
            self.assertEqual(res, (None, "DRAW"))
            m.status, m.end_reason = "DONE", "DRAW"
            self.assertTrue(mv.counts(m))

    def test_mismatch(self):
        for k, v in (("hash", "00000000"), ("winner", "guest"), ("turns", 13), ("map", 2), ("ver", "m1-ffffffff")):
            m = new_match()
            mv.act(m, HOST, result(), later(m))
            other = result(**{k: v})
            if k == "winner":
                other["how"] = "hp"
            res = mv.act(m, GUEST, other, later(m))
            self.assertEqual(res, (None, "MISMATCH"), k)
            m.status, m.end_reason = "DONE", res[1]
            self.assertFalse(mv.counts(m))
            self.assertNotIn("final", m.state)

    def test_log_not_compared(self):
        # 끝 해시가 같으면 행동 줄은 견주지 않는다 — host 것을 적어 둔다
        m = new_match()
        mv.act(m, GUEST, result(log=log_of(12)), later(m))
        self.assertEqual(mv.act(m, HOST, result(), later(m)), (HOST, "HP"))
        self.assertEqual(len(m.state["final"]["log"]), 13)

    def test_too_early_and_twice(self):
        m = new_match()
        with self.assertRaises(AppError) as e:
            mv.act(m, HOST, result(), later(m, mv.MIN_PLAY_SEC - 1))
        self.assertEqual(e.exception.status_code, 409)
        self.assertEqual(mv.waiting_for(m), {HOST, GUEST})
        mv.act(m, HOST, result(), later(m, mv.MIN_PLAY_SEC))
        with self.assertRaises(AppError):
            mv.act(m, HOST, result(), later(m, 300))

    def test_outsider_and_garbage(self):
        m = new_match()
        for data in (None, [], "x", {"winner": "host"}):
            with self.assertRaises(AppError):
                mv.act(m, HOST, data, later(m))
        with self.assertRaises(AppError):
            mv.act(m, 99, result(), later(m))
        with self.assertRaises(AppError):
            mv.act(m, 99, {"op": "void"}, later(m))
        self.assertEqual(m.state["rep"], {})

    def test_void_by_one_ends_without_winner(self):
        m = new_match()
        mv.act(m, HOST, result(), later(m))
        res = mv.act(m, GUEST, {"op": "void"}, later(m, 1))  # 시작 직후에도(판이 어긋남) — 이긴 사람 없음
        self.assertEqual(res, (None, "VOID"))
        m.status, m.end_reason = "DONE", "VOID"
        self.assertFalse(mv.counts(m))
        self.assertIn("VOID", mv.DRAWS)

    def test_timeout_and_deadline(self):
        m = new_match()
        start = later(m, 0)
        self.assertEqual(mv.next_deadline(m, start), datetime.fromtimestamp(m.state["until"] / 1000, tz=timezone.utc))
        mv.act(m, HOST, result(), later(m, 100))
        dl = mv.next_deadline(m, later(m, 100))
        self.assertEqual(dl, later(m, 100 + mv.AFTER_REPORT_MIN * 60))
        self.assertEqual(mv.on_timeout(m, dl), (None, "TIMEOUT_DRAW"))
        m.status, m.end_reason = "DONE", "TIMEOUT_DRAW"
        self.assertFalse(mv.counts(m))
        m.end_reason = "RESIGN"
        self.assertFalse(mv.counts(m))

    def test_view_seed_only_on_board(self):
        m = new_match()
        self.assertNotIn("seed", mv.view(m, HOST, False))
        v = mv.view(m, HOST, True)
        self.assertEqual(v["seed"], m.state["seed"])
        self.assertEqual(v["reported"], {"me": False, "rival": False})
        self.assertNotIn("how", v)
        mv.act(m, GUEST, result(), later(m))
        self.assertEqual(mv.view(m, HOST, True)["reported"], {"me": False, "rival": True})


class RegistryTest(unittest.TestCase):
    def test_engine_and_realtime_lists_only_grow(self):
        from app.routers import realtime_ws

        old_engine = ("baseball", "boxes", "quizduel", "gostop", "memory", "soccer", "volley", "rummy", "alkkagi", "bumpervs", "jellyvs")
        self.assertEqual(match.ENGINE_GAMES[: len(old_engine)], old_engine)
        self.assertEqual(match.ENGINE_GAMES[len(old_engine):], ("moonshotvs",))
        self.assertEqual(match.MATCH_GAMES, ("gomoku", "chess", *old_engine, "moonshotvs"))
        self.assertEqual(realtime_ws.REALTIME_GAMES, ("soccer", "volley", "bumpervs", "jellyvs", "moonshotvs"))
        self.assertIs(match._engine("moonshotvs"), mv)
        for g in old_engine:
            self.assertIsNotNone(match._engine(g))

    def test_not_listed_yet(self):
        # 2 · 3단계 — 아케이드 목록 · 주간 소개에는 아직 올리지 않음(4단계)
        from app.services import teams

        self.assertIn("moonshotvs", game_service.GAMES)  # 4단계 — 아케이드 목록에 올림(시험 test_moonshotvs_static.py). 주간 소개는 아직(PM 몫)
        self.assertIn("moonshotvs", party.PARTY_GAMES)  # 3단계 — 팀전은 여러 명 대전(party 팀 게임 갈래)에 올림(시험 test_moonshotvs_team.py)
        self.assertNotIn("moonshotvs", [k for k, *_ in teams.OPEN_NOTICE_GAMES])
        self.assertFalse(mv.SUPPORTS_BOT)
        self.assertFalse(mv.STALE_CHECK)


# ── 실제 대전 흐름(match.py) — 도전 · 수락 · 두 사람 결과 · 순위 · 도장 ──
@compiles(BigInteger, "sqlite")
def _bigint_sqlite(type_, compiler, **kw):  # SQLite 는 INTEGER 여야 스스로 번호가 붙는다
    return "INTEGER"


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


DAY = date(2026, 11, 20)


class MatchFlowTest(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.engine = create_async_engine("sqlite+aiosqlite://")

        @event.listens_for(self.engine.sync_engine, "connect")
        def _fns(conn, _):
            conn.create_function("split_part", 3, lambda v, sep, n: ((v or "").split(sep) + [""] * n)[n - 1])

        run(self._schema())
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        self.clock = [datetime.combine(DAY, datetime.min.time(), tzinfo=KST).replace(hour=12)]
        now = lambda: self.clock[0]  # noqa: E731
        today = lambda: self.clock[0].date()  # noqa: E731
        patches = [
            mock.patch.object(game_service, "today_kst", today),
            mock.patch.object(game_service, "now_kst", now),
            mock.patch.object(match, "today_kst", today),
            mock.patch.object(match, "now_kst", now),
            mock.patch.object(mv, "_now_ms", lambda: int(self.clock[0].timestamp() * 1000)),
            mock.patch.object(match, "ensure_open", lambda **kw: None),
            mock.patch.object(match, "_publish", mock.AsyncMock()),
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
            for i, name in enumerate(["가", "나", "다"], 1):
                db.add(Member(id=i, email=f"u{i}@3ibank.com", name=name, status=MemberStatus.ACTIVE, entra_oid=f"oid-{i}"))
            await db.commit()

    def db(self, fn):
        async def go():
            async with self.Session() as db:
                return await fn(db)
        return run(go())

    def me(self, db, i):
        return db.get(Member, i)

    def challenge(self, a, b):
        async def go(db):
            view, _ = await match.create(db, await self.me(db, a), b, "moonshotvs")
            return view["id"]
        mid = self.db(go)

        async def acc(db):
            view, _ = await match.accept(db, await self.me(db, b), mid)
            return view
        return mid, self.db(acc)

    def report(self, who, mid, data):
        async def go(db):
            d = await match.detail(db, await self.me(db, who), mid)
            return await match.move(db, await self.me(db, who), mid, None, None, None, d["seq"], data)
        return self.db(go)

    def overview(self, who):
        async def go(db):
            return await match.overview(db, await self.me(db, who), "moonshotvs")
        return self.db(go)

    def test_full_flow_ranking(self):
        mid, v = self.challenge(1, 2)
        self.assertEqual((v["status"], v["role"]), ("ACTIVE", "guest"))
        self.assertIsInstance(v["seed"], int)
        self.assertTrue(v["myTurn"])  # 결과를 아직 안 보냄 = 들어갈 판
        self.clock[0] += timedelta(seconds=mv.MIN_PLAY_SEC - 5)
        with self.assertRaises(AppError):
            self.report(1, mid, result())
        self.clock[0] += timedelta(minutes=5)
        r1 = self.report(1, mid, result())
        self.assertEqual(r1["status"], "ACTIVE")
        self.assertEqual(r1["reported"], {"me": True, "rival": False})
        r2 = self.report(2, mid, result())
        self.assertEqual((r2["status"], r2["result"], r2["endReason"], r2["reasonLabel"]), ("DONE", "lose", "HP", "체력을 다 깎음"))
        self.assertEqual(r2["how"], "hp")
        o1 = self.overview(1)
        self.assertEqual((o1["ranking"]["me"]["wins"], o1["ranking"]["me"]["losses"]), (1, 0))
        self.assertEqual(o1["recent"][0]["result"], "win")
        o2 = self.overview(2)
        self.assertEqual((o2["ranking"]["me"]["wins"], o2["ranking"]["me"]["losses"]), (0, 1))

    def test_mismatch_void_resign_not_ranked(self):
        # 결과가 다름 · 무효 · 기권 — 순위에 들어가지 않는다
        mid, _ = self.challenge(1, 2)
        self.clock[0] += timedelta(minutes=5)
        self.report(1, mid, result())
        d = self.report(2, mid, result(hash="00000000"))
        self.assertEqual((d["status"], d["result"], d["endReason"]), ("DONE", "draw", "MISMATCH"))
        mid2, _ = self.challenge(1, 2)
        self.clock[0] += timedelta(seconds=10)
        d2 = self.report(2, mid2, {"op": "void"})
        self.assertEqual((d2["status"], d2["result"], d2["endReason"]), ("DONE", "draw", "VOID"))
        mid3, _ = self.challenge(2, 1)

        async def resign(db):
            return await match.resign(db, await self.me(db, 1), mid3)
        d3 = self.db(resign)
        self.assertEqual((d3["status"], d3["result"], d3["endReason"]), ("DONE", "lose", "RESIGN"))
        o = self.overview(2)
        self.assertIsNone(o["ranking"]["me"])
        self.assertEqual(len(o["recent"]), 3)

    def test_no_bot_and_hidden_rules(self):
        async def bot(db):
            return await match.start_bot(db, await self.me(db, 1), "normal", "moonshotvs")
        with self.assertRaises(AppError):
            self.db(bot)

    def test_same_rival_one_win_per_day(self):
        for _ in range(2):
            mid, _ = self.challenge(1, 2)
            self.clock[0] += timedelta(minutes=5)
            self.report(1, mid, result())
            self.report(2, mid, result())
        o1 = self.overview(1)
        self.assertEqual(o1["ranking"]["me"]["wins"], 1)  # 같은 상대 하루 1승


if __name__ == "__main__":
    unittest.main()
