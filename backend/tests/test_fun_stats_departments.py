"""부서 대항전(메인 재미 요소) — 회원이 1명뿐인 부서는 개인 기록이 그대로 드러나므로 순위에서 뺀다.
가짜 부서 · 가짜 회원으로 fun_stats._departments 만 시험한다(DB 없음).
  cd /tmp && PYTHONPATH=<저장소>/backend <파이썬> -m unittest discover -s <저장소>/backend/tests -p "test_fun_stats_departments.py" -v
"""
from __future__ import annotations

import os
import unittest
from datetime import date

os.environ.setdefault("DEBUG", "false")

from app.services import fun_stats  # noqa: E402
from app.services.fun_stats import (  # noqa: E402
    DEPARTMENT_MIN_MEMBERS,
    DEPARTMENT_RANKING_EXCLUDED,
    _departments,
    _Snapshot,
    _Usage,
)

EXCLUDED = next(iter(DEPARTMENT_RANKING_EXCLUDED))
D = date(2026, 11, 2)

# 가짜 회원 → 부서. 가부서 3명 · 나부서 2명 · 혼자부서 1명 · 제외 부서 1명 · 부서 없음 1명
DEPTS = {
    "a1@x.test": "가부서",
    "a2@x.test": "가부서",
    "a3@x.test": "가부서",
    "b1@x.test": "나부서",
    "b2@x.test": "나부서",
    "solo@x.test": "혼자부서",
    "boss@x.test": EXCLUDED,
    "none@x.test": "",
}


def uses(key: str, n: int) -> list[_Usage]:
    return [_Usage(key=key, usage_date=D, start=f"{10 + i % 8:02d}:30") for i in range(n)]


USAGES = uses("a1@x.test", 3) + uses("a2@x.test", 1) + uses("b1@x.test", 2) + uses("b2@x.test", 2) + uses(
    "solo@x.test", 9
) + uses("boss@x.test", 20) + uses("none@x.test", 4)


def board(me: str) -> dict:
    snap = _Snapshot(computed_at=0.0, today=D, usages=USAGES, departments_by_key=dict(DEPTS))
    return _departments(snap, USAGES, me)


class DepartmentMinMembersTest(unittest.TestCase):
    def test_min_members_is_two(self):
        self.assertEqual(DEPARTMENT_MIN_MEMBERS, 2)

    def test_solo_department_left_out_of_ranking(self):
        # ① 1명 부서는 이용이 가장 많아도 순위 · 1인당 순위 · 전체 부서 수에 없다
        b = board("a1@x.test")
        names = [r["name"] for r in b["top"]]
        self.assertNotIn("혼자부서", names)
        self.assertNotIn("혼자부서", [r["name"] for r in b["perCapita"]])
        self.assertEqual(b["total"], 2)
        self.assertNotIn("혼자부서", repr(b))

    def test_two_or_more_members_stay(self):
        # ② 2명 이상 부서는 그대로 — 가부서 4회 · 나부서 4회 동률 같은 순위
        b = board("b1@x.test")
        self.assertEqual(
            [(r["rank"], r["name"], r["uses"]) for r in b["top"]],
            [(1, "가부서", 4), (1, "나부서", 4)],
        )
        self.assertEqual(b["mine"], {"rank": 1, "name": "나부서", "uses": 4, "isMine": True})
        self.assertEqual(b["myDepartment"], "나부서")
        self.assertFalse(b["soloDepartment"])
        per = {r["name"]: (r["perCapita"], r["members"]) for r in b["perCapita"]}
        self.assertEqual(per, {"나부서": (2.0, 2), "가부서": (1.3, 3)})

    def test_my_solo_department(self):
        # ③ 내 부서가 1명이면 soloDepartment 참 · 내 부서 이름 · 내 순위 · 내 기록이 응답에 없다
        b = board("solo@x.test")
        self.assertTrue(b["soloDepartment"])
        self.assertIsNone(b["mine"])
        self.assertIsNone(b["myDepartment"])
        self.assertFalse(any(r["isMine"] for r in b["top"] + b["perCapita"]))
        self.assertNotIn("혼자부서", repr(b))
        self.assertNotIn(9, [r["uses"] for r in b["top"]])

    def test_solo_department_with_second_member_joins(self):
        # 같은 부서에 두 번째 회원이 생기면 다시 대항전에 나온다
        depts = dict(DEPTS, **{"solo2@x.test": "혼자부서"})
        snap = _Snapshot(computed_at=0.0, today=D, usages=USAGES, departments_by_key=depts)
        b = _departments(snap, USAGES, "solo@x.test")
        self.assertFalse(b["soloDepartment"])
        self.assertEqual(b["mine"]["name"], "혼자부서")
        self.assertEqual(b["mine"]["rank"], 1)
        self.assertEqual(b["total"], 3)

    def test_excluded_department_unchanged(self):
        # ④ 원래부터 빼던 부서는 1명이어도 soloDepartment 가 아니고(그냥 제외) 순위에 없다
        b = board("boss@x.test")
        self.assertFalse(b["soloDepartment"])
        self.assertIsNone(b["myDepartment"])
        self.assertIsNone(b["mine"])
        self.assertNotIn(EXCLUDED, [r["name"] for r in b["top"]])
        # 제외 부서에 회원이 여럿이어도 계속 빠진다
        depts = dict(DEPTS, **{"boss2@x.test": EXCLUDED, "boss3@x.test": EXCLUDED})
        snap = _Snapshot(computed_at=0.0, today=D, usages=USAGES, departments_by_key=depts)
        b = _departments(snap, USAGES, "boss@x.test")
        self.assertNotIn(EXCLUDED, [r["name"] for r in b["top"]])
        self.assertFalse(b["soloDepartment"])
        self.assertIsNone(b["mine"])

    def test_no_department(self):
        # 부서 없는 회원은 soloDepartment 가 아니다(화면에서 「부서 정보가 없어」 안내)
        b = board("none@x.test")
        self.assertFalse(b["soloDepartment"])
        self.assertIsNone(b["myDepartment"])

    def test_raid_uses_same_rule(self):
        # 부서 대항 레이드도 같은 기준값을 쓴다
        from app.services import raid

        self.assertIs(raid.DEPARTMENT_MIN_MEMBERS, fun_stats.DEPARTMENT_MIN_MEMBERS)
        sizes = raid.eligible_departments({1: "가부서", 2: "가부서", 3: "혼자부서", 4: EXCLUDED, 5: EXCLUDED, 6: ""})
        self.assertEqual(sizes, {"가부서": 2})


if __name__ == "__main__":
    unittest.main()
