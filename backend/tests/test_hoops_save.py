"""옥상 덩크슛 공 상점 저장(매니지먼트 저장 'hoops') — 값 검사 · 목록에 안 보임 (DB 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_hoops_save.py -v
"""

from __future__ import annotations

import os
import unittest

os.environ.setdefault("DEBUG", "false")

from app.services import mgmt  # noqa: E402

OK = {"stars": 120, "owned": [0, 1, 6], "skin": 6, "best": 340, "bestCombo": 10, "bestBounceCombo": 2,
      "bestMade": 30, "bestRunScore": 340, "bestStage": 4, "totalStars": 150}


class HoopsSaveTest(unittest.TestCase):
    def test_registered_hidden(self):
        g = mgmt.MGMT_GAMES["hoops"]
        self.assertFalse(g.listed)  # 매니지먼트 목록에 안 보인다
        self.assertIs(mgmt.STATE_CHECKS["hoops"], mgmt.check_hoops_state)

    def test_good_states(self):
        self.assertTrue(mgmt.check_hoops_state(OK))
        self.assertTrue(mgmt.check_hoops_state({"stars": 0, "owned": [0], "skin": 0}))
        self.assertTrue(mgmt.check_hoops_state({}))  # 처음 — 기본값(별 0 · 기본 공)

    def test_stars_limits(self):
        for bad in (-1, mgmt.HOOPS_MAX_STARS + 1, 1.5, "10", True, None):
            self.assertFalse(mgmt.check_hoops_state({**OK, "stars": bad}), bad)
        self.assertTrue(mgmt.check_hoops_state({**OK, "stars": mgmt.HOOPS_MAX_STARS}))

    def test_owned_and_skin(self):
        self.assertFalse(mgmt.check_hoops_state({**OK, "owned": []}))
        self.assertFalse(mgmt.check_hoops_state({**OK, "owned": [0, 0]}))  # 같은 공 두 번
        self.assertFalse(mgmt.check_hoops_state({**OK, "owned": [0, 64]}))  # 없는 번호
        self.assertFalse(mgmt.check_hoops_state({**OK, "owned": list(range(65))}))  # 너무 많음
        self.assertFalse(mgmt.check_hoops_state({**OK, "owned": "0,1"}))
        self.assertFalse(mgmt.check_hoops_state({**OK, "skin": 5}))  # 안 가진 공을 고름
        self.assertTrue(mgmt.check_hoops_state({**OK, "owned": list(range(64)), "skin": 63}))

    def test_stats_and_unknown_keys(self):
        self.assertFalse(mgmt.check_hoops_state({**OK, "bestCombo": -3}))
        self.assertFalse(mgmt.check_hoops_state({**OK, "totalStars": mgmt.HOOPS_MAX_STAT + 1}))
        self.assertFalse(mgmt.check_hoops_state({**OK, "coins": 5}))  # 모르는 칸
        self.assertFalse(mgmt.check_hoops_state([1, 2]))

    def test_other_games_unchecked(self):
        self.assertNotIn("civ", mgmt.STATE_CHECKS)


if __name__ == "__main__":
    unittest.main()
