"""칸 따먹기 대전 엔진(versus_boxes) — 선 긋기 규칙 · 컴퓨터 쉬움 난이도 시험 (DB 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_versus_boxes.py -v
"""

from __future__ import annotations

import os
import random
import unittest
from types import SimpleNamespace

os.environ.setdefault("DEBUG", "false")

from fastapi import HTTPException as AppError  # noqa: E402 — raise_app_error 는 HTTPException 을 던진다
from app.services import versus_boxes as vb  # noqa: E402

A, B = 11, 22
NOW = None


def new_match(players=(A, B)):
    m = SimpleNamespace(challenger_id=A, opponent_id=B, state=None, status="ACTIVE", end_reason=None)
    m.state = vb.start(m, players, random.Random(1))
    return m


def draw_lines(st, lines):
    """차례와 상관없이 선만 그어 둔 판(시험용)."""
    for ln in lines:
        st["lines"][ln] = 0


class RuleTest(unittest.TestCase):
    def test_close_box_keeps_turn(self):
        m = new_match()
        n = m.state["n"]
        h = (n + 1) * n
        # 칸 0 의 위 · 아래 · 왼 변을 그어 두고, A 가 오른 변을 그으면 칸을 갖고 한 번 더
        vb.act(m, A, {"line": 0}, NOW)          # A 위
        vb.act(m, B, {"line": n}, NOW)          # B 아래
        vb.act(m, A, {"line": h}, NOW)          # A 왼
        self.assertEqual(m.state["turn"], 1)
        vb.act(m, B, {"line": h + 1}, NOW)      # B 오른 — 닫음
        self.assertEqual(m.state["boxes"][0], 1)
        self.assertEqual(m.state["turn"], 1)    # 한 번 더

    def test_taken_line_rejected(self):
        m = new_match()
        vb.act(m, A, {"line": 3}, NOW)
        with self.assertRaises(AppError):
            vb.act(m, B, {"line": 3}, NOW)
        with self.assertRaises(AppError):
            vb.act(m, B, {"line": True}, NOW)

    def test_majority_ends(self):
        st = vb.new_state((A, B))
        st["boxes"] = [0] * 12 + [-1] * 13
        # 칸 12 를 닫는 마지막 변만 남긴다
        _, box_lines, _ = vb._geo(st["n"])
        draw_lines(st, box_lines[12][:3])
        self.assertEqual(vb._draw(st, 0, box_lines[12][3]), (A, "MAJORITY"))


class EasyBotTest(unittest.TestCase):
    """쉬움 — 평범한 사람에게 거의 늘 지던 것을 조금 버티게: 닫을 칸은 대개(85%) 먹고, 안전한 선이 있으면 대개(92%) 고른다."""

    def test_easy_usually_takes_box(self):
        st = vb.new_state((vb.BOT_ID, A))
        _, box_lines, _ = vb._geo(st["n"])
        draw_lines(st, box_lines[0][:3])
        cap = box_lines[0][3]
        rnd = random.Random(7)
        took = sum(vb.choose(st, 0, "easy", rnd) == cap for _ in range(2000))
        self.assertGreater(took, 2000 * 0.8)
        self.assertLess(took, 2000 * 0.95)  # 그래도 가끔은 놓친다

    def test_easy_usually_plays_safe(self):
        st = vb.new_state((vb.BOT_ID, A))
        _, box_lines, _ = vb._geo(st["n"])
        draw_lines(st, box_lines[6][:2])  # 칸 6 에 두 변 — 세 번째 변을 그으면 내준다
        bd = vb._Board(st["n"])
        d = sum(1 << i for i, s in enumerate(st["lines"]) if s >= 0)
        safe = set(bd.safe(d))
        rnd = random.Random(3)
        ok = sum(vb.choose(st, 0, "easy", rnd) in safe for _ in range(2000))
        self.assertGreater(ok, 2000 * 0.88)

    def test_levels_still_finish_games(self):
        # 어느 난이도든 판을 끝까지 둔다(과반 또는 반반)
        for level in vb.BOT_LEVELS:
            st = vb.new_state((vb.BOT_ID, 1))
            rnd = random.Random(5)
            for _ in range(200):
                seat = st["turn"]
                lv = level if seat == 0 else "normal"
                out = vb._draw(st, seat, vb.choose(st, seat, lv, rnd))
                if out:
                    break
            self.assertIsNotNone(out, level)
            self.assertIn(out[1], ("MAJORITY", "DRAW"))


if __name__ == "__main__":
    unittest.main()
