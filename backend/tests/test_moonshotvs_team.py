"""뿅뿅 달나라 대포 대전 팀전(2:2 · 3:3) — 여러 명 대전(party.py)의 팀 게임 옵트인 갈래 시험 (실제 Postgres · Redis 없이).

DB 는 SQLite(메모리, aiosqlite). 기존 party 시험(test_party.py)은 그대로 두고, 팀 갈래만 여기서 본다.
돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend <파이썬> -m unittest discover -s <저장소>/backend/tests -p "test_moonshotvs_team.py" -v
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import unittest
from unittest import mock

os.environ.setdefault("DEBUG", "false")

from sqlalchemy import BigInteger, event  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402

from fastapi import HTTPException as AppError  # noqa: E402
from app.models import GameParty, Member, MemberStatus  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.services import party  # noqa: E402


@compiles(BigInteger, "sqlite")
def _bigint_sqlite(type_, compiler, **kw):
    return "INTEGER"


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


PASS = json.dumps({"m": [], "pass": 1}, separators=(",", ":"))
SHOT = json.dumps({"m": [[1, 4]], "a": 450, "p": 620, "w": "mochi", "f": 1}, separators=(",", ":"))


def result(winner=0, how="hp", h="0badc0de", turns=20, mp=2, ver="m1-023b46ca", log=None, sec=300.0):
    return {"winner": winner, "how": how, "hash": h, "turns": turns, "sec": sec, "map": mp, "ver": ver,
            "log": log if log is not None else [SHOT if i % 2 else PASS for i in range(turns)]}


class TeamFlow(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.engine = create_async_engine("sqlite+aiosqlite://")

        @event.listens_for(self.engine.sync_engine, "connect")
        def _fns(conn, _):
            conn.create_function("split_part", 3, lambda v, sep, n: ((v or "").split(sep) + [""] * n)[n - 1])
        run(self._schema())
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        self.stamps, self.bonus = [], []
        self.now_ms = [10**12]
        patches = [
            mock.patch.object(party, "ensure_open", lambda **kw: None),
            mock.patch.object(party, "_give_stamp", self._stamp),
            mock.patch.object(party, "give_win_bonus", self._bonus),
            mock.patch.object(party.teams_service, "enqueue_party_invited_notice", self._notice),
            mock.patch("app.services.match._real_person", lambda p: True),
            mock.patch.object(party, "_now_ms", lambda: self.now_ms[0]),
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
                except Exception:  # noqa: BLE001
                    pass
        async with self.engine.begin() as c:
            await c.run_sync(make)

    async def _people(self):
        async with self.Session() as db:
            for i, name in enumerate(["주인", "가", "나", "다", "라", "마", "바"], 1):
                db.add(Member(id=i, email=f"u{i}@3ibank.com", name=name, status=MemberStatus.ACTIVE, entra_oid=f"oid-{i}"))
            await db.commit()

    async def _stamp(self, db, member, key, today):
        self.stamps.append((member.id, key))
        return {"new": True}

    async def _bonus(self, db, member, key, today, ref, rivals):
        self.bonus.append((member.id, key, tuple(sorted(rivals))))
        return {"new": True}

    async def _notice(self, db, **kw):
        return []

    def call(self, fn, who, *args, **kw):
        async def go():
            async with self.Session() as db:
                m = await db.get(Member, who)
                return await fn(db, m, *args, **kw)
        return run(go())

    def raw(self, pid):
        async def go():
            async with self.Session() as db:
                return await db.get(GameParty, pid)
        return run(go())

    def code(self, fn, *a, **kw):
        with self.assertRaises(AppError) as cm:
            fn(*a, **kw)
        d = cm.exception.detail
        return (d.get("error") or d).get("code") if isinstance(d, dict) else d

    def open_team(self, guests=(2, 3, 4), joins=(2, 3, 4), size=2, lineup=None, mp=2, level=None):
        data, _ = self.call(party.create, 1, "moonshotvs", list(guests), mp)
        pid = data["id"]
        for g in joins:
            self.call(party.accept, g, pid)
        d = self.call(party.start, 1, pid, list(joins), mp, size, level, lineup)
        self.assertEqual(d["status"], "RACING")
        self.now_ms[0] = int(time.time() * 1000) + 60_000  # 출발 1분 뒤
        return pid, d

    def report(self, who, pid, data):
        return self.call(party.report, who, pid, data)

    # ── 출발 · 자리 ──
    def test_default_lineup_abab(self):
        pid, d = self.open_team()
        st = self.raw(pid).state
        self.assertEqual(st["lineup"], [1, 2, 3, 4])
        self.assertEqual(st["teams"], [0, 1, 0, 1])
        self.assertEqual(st["players"], [1, 2, 3, 4])
        self.assertEqual(st["bots"], [])
        self.assertEqual(st["teamSize"], 2)
        self.assertEqual(st["botLevel"], "normal")
        self.assertEqual(st["track"], 2)
        self.assertTrue(0 <= st["seed"] < 2**32)
        self.assertTrue(d["teamGame"])
        self.assertEqual([x["id"] for x in d["lineup"]], [1, 2, 3, 4])
        self.assertEqual([x["team"] for x in d["lineup"]], [0, 1, 0, 1])
        self.assertEqual(d["mySeatNo"], 0)
        self.assertEqual(d["seed"], st["seed"])
        g = self.call(party.detail, 3, pid)
        self.assertEqual(g["mySeatNo"], 2)
        self.assertEqual(g["seed"], st["seed"])

    def test_lineup_with_bots_3v3(self):
        pid, d = self.open_team(guests=(2, 3), joins=(2, 3), size=3, lineup=[1, None, 2, 3, None, None], mp=5, level="hard")
        st = self.raw(pid).state
        self.assertEqual(st["lineup"], [1, None, 2, 3, None, None])
        self.assertEqual(st["players"], [1, 2, 3])
        self.assertEqual(st["bots"], [1, 4, 5])
        self.assertEqual(st["botLevel"], "hard")
        self.assertEqual(st["track"], 5)
        self.assertEqual([x["bot"] for x in d["lineup"]], [False, True, False, False, True, True])
        self.assertEqual(d["lineup"][1]["name"], "컴퓨터")

    def test_start_rejects_bad_teams(self):
        data, _ = self.call(party.create, 1, "moonshotvs", [2, 3, 4, 5, 6], 1)
        pid = data["id"]
        for g in (2, 3, 4, 5, 6):
            self.call(party.accept, g, pid)
        bad = [
            dict(team_size=None), dict(team_size=4), dict(team_size=True),
            dict(team_size=2, lineup=[1, 2, 3]),            # 길이
            dict(team_size=2, lineup=[1, 2, 2, None]),      # 같은 사람 두 번
            dict(team_size=2, lineup=[2, 3, None, None]),   # 주인 없음
            dict(team_size=2, lineup=[1, 7, None, None]),   # 들어오지 않은 사람
            dict(team_size=2, lineup=["1", 2, None, None]),
            dict(team_size=2, lineup=None, player_ids=[2, 3, 4, 5]),  # 2:2 에 다섯 사람
        ]
        for b in bad:
            ids = b.pop("player_ids", [2, 3, 4, 5, 6])
            self.assertEqual(self.code(self.call, party.start, 1, pid, ids, 1, b.get("team_size"), None, b.get("lineup")), "PARTY_BAD_TEAM", b)
        self.assertEqual(self.code(self.call, party.start, 1, pid, [], 1, 2, None, [1, None, None, None]), "PARTY_FEW")
        self.assertEqual(self.code(self.call, party.start, 2, pid, [], 1, 2, None, None), "PARTY_ONLY_HOST")
        self.assertEqual(self.raw(pid).status, "OPEN")
        d = self.call(party.start, 1, pid, [], 9, 3, "nope", [1, 2, 3, 4, 5, 6])
        self.assertEqual((d["status"], d["track"], d["botLevel"]), ("RACING", 6, "normal"))  # 맵은 1~6 으로 · 모르는 난이도는 보통

    def test_track_clamp(self):
        self.assertEqual([party._track("moonshotvs", t) for t in (0, 1, 3, 5, 6, 7, "x")], [1, 1, 3, 5, 6, 6, 1])  # 6 = 달빛 협곡 마을
        self.assertEqual(party._track("bumpervs", 9), 9)
        self.assertEqual(party._track("jellyvs", 9), 6)

    # ── 결과 · 판정 ──
    def test_team_win_everyone_agrees(self):
        pid, _ = self.open_team()  # A 1 · 3, B 2 · 4
        r = result(winner=1)
        for who in (1, 2, 3):
            self.assertEqual(self.report(who, pid, r)["status"], "RACING")
        d = self.report(4, pid, r)
        p = self.raw(pid)
        self.assertEqual((p.status, p.end_reason, p.winner_id), ("DONE", "WIN", 2))
        self.assertEqual(p.state["winners"], [2, 4])
        self.assertEqual(p.state["losers"], [1, 3])
        self.assertEqual(sorted(p.state["agreed"]), [1, 2, 3, 4])
        self.assertEqual(d["result"], "win")
        self.assertEqual(d["winners"], [2, 4])
        self.assertTrue(d["countsWin"])
        self.assertEqual(d["reasonLabel"], "상대 팀을 모두 쓰러뜨림")
        self.assertNotIn("log", d["final"])
        self.assertEqual(self.call(party.detail, 1, pid)["result"], "lose")
        self.assertEqual(sorted(self.stamps), [(1, "moonshotvs"), (2, "moonshotvs"), (3, "moonshotvs"), (4, "moonshotvs")])
        self.assertEqual(sorted(self.bonus), [(2, "moonshotvs", (1, 3)), (4, "moonshotvs", (1, 3))])
        wins = run(self._ranking())
        self.assertEqual(set(wins), {2, 4})
        self.assertEqual(len(wins[2]), 1)
        self.assertEqual(list(wins[2])[0][:2], ("party", (1, 3)))

    async def _ranking(self):
        async with self.Session() as db:
            return await party.ranking_wins(db, "moonshotvs")

    def test_same_people_same_day_one_win(self):
        for _ in range(2):
            pid, _ = self.open_team()
            for who in (1, 2, 3, 4):
                self.report(who, pid, result(winner=0))
        wins = run(self._ranking())
        self.assertEqual({k: len(v) for k, v in wins.items()}, {1: 1, 3: 1})

    def test_host_log_kept_guest_dropped(self):
        pid, _ = self.open_team()
        self.report(2, pid, result(winner=0, log=[PASS] * 20))
        self.assertNotIn("log", self.raw(pid).state)
        self.report(1, pid, result(winner=0, log=[SHOT] * 20))
        st = self.raw(pid).state
        self.assertEqual(st["log"], [SHOT] * 20)
        self.assertNotIn("log", st["rep"]["1"])
        for who in (3, 4):
            self.report(who, pid, result(winner=0))
        self.assertEqual(self.raw(pid).state["final"]["log"], [SHOT] * 20)

    def test_win_against_bot_team_no_win(self):
        pid, _ = self.open_team(guests=(2,), joins=(2,), lineup=[1, None, 2, None])  # 사람 둘이 A 팀
        for who in (1, 2):
            d = self.report(who, pid, result(winner=0))
        p = self.raw(pid)
        self.assertEqual((p.end_reason, p.winner_id), ("WIN", 1))
        self.assertEqual(d["result"], "win")
        self.assertFalse(d["countsWin"])
        self.assertEqual(run(self._ranking()), {})
        self.assertEqual(self.bonus, [])
        self.assertEqual(sorted(self.stamps), [(1, "moonshotvs"), (2, "moonshotvs")])  # 참여 도장은 그대로

    def test_bot_team_wins(self):
        pid, _ = self.open_team(guests=(2,), joins=(2,), lineup=[1, None, 2, None])
        for who in (1, 2):
            d = self.report(who, pid, result(winner=1, how="sea"))
        p = self.raw(pid)
        self.assertEqual((p.end_reason, p.winner_id), ("BOT", None))
        self.assertEqual(d["result"], "lose")
        self.assertEqual(d["reasonLabel"], "컴퓨터만 있는 팀이 이김")
        self.assertEqual(run(self._ranking()), {})

    def test_draw(self):
        pid, _ = self.open_team()
        for who in (1, 2, 3, 4):
            d = self.report(who, pid, result(winner=None, how="both"))
        p = self.raw(pid)
        self.assertEqual((p.end_reason, p.winner_id), ("DRAW", None))
        self.assertEqual(d["result"], "draw")
        self.assertEqual(len(self.stamps), 4)
        self.assertEqual(run(self._ranking()), {})
        pid, _ = self.open_team()
        for who in (1, 2, 3, 4):
            d = self.report(who, pid, result(winner=None, how="cap"))
        self.assertEqual(self.raw(pid).end_reason, "DRAW")
        pid, _ = self.open_team()
        for who in (1, 2, 3, 4):
            d = self.report(who, pid, result(winner=0, how="cap"))  # 상한 — 남은 체력 합이 많은 팀
        self.assertEqual(self.raw(pid).end_reason, "WIN")

    def test_majority_one_differs_no_bonus(self):
        pid, _ = self.open_team()
        for who in (1, 2, 3):
            self.report(who, pid, result(winner=1))
        d = self.report(4, pid, result(winner=1, h="deadbeef"))
        p = self.raw(pid)
        self.assertEqual((p.end_reason, p.state["winners"]), ("WIN", [2, 4]))
        self.assertEqual(sorted(p.state["agreed"]), [1, 2, 3])
        self.assertEqual(self.bonus, [])  # 사람 전원이 같은 결과가 아니면 보너스 없음
        self.assertEqual(sorted(x[0] for x in self.stamps), [1, 2, 3])
        self.assertEqual(set(run(self._ranking())), {2, 4})  # 순위는 과반 결과로
        self.assertEqual(d["result"], "win")

    def test_void_is_one_vote(self):
        pid, _ = self.open_team()
        for who in (1, 2, 3):
            self.report(who, pid, result(winner=0))
        self.report(4, pid, {"op": "void"})
        self.assertEqual(self.raw(pid).end_reason, "WIN")
        self.stamps.clear()
        pid, _ = self.open_team(guests=(2,), joins=(2,), lineup=[1, 2, None, None])
        self.report(1, pid, result(winner=0))
        d = self.report(2, pid, {"op": "void"})
        self.assertEqual((self.raw(pid).end_reason, d["result"]), ("MISMATCH", "none"))
        self.assertEqual(self.stamps, [])

    def test_two_people_disagree(self):
        pid, _ = self.open_team(guests=(2,), joins=(2,), lineup=[1, 2, None, None])
        self.report(1, pid, result(winner=0))
        self.report(2, pid, result(winner=0, turns=21, log=[PASS] * 21))
        self.assertEqual(self.raw(pid).end_reason, "MISMATCH")
        self.assertEqual(run(self._ranking()), {})

    def test_bad_results(self):
        pid, _ = self.open_team()
        bad = [
            result(mp=3),                                   # 출발 때 맵과 다름
            result(winner=None, how="hp"), result(winner=0, how="both"), result(winner=2), result(winner=True),
            result(how="boom"), result(h="XYZ"), result(ver="m2-00000000"), result(turns=0, log=[]),
            result(turns=121, log=[PASS] * 121),             # 2:2 상한 120차례
            result(log=[PASS] * 5),                          # 줄 수가 차례와 너무 다름
            result(log=["{\"m\":[],\"pass\":1 }"] + [PASS] * 19),   # 엔진 글자 그대로가 아님
            result(log=[json.dumps({"m": [], "a": 950, "p": 10, "w": "mochi", "f": 1}, separators=(",", ":"))] * 20),
            result(sec=-1), result(sec=99999), {"op": "nope"}, "x",
        ]
        for b in bad:
            self.assertEqual(self.code(self.report, 1, pid, b), "PARTY_BAD_RESULT", str(b)[:80])
        self.assertEqual(self.raw(pid).state["rep"], {})
        self.now_ms[0] -= 59_000  # 출발 1초 뒤
        self.assertEqual(self.code(self.report, 1, pid, result()), "PARTY_TOO_SOON")
        self.assertEqual(self.code(self.report, 7, pid, result()), "PARTY_NOT_RACING")

    def test_3v3_log_bounds(self):
        pid, _ = self.open_team(guests=(2, 3), joins=(2, 3), size=3, lineup=[1, 2, 3, None, None, None])
        self.report(1, pid, result(turns=180, log=[PASS] * 190))
        self.report(2, pid, result(turns=180, log=[PASS] * 190))
        self.report(3, pid, result(turns=180, log=[PASS] * 190))
        self.assertEqual(self.raw(pid).end_reason, "WIN")

    def test_timeout_judges_what_came(self):
        pid, _ = self.open_team()
        for who in (1, 2, 3):
            self.report(who, pid, result(winner=0))
        p = self.raw(pid)
        self.assertEqual(p.status, "RACING")

        async def expire():
            async with self.Session() as db:
                x = await db.get(GameParty, pid)
                x.deadline_at = party.now_kst() - party.timedelta(minutes=1)
                await db.commit()
                await party._sweep(db)
        run(expire())
        p = self.raw(pid)
        self.assertEqual((p.end_reason, p.state["winners"]), ("WIN", [1, 3]))

    # ── 짜고 치기 막기 · 긴 판(검증 반영) ──
    def test_same_team_collusion_no_win(self):
        # 2:2 를 사람 셋(같은 팀 1 · 3 + 상대 2) + 컴퓨터로 — 같은 팀 둘이 같은 거짓 결과를 내면 과반(2/3)이지만 진 팀 사람이 아무도 안 냈으니 승 없음
        pid, _ = self.open_team(guests=(2, 3), joins=(2, 3), lineup=[1, 2, 3, None])
        self.report(1, pid, result(winner=0))
        self.report(3, pid, result(winner=0))
        d = self.report(2, pid, result(winner=1, h="deadbeef"))
        p = self.raw(pid)
        self.assertEqual((p.end_reason, p.state["winners"], p.state["losers"]), ("WIN", [1, 3], [2]))
        self.assertEqual(sorted(p.state["agreed"]), [1, 3])
        self.assertEqual(run(self._ranking()), {})
        self.assertEqual(self.bonus, [])
        self.assertEqual(party._beaten(p), ())
        self.assertFalse(d["countsWin"])
        self.assertFalse(self.call(party.detail, 1, pid)["countsWin"])

    def test_one_loser_agrees_counts(self):
        # 진 팀 사람이 한 명이라도 같은 결과를 내면 이긴 팀 사람마다 1승
        pid, _ = self.open_team(guests=(2, 3), joins=(2, 3), lineup=[1, 2, 3, None])
        for who in (1, 3, 2):
            d = self.report(who, pid, result(winner=0))
        self.assertTrue(d["countsWin"])
        wins = run(self._ranking())
        self.assertEqual(set(wins), {1, 3})
        self.assertEqual(list(wins[1])[0][:2], ("party", (2,)))
        # 진 팀 둘 중 하나만 같은 결과(다른 하나는 다른 결과)여도 1승 — 상대는 진 팀 사람 모두
        self.bonus.clear()
        pid, _ = self.open_team(guests=(2, 3, 4, 5), joins=(2, 3, 4, 5), size=3, lineup=[1, 2, 3, 4, 5, None])
        for who in (1, 3, 5, 2):
            self.report(who, pid, result(winner=0))
        self.report(4, pid, result(winner=0, h="deadbeef"))
        p = self.raw(pid)
        self.assertEqual(party._beaten(p), (2, 4))
        self.assertEqual(self.bonus, [])  # 보너스는 사람 전원이 같을 때만(그대로)

    def test_loser_leaves_without_report_no_win(self):
        # 진 팀 사람이 결과를 안 보내고 나가면 — 기한에 이긴 팀 결과로 판은 끝나지만 승은 없음(「한쪽만 보냄」과 같은 뜻)
        pid, _ = self.open_team(guests=(2, 3), joins=(2, 3), lineup=[1, 2, 3, None])
        for who in (1, 3):
            self.report(who, pid, result(winner=0))

        async def expire():
            async with self.Session() as db:
                x = await db.get(GameParty, pid)
                x.deadline_at = party.now_kst() - party.timedelta(minutes=1)
                await db.commit()
                await party._sweep(db)
        run(expire())
        p = self.raw(pid)
        self.assertEqual((p.status, p.end_reason, p.state["winners"]), ("DONE", "WIN", [1, 3]))
        self.assertEqual(run(self._ranking()), {})
        self.assertEqual(self.bonus, [])
        self.assertFalse(self.call(party.detail, 1, pid)["countsWin"])

    def test_long_3v3_sec_and_deadline(self):
        # 3:3 상한 180차례 × 45초 = 8,100초까지 받는다 · 판 기한은 그보다 넉넉히(다른 게임 RACE_HOURS 1시간은 그대로)
        self.assertGreaterEqual(party.MOON_MAX_SEC, party.MOON_CAP_ROUNDS * 6 * 40)
        self.assertGreater(party.MOON_RACE_SEC, party.MOON_MAX_SEC)
        self.assertEqual(party.RACE_HOURS, 1)
        t0 = party.now_kst()
        pid, _ = self.open_team(guests=(2, 3), joins=(2, 3), size=3, lineup=[1, 2, 3, None, None, None])
        left = (party._aware(self.raw(pid).deadline_at) - t0).total_seconds()
        self.assertGreaterEqual(left, party.MOON_RACE_SEC - 5)
        for who in (1, 2, 3):
            self.report(who, pid, result(turns=180, log=[PASS] * 190, sec=7900.0))
        p = self.raw(pid)
        self.assertEqual((p.end_reason, p.state["final"]["sec"]), ("WIN", 7900.0))
        pid, _ = self.open_team()
        self.assertEqual(self.code(self.report, 1, pid, result(sec=party.MOON_MAX_SEC + 1)), "PARTY_BAD_RESULT")

    def test_rt_seat_and_overview(self):
        pid, _ = self.open_team()
        role = run(self._rt(pid, 1))
        self.assertEqual(role[0], "host")
        self.assertEqual(run(self._rt(pid, 3))[0], "guest")
        self.assertIsNone(run(self._rt(pid, 7)))
        o = self.call(party.overview, 2, "moonshotvs")
        self.assertEqual([x["id"] for x in o["open"]], [pid])
        self.assertTrue(o["open"][0]["teamGame"])

    async def _rt(self, pid, who):
        async with self.Session() as db:
            return await party.seat_for_rt(db, pid, who)

    # ── 다른 게임은 팀 갈래를 지나지 않음 ──
    def test_other_games_ignore_team_args(self):
        data, _ = self.call(party.create, 1, "bumpervs", [2, 3], 1)
        pid = data["id"]
        for g in (2, 3):
            self.call(party.accept, g, pid)
        d = self.call(party.start, 1, pid, [2, 3], 4, 2, "hard", [1, None, 2, 3])
        st = self.raw(pid).state
        self.assertEqual(st["players"], [1, 2, 3])
        self.assertEqual(st["bots"], [3, 4, 5])
        self.assertNotIn("lineup", st)
        self.assertNotIn("seed", st)
        self.assertNotIn("teamGame", d)
        self.assertEqual(d["track"], 4)
        self.assertEqual(party._winner_ids(self.raw(pid)), [])
        self.assertEqual(party.TEAM_GAMES, ("moonshotvs",))
        self.assertEqual(party.PARTY_GAMES, ("bumpervs", "mansion", "jellyvs", "moonshotvs"))
        self.assertEqual(set(party.REASONS), {"WIN", "BIGGEST", "FINISH", "FARTHER", "BOT", "DRAW", "MISMATCH", "NO_REPORT"})  # 이유 목록은 그대로(팀전은 같은 이유 · 다른 말)
        self.assertEqual(party.WIN_REASONS, ("FINISH", "FARTHER", "WIN", "BIGGEST"))

    def test_router_fields_default_none(self):
        from app.routers.play import PartyStart

        b = PartyStart(playerIds=[2, 3])
        self.assertEqual((b.track, b.teamSize, b.botLevel, b.lineup), (1, None, None, None))
        b = PartyStart(playerIds=[], track=3, teamSize=3, botLevel="easy", lineup=[1, None, 2, None, None, None])
        self.assertEqual(b.lineup, [1, None, 2, None, None, None])

    def test_api_js_team_start(self):
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "..", "..", "web", "_shared", "api.js"), encoding="utf-8") as f:
            js = f.read()
        self.assertIn("partyStartTeam: (id, body) =>", js)
        self.assertIn("partyStart: (id, playerIds, track) =>", js)  # 기존 줄 그대로


if __name__ == "__main__":
    unittest.main()
