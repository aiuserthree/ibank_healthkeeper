"""그룹웨어 휴가 서버 직접 읽기(services/gw_leave.py) — 쉬는 시간대 계산이 맥용 scripts/gw-leave-sync.py 와 같은지, 설정이 비면 꺼지는지."""
from __future__ import annotations

import asyncio
import importlib.util
import os
import pathlib
import unittest
from datetime import date

os.environ.setdefault("DEBUG", "false")

from app.services import gw_leave as g  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("gwscript", ROOT / "scripts" / "gw-leave-sync.py")
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)


class GwLeave(unittest.TestCase):
    def test_same_as_script(self):
        rows = [
            {"doc": 1, "form": 1, "str_dt": date(2026, 11, 15), "end_dt": date(2026, 11, 18), "rmk_seg2": None, "cont": "", "email": "a@3ibank.com"},
            {"doc": 2, "form": 11, "str_dt": date(2026, 11, 16), "end_dt": None, "rmk_seg2": "001", "cont": "", "email": "b@ibank.co.kr"},
            {"doc": 3, "form": 11, "str_dt": date(2026, 11, 17), "end_dt": None, "rmk_seg2": "002", "cont": "", "email": "c@ibank.co.kr"},
            {"doc": 4, "form": 13, "str_dt": date(2026, 11, 16), "end_dt": None, "rmk_seg2": None, "cont": "<p>03:00~05:00</p>", "email": "d@3ibank.com"},
            {"doc": 5, "form": 13, "str_dt": date(2026, 11, 16), "end_dt": None, "rmk_seg2": None, "cont": "", "email": "e@3ibank.com"},
            {"doc": 6, "form": 14, "str_dt": date(2026, 11, 17), "end_dt": date(2026, 11, 17), "rmk_seg2": None, "cont": "", "email": "f@3ibank.com"},
            {"doc": 7, "form": 11, "str_dt": date(2026, 11, 16), "end_dt": None, "rmk_seg2": "9", "cont": "", "email": "g@3ibank.com"},  # 모르는 반차 — 빠짐
        ]
        since, until = date(2026, 11, 16), date(2026, 11, 17)
        mine, theirs = g.build_items(rows, since, until), S.build_items(rows, since, until)
        self.assertEqual(mine, theirs)
        self.assertEqual(len(mine), 7)
        q = [it for it in mine if it["email"] == "d@3ibank.com"][0]
        self.assertEqual((q["start"], q["end"]), ("14:30", "17:30"))  # 12시간제 → 오후 · 앞뒤 30분

    def test_off_without_settings(self):
        from app.config import get_settings

        self.assertFalse(get_settings().gw_ready())  # 테스트 환경에는 GW_DB_* 가 없다 → 서버 직접 읽기 꺼짐
        loop = asyncio.new_event_loop()
        try:
            self.assertIsNone(loop.run_until_complete(g.sync_now(None)))
            self.assertIsNone(loop.run_until_complete(g.job_gw_leave_sync(None)))
        finally:
            loop.close()


if __name__ == "__main__":
    unittest.main()
