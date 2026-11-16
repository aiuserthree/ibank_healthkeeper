"""쓰고 있는 로그인은 끊기지 않게 — 세션 기한 늘리기(core/session.touch_member_session) · 쿠키 기한 늘리기(main.py 미들웨어)."""
from __future__ import annotations

import asyncio
import os
import unittest

os.environ.setdefault("DEBUG", "false")

import fakeredis  # noqa: E402
from fastapi import Depends, FastAPI, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.core import session as S  # noqa: E402


class KeepAlive(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        self.r = fakeredis.FakeAsyncRedis(decode_responses=True)
        self.max = get_settings().session_max_age

    def tearDown(self):
        self.loop.close()

    def run_(self, c):
        return self.loop.run_until_complete(c)

    def test_touch(self):
        self.assertEqual(self.max, 86400 * 30)
        sid = self.run_(S.create_member_session(self.r, 7))
        self.assertFalse(self.run_(S.touch_member_session(self.r, sid)))  # 막 만든 세션은 그대로
        self.run_(self.r.expire(S._member_key(sid), 86400 * 3))  # 사흘 남음
        self.assertTrue(self.run_(S.touch_member_session(self.r, sid)))
        self.assertGreater(self.run_(self.r.ttl(S._member_key(sid))), self.max - 60)
        self.assertFalse(self.run_(S.touch_member_session(self.r, "없는세션")))

    def test_cookie_refreshed_by_middleware(self):
        from app.main import create_app

        app = create_app()

        @app.get("/__t")
        async def _t(request: Request):
            request.state.hk_session_refresh = "abc"
            return {"ok": True}

        @app.get("/__n")
        async def _n():
            return {"ok": True}

        # with 없이 — 앱 시작 단계(lifespan: 일정 작업 · DB 접속)를 돌리지 않는다. 로컬에서 진짜 앱을 켜지 않기 위해
        c = TestClient(app)
        h = c.get("/__t").headers.get("set-cookie", "")
        self.assertIn("hk_session=abc", h)
        self.assertIn(f"Max-Age={self.max}", h)
        self.assertIn("HttpOnly", h)
        self.assertNotIn("set-cookie", {k.lower() for k in c.get("/__n").headers.keys()})


if __name__ == "__main__":
    unittest.main()
