"""사내 알까기 대전 엔진(versus_alkkagi) — 환경 · 손 떨림 · 알 수 핸디캡 · 예전 판 그대로 (DB 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_versus_alkkagi.py -v
"""

from __future__ import annotations

import copy
import math
import os
import random
import unittest
from types import SimpleNamespace

os.environ.setdefault("DEBUG", "false")

from fastapi import HTTPException as AppError  # noqa: E402 — raise_app_error 는 HTTPException 을 던진다
from app.services import versus_alkkagi as ak  # noqa: E402

A, B = 11, 22
UP = -math.pi / 2


def match(bot=None, players=(A, B), seed=1):
    m = SimpleNamespace(bot=bot, state=None, status="ACTIVE")
    m.state = ak.start(m, players, random.Random(seed))
    return m


def lone(x, y, n=14):
    """알 하나만 판 위에 둔 목록(번호 0)."""
    st = [[-100.0, -100.0, 0] for _ in range(n)]
    st[0] = [float(x), float(y), 1]
    return st


class EnvTest(unittest.TestCase):
    def test_env_one_or_two_and_symmetric(self):
        seen = set()
        for seed in range(300):
            env = ak.make_env(random.Random(seed))
            self.assertIn(len(env), (1, 2))
            kinds = [e["k"] for e in env]
            self.assertEqual(len(kinds), len(set(kinds)))
            for e in env:
                self.assertIn(e["k"], ak.ENV_KINDS)
                seen.add(e["k"])
                if "y" in e:
                    self.assertEqual(e["y"], 500)  # 흑 · 백 어느 쪽도 유리하지 않게 가운데 줄
                if e["k"] == "wind":
                    self.assertIn(e["dir"], (-1, 1))
                    self.assertIn(e["lv"], (1, 2, 3))
        self.assertEqual(seen, set(ak.ENV_KINDS))

    def test_same_seed_same_board(self):
        m1, m2 = match(seed=7), match(seed=7)
        self.assertEqual(m1.state["env"], m2.state["env"])
        self.assertEqual(m1.state["seed"], m2.state["seed"])
        self.assertEqual(m1.state["rule"], ak.RULE)

    def test_wind_bends_sideways(self):
        for d in (-1, 1):
            env = [{"k": "wind", "dir": d, "lv": 3}]
            calm = ak.simulate(lone(500, 900), 0, UP, 0.6, record=False)
            windy = ak.simulate(lone(500, 900), 0, UP, 0.6, record=False, env=env)
            self.assertAlmostEqual(calm["stones"][0][0], 500, places=3)
            self.assertGreater((windy["stones"][0][0] - 500) * d, 20)

    def test_wind_does_not_speed_up(self):
        env = [{"k": "wind", "dir": 1, "lv": 3}]
        calm = ak.simulate(lone(500, 900), 0, UP, 0.5, record=True)
        windy = ak.simulate(lone(500, 900), 0, UP, 0.5, record=True, env=env)
        self.assertEqual(len(calm["frames"]), len(windy["frames"]))  # 직각으로만 휘니 멈추는 시간은 같다

    def test_carpet_stops_sooner_than_wax(self):
        def travel(kind):
            env = [{"k": kind, "x": 500, "y": 600, "r": 200}]
            r = ak.simulate(lone(500, 900), 0, UP, 0.55, record=False, env=env)
            return 900 - r["stones"][0][1]
        plain = 900 - ak.simulate(lone(500, 900), 0, UP, 0.55, record=False)["stones"][0][1]
        self.assertLess(travel("carpet"), plain)
        self.assertGreater(travel("wax"), plain)

    def test_mug_blocks(self):
        env = [{"k": "mug", "x": 500, "y": 500, "r": 52}]
        r = ak.simulate(lone(500, 900), 0, UP, 1.0, record=True, env=env)
        self.assertTrue(r["hits"])
        for fr in r["frames"]:  # 컵을 뚫고 위로 못 간다 — 맞고 아래로 튕겨 나온다(세면 아래쪽으로 떨어질 수도)
            self.assertGreater(fr[1], 500)
            self.assertGreaterEqual(math.hypot(fr[0] - 500, fr[1] - 500), 52 + ak.RADIUS - 2)

    def test_record_and_plain_agree_with_env(self):
        m = match(seed=3)
        st = m.state
        st["env"] = [{"k": "wind", "dir": 1, "lv": 2}, {"k": "mug", "x": 480, "y": 500, "r": 52}]
        for stone, ang, pw in ((0, -1.2, 1.0), (3, UP, 0.9), (6, -2.0, 0.7)):
            a = ak.simulate(st["stones"], stone, ang, pw, record=True, env=st["env"])
            b = ak.simulate(st["stones"], stone, ang, pw, record=False, env=st["env"])
            on_a = [s for s in a["stones"] if s[2]]
            on_b = [s for s in b["stones"] if s[2]]
            self.assertEqual(on_a, on_b)


class WobbleTest(unittest.TestCase):
    def test_no_wobble_under_threshold(self):
        st = match().state
        self.assertEqual(ak.wobble_sd(ak.WOBBLE_FROM), 0.0)
        self.assertEqual(ak.shake(st, 0.8), 0.0)
        self.assertAlmostEqual(ak.wobble_sd(1.0), ak.WOBBLE_MAX)

    def test_wobble_deterministic_and_bounded(self):
        st = match(seed=5).state
        vals = []
        for k in range(200):
            st["shots"] = k
            w = ak.shake(st, 1.0)
            self.assertEqual(w, ak.shake(copy.deepcopy(st), 1.0))
            self.assertLessEqual(abs(w), 2.5 * ak.WOBBLE_MAX + 1e-12)
            vals.append(w)
        self.assertGreater(len(set(vals)), 150)

    def test_logged_wobble(self):
        m = match(seed=9)
        st = m.state
        first = st["p"][0]
        ak.act(m, first, {"stone": 3, "angle": UP, "power": 1.0}, None)
        log = st["log"][-1]
        self.assertEqual(log["angle"], round(UP, 5))
        self.assertIn("wobble", log)


class OldBoardTest(unittest.TestCase):
    def test_old_state_plays_as_before(self):
        st = ak.new_state((A, B), 4)
        for k in ("rule", "sides", "env"):
            st.pop(k)  # 예전에 시작한 판 — 이 키들이 없다
        m = SimpleNamespace(bot=None, state=st, status="ACTIVE")
        want = ak.simulate(st["stones"], 2, -1.3, 1.0, record=True)
        ak.act(m, A, {"stone": 2, "angle": -1.3, "power": 1.0}, None)
        self.assertEqual(st["stones"], want["stones"])
        self.assertEqual(st["log"][-1]["wobble"], 0.0)
        v = ak.view(m, A, True)
        self.assertEqual(v["perSide"], 7)
        self.assertEqual(v["sides"], [7, 7])
        self.assertEqual(v["env"], [])
        self.assertIsNone(v["wobble"])


class HandicapTest(unittest.TestCase):
    def test_hard_bot_gets_extra_stone(self):
        for players, bot_seat in (((A, ak.BOT_ID), 1), ((ak.BOT_ID, A), 0)):
            m = match("hard", players)
            st = m.state
            self.assertEqual(st["sides"][bot_seat], ak.PER_SIDE + 1)
            self.assertEqual(st["sides"][1 - bot_seat], ak.PER_SIDE)
            self.assertEqual(len(st["stones"]), 2 * ak.PER_SIDE + 1)
            self.assertEqual(ak.left(st, bot_seat), 8)
            self.assertEqual(ak.left(st, 1 - bot_seat), 7)
            v = ak.view(m, A, True)
            self.assertEqual(v["perSide"], st["sides"][0])
            self.assertEqual(sum(1 for s in v["stones"] if s[1] == bot_seat), 8)

    def test_other_levels_and_pvp_even(self):
        for bot in (None, "easy", "normal"):
            players = (A, B) if bot is None else (A, ak.BOT_ID)
            self.assertEqual(match(bot, players).state["sides"], [7, 7])

    def test_human_cannot_shoot_bot_stone(self):
        m = match("hard", (A, ak.BOT_ID))
        with self.assertRaises(AppError):
            ak.act(m, A, {"stone": 7, "angle": UP, "power": 0.5}, None)  # 7번은 컴퓨터(백) 알
        ak.act(m, A, {"stone": 6, "angle": UP, "power": 0.5}, None)

    def test_bot_plays_own_stone_with_env(self):
        for level in ak.BOT_LEVELS:
            m = match(level, (A, ak.BOT_ID), seed=11)
            st = m.state
            st["env"] = [{"k": "wind", "dir": -1, "lv": 2}, {"k": "carpet", "x": 500, "y": 500, "r": 180}]
            ak.act(m, A, {"stone": 3, "angle": UP, "power": 0.9}, None)
            stone, _, pw = ak.choose(st, 1, level, random.Random(1))
            self.assertEqual(ak.owner(stone, ak.split_of(st)), 1)
            self.assertTrue(st["stones"][stone][2])
            self.assertTrue(0.15 <= pw <= 1.0)
            ak.bot_act(m, level, None)
            self.assertEqual(st["turn"], 0)


if __name__ == "__main__":
    unittest.main()
