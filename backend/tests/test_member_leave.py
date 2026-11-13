"""휴가로 열리는 아케이드 — 시간대 계산 · 열림 판단 · 받는 입구 시험 (실제 DB · Redis 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend <저장소>/backend/.venv/bin/python -m unittest discover -s <저장소>/backend/tests -v
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

os.environ.setdefault("DEBUG", "false")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.dialects import postgresql  # noqa: E402

from app.core.time import KST  # noqa: E402
from app.services import game  # noqa: E402
from app.services import leave as leave_service  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("gw_leave_sync", ROOT / "scripts" / "gw-leave-sync.py")
gw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gw)

MON = date(2026, 11, 16)  # 평일
SAT = date(2026, 11, 14)  # 주말
NOT_DEBUG = SimpleNamespace(debug=False)


def at(d: date, hh: int, mm: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=KST)


# ── 1. 보내는 프로그램 — 시간대 계산 ─────────────────────────────

class SenderWindowTest(unittest.TestCase):
    def test_half_day(self):
        self.assertEqual(gw.half_window("001"), (0, 14 * 60))
        self.assertEqual(gw.half_window("002"), (13 * 60, 24 * 60))
        self.assertIsNone(gw.half_window(None))
        self.assertIsNone(gw.half_window("009"))

    def test_quarter_body_time(self):
        self.assertEqual(gw.quarter_window("<p>반반차 16:00~18:00 사용</p>"), (15 * 60 + 30, 18 * 60 + 30))
        self.assertEqual(gw.quarter_window("<div>시간: 10:00 - 12:00</div>"), (9 * 60 + 30, 12 * 60 + 30))
        self.assertEqual(gw.quarter_window("<span>14시~16시</span>"), (13 * 60 + 30, 16 * 60 + 30))

    def test_quarter_12_hour_clock(self):
        # 03:00~05:00 → 오후 15:00~17:00 → 여유 붙여 14:30~17:30
        self.assertEqual(gw.quarter_window("<p>03:00~05:00</p>"), (14 * 60 + 30, 17 * 60 + 30))
        self.assertEqual(gw.quarter_window("11:00~1:00"), (10 * 60 + 30, 13 * 60 + 30))

    def test_quarter_no_time(self):
        self.assertEqual(gw.quarter_window(None), (16 * 60, 18 * 60))
        self.assertEqual(gw.quarter_window("<p>개인 사유</p>"), (16 * 60, 18 * 60))
        self.assertEqual(gw.quarter_window("2026-11-13 ~ 2026-11-13"), (16 * 60, 18 * 60))  # 날짜는 시각이 아니다
        self.assertEqual(gw.quarter_window("09:00~18:00"), (16 * 60, 18 * 60))  # 4시간 넘으면 잘못 읽은 것

    def test_multi_day_vacation_clipped(self):
        row = {"doc": 77, "form": 1, "str_dt": datetime(2026, 11, 12), "end_dt": datetime(2026, 11, 20), "email": "A@X.co.kr"}
        items = gw.doc_items(row, date(2026, 11, 13), date(2026, 11, 14))
        self.assertEqual([i["day"] for i in items], ["2026-11-13", "2026-11-14"])
        self.assertTrue(all(i["start"] == "00:00" and i["end"] == "24:00" and i["kind"] == "VACATION" for i in items))
        self.assertEqual(items[0]["email"], "a@x.co.kr")
        self.assertEqual(items[0]["doc"], "77")

    def test_special_and_half_and_quarter(self):
        since, until = date(2026, 11, 13), date(2026, 11, 14)
        sp = gw.doc_items({"doc": 1, "form": 14, "str_dt": datetime(2026, 11, 13), "end_dt": None, "email": "s@x"}, since, until)
        self.assertEqual([(i["day"], i["kind"]) for i in sp], [("2026-11-13", "SPECIAL")])
        half = gw.doc_items({"doc": 2, "form": 11, "str_dt": datetime(2026, 11, 14), "rmk_seg2": "002", "email": "h@x"}, since, until)
        self.assertEqual([(i["start"], i["end"]) for i in half], [("13:00", "24:00")])
        self.assertEqual(gw.doc_items({"doc": 3, "form": 11, "str_dt": datetime(2026, 11, 14), "rmk_seg2": None, "email": "h@x"}, since, until), [])
        q = gw.doc_items({"doc": 4, "form": 13, "str_dt": datetime(2026, 11, 13), "cont": None, "email": "q@x"}, since, until)
        self.assertEqual([(i["start"], i["end"], i["kind"]) for i in q], [("16:00", "18:00", "QUARTER")])
        self.assertEqual(gw.doc_items({"doc": 5, "form": 1, "str_dt": datetime(2026, 11, 10), "end_dt": datetime(2026, 11, 12), "email": "o@x"}, since, until), [])

    def test_build_items_and_summary_has_no_personal_data(self):
        since, until = date(2026, 11, 13), date(2026, 11, 14)
        rows = [
            {"doc": 1, "form": 1, "str_dt": datetime(2026, 11, 13), "end_dt": datetime(2026, 11, 14), "email": "kim@x.co.kr"},
            {"doc": 1, "form": 1, "str_dt": datetime(2026, 11, 13), "end_dt": datetime(2026, 11, 14), "email": "kim@x.co.kr"},
            {"doc": 2, "form": 11, "str_dt": datetime(2026, 11, 13), "rmk_seg2": "001", "email": "lee@x.co.kr"},
        ]
        items = gw.build_items(rows, since, until)
        self.assertEqual(len(items), 3)
        text = gw.summary(items, since, until)
        self.assertIn("오늘(2026-11-13) 2명", text)
        self.assertIn("내일(2026-11-14) 1명", text)
        self.assertIn("휴가 2건", text)
        self.assertIn("반차 1건", text)
        self.assertNotIn("@", text)

    def test_read_env_only_wanted_keys(self):
        with tempfile.NamedTemporaryFile("w", suffix=".env", delete=False, encoding="utf-8") as f:
            f.write("# 주석\nexport GW_DB_HOST='db.local'\nGW_DB_PORT=5433\nOTHER_SECRET=nope\nGW_DB_PASSWORD=\"p w\"\n")
        try:
            env = gw.read_env(f.name, gw.GW_KEYS)
        finally:
            os.unlink(f.name)
        self.assertEqual(env, {"GW_DB_HOST": "db.local", "GW_DB_PORT": "5433", "GW_DB_PASSWORD": "p w"})

    def test_failure_is_one_line_exit_1(self):
        with mock.patch("sys.stderr") as err:
            self.assertEqual(gw.main(["--gw-env", "/없는/파일", "--dry-run"]), 1)
        self.assertIn("실패", "".join(c.args[0] for c in err.write.call_args_list))


# ── 2. 열림 판단 ─────────────────────────────────────────────

class WindowTest(unittest.TestCase):
    def setUp(self):
        self.p = mock.patch.object(game, "get_settings", return_value=NOT_DEBUG)
        self.p.start()
        leave_service.set_cache({})

    def tearDown(self):
        self.p.stop()
        leave_service.set_cache({})

    def test_no_leave_is_same_as_before(self):
        self.assertEqual(game.play_window(at(MON, 10)), {"open": False, "opensAt": "11:30"})
        self.assertEqual(game.play_window(at(MON, 12))["open"], True)
        self.assertEqual(game.play_window(at(MON, 14), member=7), {"open": False, "opensAt": "18:00"})
        self.assertTrue(game.play_window(at(MON, 8, 59), member=7)["open"])
        self.assertTrue(game.play_window(at(MON, 18), member=7)["open"])

    def test_full_day_leave(self):
        leave_service.set_cache({MON: {7: ((0, 1440, "VACATION"),)}})
        w = game.play_window(at(MON, 10), member=7)
        self.assertTrue(w["open"])
        self.assertEqual(w["reason"], "leave")
        self.assertEqual(w["leave"], {"kind": "VACATION", "label": "휴가", "until": "24:00"})
        # 다른 사람 · 회원을 안 넘긴 호출은 그대로 닫힘
        self.assertFalse(game.play_window(at(MON, 10), member=8)["open"])
        self.assertFalse(game.play_window(at(MON, 10))["open"])
        # Member 객체도 된다
        self.assertTrue(game.play_window(at(MON, 15), member=SimpleNamespace(id=7))["open"])

    def test_morning_half(self):
        leave_service.set_cache({MON: {7: ((0, 840, "HALF"),)}})
        w = game.play_window(at(MON, 9, 30), member=7)
        self.assertEqual(w["leave"], {"kind": "HALF", "label": "오전 반차", "until": "14:00"})
        self.assertTrue(game.play_window(at(MON, 13, 59), member=7)["open"])
        self.assertEqual(game.play_window(at(MON, 14), member=7), {"open": False, "opensAt": "18:00"})

    def test_afternoon_half(self):
        leave_service.set_cache({MON: {7: ((780, 1440, "HALF"),)}})
        self.assertEqual(game.play_window(at(MON, 10), member=7), {"open": False, "opensAt": "11:30"})
        w = game.play_window(at(MON, 13, 5), member=7)
        self.assertEqual(w["leave"]["label"], "오후 반차")
        self.assertEqual(w["leave"]["until"], "24:00")

    def test_quarter_opens_at_leave_start(self):
        leave_service.set_cache({MON: {7: ((930, 1110, "QUARTER"),)}})  # 15:30~18:30
        self.assertEqual(game.play_window(at(MON, 14), member=7), {"open": False, "opensAt": "15:30"})
        w = game.play_window(at(MON, 16), member=7)
        self.assertEqual(w["leave"], {"kind": "QUARTER", "label": "반반차", "until": "24:00"})  # 18:00 뒤는 원래 열림
        leave_service.set_cache({MON: {7: ((570, 720, "QUARTER"),)}})  # 09:30~12:00
        self.assertEqual(game.play_window(at(MON, 9, 40), member=7)["leave"]["until"], "13:00")  # 점심 뒤 13:00 에 닫힘

    def test_weekend_and_other_day(self):
        leave_service.set_cache({SAT: {7: ((0, 1440, "VACATION"),)}})
        self.assertEqual(game.play_window(at(SAT, 10), member=7), {"open": True, "opensAt": None})  # 주말은 원래 열림
        self.assertFalse(game.play_window(at(MON, 10), member=7)["open"])  # 다른 날 휴가는 안 본다

    def test_ensure_open_and_grace(self):
        leave_service.set_cache({MON: {7: ((0, 840, "HALF"),)}})
        with mock.patch.object(game, "now_kst", return_value=at(MON, 10)):
            game.ensure_open(member=7)
            with self.assertRaises(Exception) as ctx:
                game.ensure_open(member=8)
            self.assertEqual(ctx.exception.status_code, 403)
        with mock.patch.object(game, "now_kst", return_value=at(MON, 14, 5)):
            game.ensure_open(grace=True, member=7)  # 휴가 끝나고 10분 안 — 막 끝난 판 저장
            with self.assertRaises(Exception):
                game.ensure_open(member=7)
        with mock.patch.object(game, "now_kst", return_value=at(MON, 14, 11)):
            with self.assertRaises(Exception):
                game.ensure_open(grace=True, member=7)

    def test_minutes_to_close(self):
        leave_service.set_cache({MON: {7: ((0, 840, "HALF"),)}})
        self.assertEqual(game.minutes_to_close(at(MON, 13, 30), 7), 30)
        self.assertEqual(game.minutes_to_close(at(MON, 12, 30)), 30)
        self.assertIsNone(game.minutes_to_close(at(MON, 18, 30), 7))
        self.assertIsNone(game.minutes_to_close(at(SAT, 10), 7))

    def test_leave_opens_closed_hours(self):
        self.assertTrue(game.leave_opens_closed_hours([(930, 1110, "QUARTER")]))
        self.assertFalse(game.leave_opens_closed_hours([(690, 780, "QUARTER")]))  # 점심시간 안


class EnsureOpenCallersTest(unittest.TestCase):
    """ensure_open · play_window 를 부르는 곳은 모두 회원을 넘긴다 (휴가인 사람 기준으로 판단)."""

    def test_every_caller_passes_member(self):
        import ast

        app_dir = ROOT / "backend" / "app"
        bad, seen = [], 0
        for path in app_dir.rglob("*.py"):
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if not isinstance(node, ast.Call):
                    continue
                f = node.func
                name = f.attr if isinstance(f, ast.Attribute) else f.id if isinstance(f, ast.Name) else None
                if name not in ("ensure_open", "play_window"):
                    continue
                seen += 1
                if not any(k.arg == "member" for k in node.keywords):
                    bad.append(f"{path.relative_to(app_dir)}:{node.lineno}")
        self.assertGreater(seen, 15)
        self.assertEqual(bad, [])


# ── 3. 받는 입구 ─────────────────────────────────────────────

class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class FakeSession:
    """실행한 SQL 을 적어 두고, 회원 찾기 · 휴가 읽기에 정해 둔 줄을 돌려준다."""

    def __init__(self, members):
        self.members = members  # {email: id}
        self.executed = []
        self.inserted = []
        self.commits = 0

    async def execute(self, stmt, params=None):
        sql = str(stmt.compile(dialect=postgresql.dialect()))
        self.executed.append(sql)
        if sql.startswith("SELECT lower(member.email)"):
            wanted = set()
            for v in stmt.compile().params.values():
                if isinstance(v, (list, tuple)):
                    wanted |= set(v)
            return FakeResult([(e, i) for e, i in self.members.items() if e in wanted])
        if sql.startswith("INSERT INTO member_leave"):
            self.inserted.extend(params or [])
            return FakeResult([])
        if sql.startswith("SELECT member_leave.member_id"):
            return FakeResult([(r["member_id"], r["day"], r["start_min"], r["end_min"], r["kind"]) for r in self.inserted])
        return FakeResult([])

    async def commit(self):
        self.commits += 1


class FakeRedis:
    def __init__(self):
        self.data = {}

    async def set(self, key, value):
        self.data[key] = value

    async def get(self, key):
        return self.data.get(key)


TOKEN = "test-token-for-unit-test"


class LeaveSyncApiTest(unittest.TestCase):
    def setUp(self):
        from app.core.deps import get_redis_client
        from app.database import get_db
        from app.routers import internal

        self.internal = internal
        self.db = FakeSession({"kim@ibank.co.kr": 11, "lee@ibank.co.kr": 12})
        self.redis = FakeRedis()
        api = FastAPI()
        api.include_router(internal.router, prefix="/api")

        async def fake_db():
            yield self.db

        async def fake_redis():
            return self.redis

        api.dependency_overrides[get_db] = fake_db
        api.dependency_overrides[get_redis_client] = fake_redis
        self.client = TestClient(api)
        self.settings = mock.patch.object(internal, "get_settings", return_value=SimpleNamespace(leave_sync_token=TOKEN))
        self.settings.start()
        leave_service.set_cache({})

    def tearDown(self):
        self.settings.stop()
        leave_service.set_cache({})

    def post(self, body, token=TOKEN, raw=None):
        headers = {"Content-Type": "application/json"}
        if token is not None:
            headers["X-Leave-Sync-Token"] = token
        return self.client.post("/api/internal/leave-sync", content=raw if raw is not None else json.dumps(body), headers=headers)

    def body(self, items=None):
        today = date.today().isoformat()
        return {"from": today, "to": today, "items": items if items is not None else [
            {"email": "Kim@ibank.co.kr", "day": today, "start": "00:00", "end": "14:00", "kind": "HALF", "doc": "101"},
            {"email": "kim@ibank.co.kr", "day": today, "start": "00:00", "end": "14:00", "kind": "HALF", "doc": "101"},
            {"email": "lee@ibank.co.kr", "day": today, "start": "15:30", "end": "18:30", "kind": "QUARTER", "doc": "102"},
            {"email": "nobody@ibank.co.kr", "day": today, "start": "00:00", "end": "24:00", "kind": "VACATION", "doc": "103"},
        ]}

    def test_off_when_token_not_set(self):
        with mock.patch.object(self.internal, "get_settings", return_value=SimpleNamespace(leave_sync_token="")):
            self.assertEqual(self.post(self.body()).status_code, 503)
        self.assertEqual(self.db.executed, [])

    def test_missing_and_wrong_token(self):
        self.assertEqual(self.post(self.body(), token=None).status_code, 401)
        self.assertEqual(self.post(self.body(), token="wrong").status_code, 403)
        self.assertEqual(self.db.executed, [])

    def test_bad_body_422(self):
        today = date.today().isoformat()
        one = lambda **kw: {**{"email": "kim@ibank.co.kr", "day": today, "start": "09:00", "end": "10:00", "kind": "HALF"}, **kw}  # noqa: E731
        cases = [
            {"from": today, "to": today, "items": [one(start="9:00")]},
            {"from": today, "to": today, "items": [one(start="24:00", end="24:00")]},
            {"from": today, "to": today, "items": [one(start="10:00", end="09:00")]},
            {"from": today, "to": today, "items": [one(kind="SICK")]},
            {"from": today, "to": today, "items": [one(day="2020-01-01")]},
            {"from": "2026-11-14", "to": "2026-11-13", "items": []},
            {"from": "2026-01-01", "to": "2026-12-31", "items": []},
            {"to": today, "items": []},
        ]
        for c in cases:
            r = self.post(c)
            self.assertEqual(r.status_code, 422, c)
            self.assertNotIn("kim@", r.text)  # 받은 값을 되돌려 주지 않는다
        self.assertEqual(self.post(None, raw="{not json").status_code, 422)
        self.assertEqual(self.db.executed, [])

    def test_too_big(self):
        r = self.post(None, raw=" " * (self.internal.MAX_BODY_BYTES + 1))
        self.assertEqual(r.status_code, 413)
        many = self.body([{"email": "kim@ibank.co.kr", "day": date.today().isoformat(), "start": "00:00", "end": "24:00", "kind": "VACATION"}] * 2001)
        self.assertEqual(self.post(many).status_code, 422)

    def test_saves_and_replaces(self):
        with self.assertLogs("app.services.leave", level="INFO") as logs:
            r = self.post(self.body())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json(), {"data": {"saved": 2, "unmatched": 1, "days": 1}})
        # 메일은 로그에 없다
        self.assertFalse(any("@" in line for line in logs.output))
        # 지우고(그 날짜의 그룹웨어 줄 · 30일 지난 줄) 넣고 커밋
        deletes = [s for s in self.db.executed if s.startswith("DELETE FROM member_leave")]
        self.assertEqual(len(deletes), 2)
        self.assertIn("member_leave.source", deletes[0])
        self.assertIn("BETWEEN", deletes[0])
        self.assertEqual(self.db.commits, 1)
        self.assertEqual(sorted((r["member_id"], r["start_min"], r["end_min"], r["kind"], r["source"]) for r in self.db.inserted),
                         [(11, 0, 840, "HALF", "GW"), (12, 930, 1110, "QUARTER", "GW")])
        # 받은 직후 캐시에 들어가 바로 열린다
        self.assertEqual(leave_service.windows_for(11, date.today()), ((0, 840, "HALF"),))
        self.assertIn(leave_service.LAST_SYNC_KEY, self.redis.data)
        # 같은 걸 다시 보내도 같은 결과(통째로 바꿔 넣기)
        self.db.inserted.clear()
        r2 = self.post(self.body())
        self.assertEqual(r2.json()["data"]["saved"], 2)
        self.assertEqual(len(self.db.inserted), 2)

    def test_empty_items_clears_day(self):
        r = self.post(self.body([]))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["data"], {"saved": 0, "unmatched": 0, "days": 1})
        self.assertEqual(len([s for s in self.db.executed if s.startswith("DELETE")]), 2)
        self.assertFalse(any(s.startswith("INSERT") for s in self.db.executed))


class AdminDayTest(unittest.TestCase):
    def test_admin_day(self):
        import asyncio

        class S:
            async def execute(self, stmt):
                str(stmt.compile(dialect=postgresql.dialect()))
                L = lambda mid, s, e, k: SimpleNamespace(member_id=mid, start_min=s, end_min=e, kind=k)  # noqa: E731
                return FakeResult([(L(1, 0, 840, "HALF"), "김", "개발"), (L(2, 690, 780, "QUARTER"), "이", None), (L(3, 0, 1440, "VACATION"), "박", "영업")])

            async def scalar(self, stmt):
                return None

        r = FakeRedis()
        r.data[leave_service.LAST_SYNC_KEY] = json.dumps({"at": "2026-11-16T10:05:00+09:00", "saved": 3})
        with mock.patch.object(game, "get_settings", return_value=NOT_DEBUG):
            out = asyncio.run(leave_service.admin_day(S(), r, MON))
        self.assertEqual(out["count"], 2)  # 점심시간 안 반반차는 「휴가로 열린」 사람이 아니다
        self.assertEqual([p["name"] for p in out["people"]], ["김", "박", "이"])
        self.assertEqual(out["people"][0]["label"], "오전 반차")
        self.assertEqual(out["people"][0]["windows"], [{"start": "00:00", "end": "14:00", "kind": "HALF"}])
        self.assertEqual(out["lastSync"]["at"], "2026-11-16T10:05:00+09:00")
        self.assertNotIn("email", json.dumps(out))


class PlanRowsTest(unittest.TestCase):
    def test_plan_rows(self):
        d = date(2026, 11, 16)
        items = [
            SimpleNamespace(email=" A@X ", day=d, start="00:00", end="24:00", kind="VACATION", doc="1"),
            SimpleNamespace(email="a@x", day=d, start="00:00", end="24:00", kind="VACATION", doc="1"),
            SimpleNamespace(email="b@x", day=d, start="13:00", end="24:00", kind="HALF", doc=None),
        ]
        rows, unmatched = leave_service.plan_rows(items, {"a@x": 1})
        self.assertEqual(unmatched, 1)
        self.assertEqual([(r.member_id, r.start_min, r.end_min) for r in rows], [(1, 0, 1440)])

    def test_parse_hhmm(self):
        self.assertEqual(leave_service.parse_hhmm("24:00", allow_24=True), 1440)
        for bad in ("24:00", "12:60", "1:00", "ab:cd", "25:00"):
            with self.assertRaises(ValueError):
                leave_service.parse_hhmm(bad)


if __name__ == "__main__":
    unittest.main()
