"""개발용 가짜 로그인(/api/auth/sso/mock · /sso/mock/complete)은 로그인 방식이 mock 일 때만 — entra(운영)에서는 404,
콜백도 가짜 로그인 값(redis 의 sso code)은 mock 모드에서만 받는다. Microsoft 정상 로그인 콜백은 그대로.

실제 Redis · DB · Microsoft 없이(fakeredis · 가짜 회원 함수 · 가짜 provider) 돌린다. TestClient 는 with 로 쓰지 않는다(lifespan 안 띄움).
"""

from __future__ import annotations

import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest import mock

os.environ.setdefault("DEBUG", "false")

import fakeredis  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.deps import get_redis_client  # noqa: E402
from app.database import get_db  # noqa: E402
from app.routers import auth  # noqa: E402
from app.services.sso import SSOClaims, store_sso_code, store_sso_state  # noqa: E402


class FakeProvider:
    def __init__(self, claims=None):
        self.claims = claims
        self.calls = []

    async def exchange_code(self, code, verifier):
        self.calls.append((code, verifier))
        if self.claims is None:
            raise auth.SSOAuthError("Microsoft 로그인에 실패했습니다.")
        return self.claims


class SsoMockGuard(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        self.redis = fakeredis.FakeAsyncRedis(decode_responses=True)
        api = FastAPI()
        api.include_router(auth.router, prefix="/api")

        async def fake_db():
            yield None

        async def fake_redis():
            return self.redis

        api.dependency_overrides[get_db] = fake_db
        api.dependency_overrides[get_redis_client] = fake_redis
        self.client = TestClient(api, follow_redirects=False)
        self.upsert = mock.AsyncMock(return_value=SimpleNamespace(id=42))
        for p in (
            mock.patch.object(auth.account_service, "upsert_member_from_sso", self.upsert),
            mock.patch.object(auth, "fetch_and_store_from_graph", mock.AsyncMock()),
        ):
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        self.loop.close()

    def mode(self, provider):
        p = mock.patch.object(auth, "get_settings", return_value=SimpleNamespace(sso_provider=provider))
        p.start()
        self.addCleanup(p.stop)

    def run_(self, c):
        return self.loop.run_until_complete(c)

    def state(self, value="st-1"):
        self.run_(store_sso_state(self.redis, value, verifier="v", return_to="/arcade"))
        return value

    def mock_code(self, code="code-1"):
        self.run_(store_sso_code(self.redis, code, SSOClaims(oid="fake-oid", email="x@3ibank.com", name="가짜")))
        return code

    # ── entra(운영) ──

    def test_entra_mock_routes_404(self):
        self.mode("entra")
        st = self.state()
        self.assertEqual(self.client.get("/api/auth/sso/mock", params={"state": st}).status_code, 404)
        r = self.client.get("/api/auth/sso/mock/complete", params={"state": st, "oid": "o", "email": "x@3ibank.com", "name": "n"})
        self.assertEqual(r.status_code, 404)
        self.assertEqual(self.run_(self.redis.keys("*sso*code*")), [])  # 가짜 로그인 값을 만들지 않았다

    def test_entra_callback_ignores_mock_code(self):
        # 어떻게든 redis 에 가짜 로그인 값이 들어 있어도 entra 에서는 Microsoft 교환으로만 — 실패하면 로그인 안 됨
        self.mode("entra")
        provider = FakeProvider(claims=None)
        with mock.patch.object(auth, "get_sso_provider", return_value=provider):
            r = self.client.get("/api/auth/sso/callback", params={"code": self.mock_code(), "state": self.state()})
        self.assertEqual(r.status_code, 302)
        self.assertEqual(provider.calls, [("code-1", "v")])
        self.upsert.assert_not_called()
        self.assertNotIn("set-cookie", {k.lower() for k in r.headers.keys()})

    def test_entra_normal_login_unchanged(self):
        self.mode("entra")
        claims = SSOClaims(oid="real-oid", email="kim@3ibank.com", name="김")
        with mock.patch.object(auth, "get_sso_provider", return_value=FakeProvider(claims=claims)):
            r = self.client.get("/api/auth/sso/callback", params={"code": "ms-code", "state": self.state()})
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r.headers["location"].endswith("/arcade"))
        self.upsert.assert_awaited_once()
        self.assertEqual(self.upsert.await_args.kwargs["oid"], "real-oid")
        self.assertIn(auth.settings.session_cookie_name, r.headers.get("set-cookie", ""))

    # ── mock(로컬 개발) — 지금처럼 ──

    def test_mock_mode_flow_works(self):
        self.mode("mock")
        st = self.state()
        page = self.client.get("/api/auth/sso/mock", params={"state": st})
        self.assertEqual(page.status_code, 200)
        self.assertIn("/api/auth/sso/mock/complete?", page.text)
        r = self.client.get("/api/auth/sso/mock/complete", params={"state": st, "oid": "mock-001", "email": "Dev@3ibank.com", "name": "개발"})
        self.assertEqual(r.status_code, 302)
        self.assertIn("/api/auth/sso/callback?", r.headers["location"])
        provider = FakeProvider(claims=None)
        with mock.patch.object(auth, "get_sso_provider", return_value=provider):
            cb = self.client.get(r.headers["location"])
        self.assertEqual(cb.status_code, 302)
        self.assertEqual(provider.calls, [])  # 가짜 로그인 값으로 들어감
        self.assertEqual(self.upsert.await_args.kwargs["email"], "dev@3ibank.com")
        self.assertIn(auth.settings.session_cookie_name, cb.headers.get("set-cookie", ""))


if __name__ == "__main__":
    unittest.main()
