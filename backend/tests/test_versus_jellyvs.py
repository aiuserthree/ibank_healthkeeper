"""꿀꺽 젤리 숲 대전 엔진(versus_jellyvs) — 결과 검증 · 숲(맵) 번호 시험 (DB 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_versus_jellyvs.py -v
"""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

os.environ.setdefault("DEBUG", "false")

from fastapi import HTTPException as AppError  # noqa: E402 — raise_app_error 는 HTTPException 을 던진다
from app.services import versus_jellyvs as vj  # noqa: E402

HOST, GUEST = 11, 22


def new_match():
    m = SimpleNamespace(challenger_id=HOST, opponent_id=GUEST, state=None, status="ACTIVE", end_reason=None)
    m.state = vj.start(m, (HOST, GUEST), None)
    return m


def later(m, sec=200):
    """수락 뒤 sec 초가 지난 시각."""
    return datetime.fromtimestamp(m.state["at"] / 1000 + sec, tz=timezone.utc)


def eaten_result(**kw):
    d = {"winner": "host", "size": [300, 200], "eaten": True, "sec": 40.5}
    d.update(kw)
    return d


class CheckTest(unittest.TestCase):
    def test_map_optional_defaults_to_1(self):
        self.assertEqual(vj._check(eaten_result())["map"], 1)
        self.assertEqual(vj._check(eaten_result(map=None))["map"], 1)

    def test_map_in_range(self):
        for mp in range(1, vj.MAP_COUNT + 1):
            self.assertEqual(vj._check(eaten_result(map=mp))["map"], mp)

    def test_map_bad(self):
        for bad in (0, vj.MAP_COUNT + 1, -1, "2", 2.0, True):
            with self.assertRaises(AppError, msg=repr(bad)):
                vj._check(eaten_result(map=bad))

    def test_rules_unchanged(self):
        with self.assertRaises(AppError):  # 1.2배가 안 되는데 삼켰다
            vj._check(eaten_result(size=[220, 200]))
        with self.assertRaises(AppError):  # 2분을 안 채운 크기 판정
            vj._check({"winner": "host", "size": [300, 200], "eaten": False, "sec": 60, "map": 3})
        ok = vj._check({"winner": "draw", "size": [201, 200], "eaten": False, "sec": 120, "map": 4})
        self.assertEqual(ok["winner"], "draw")


class FlowTest(unittest.TestCase):
    def test_both_report_same_with_map(self):
        m = new_match()
        now = later(m)
        self.assertIsNone(vj.act(m, HOST, eaten_result(map=5), now))
        res = vj.act(m, GUEST, eaten_result(map=5), now + timedelta(seconds=1))
        self.assertEqual(res, (HOST, "EATEN"))
        self.assertEqual(m.state["final"]["map"], 5)
        m.status, m.end_reason = "DONE", res[1]
        self.assertEqual(vj.view(m, GUEST, True)["map"], 5)
        self.assertTrue(vj.counts(m))

    def test_old_screen_without_map(self):
        m = new_match()
        now = later(m)
        vj.act(m, HOST, eaten_result(), now)
        res = vj.act(m, GUEST, eaten_result(), now)
        self.assertEqual(res, (HOST, "EATEN"))
        self.assertEqual(m.state["final"]["map"], 1)

    def test_map_differs_but_result_same_takes_host(self):
        m = new_match()
        now = later(m)
        vj.act(m, HOST, eaten_result(map=2), now)
        res = vj.act(m, GUEST, eaten_result(map=3), now)
        self.assertEqual(res, (HOST, "EATEN"))
        self.assertEqual(m.state["final"]["map"], 2)

    def test_mismatch_still_draw(self):
        m = new_match()
        now = later(m)
        vj.act(m, HOST, eaten_result(map=2), now)
        res = vj.act(m, GUEST, eaten_result(map=2, size=[310, 200]), now)
        self.assertEqual(res, (None, "MISMATCH"))

    def test_too_early(self):
        m = new_match()
        with self.assertRaises(AppError):
            vj.act(m, HOST, eaten_result(map=2), later(m, 5))


if __name__ == "__main__":
    unittest.main()
