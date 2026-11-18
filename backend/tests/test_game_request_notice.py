"""아케이드 게임 요청 → 운영자 Teams 알림 시험 (실제 Postgres · Redis · Teams 없이).

DB 는 SQLite(임시 파일, aiosqlite). Teams 로 보내는 함수(_send_chat_message · _graph_request)는
불리면 실패하도록 mock 하고, 응답 뒤 발송(deliver_teams_messages)은 부른 id 만 적어 둔다.
받는 운영자 주소는 시험용 가짜 주소로 바꿔 둔다.
돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend <파이썬> -m unittest discover -s <저장소>/backend/tests -p "test_game_request_notice.py" -v
"""

from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

os.environ.setdefault("DEBUG", "false")

from fastapi import Depends, FastAPI, Header  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import BigInteger, select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.core.deps import get_current_active_member  # noqa: E402
from app.database import get_db  # noqa: E402
from app.models import GameRequest, Member, MemberStatus, TeamsMessage, TeamsMessageType  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.routers import play  # noqa: E402
from app.services import game, teams  # noqa: E402

OPS_EMAIL = "ops@example.test"
BASE = "https://hk.example.test"


@compiles(BigInteger, "sqlite")
def _bigint_sqlite(type_, compiler, **kw):  # SQLite 는 INTEGER 여야 스스로 번호가 붙는다
    return "INTEGER"


class GameRequestNotice(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.url = f"sqlite+aiosqlite:///{self.dir}/t.db"
        asyncio.run(self._schema())
        self.delivered: list[list[int]] = []

        async def deliver(ids):
            self.delivered.append(list(ids))

        boom = mock.AsyncMock(side_effect=AssertionError("Teams 로 보내면 안 됨"))
        patches = [
            mock.patch.object(teams, "_send_chat_message", boom),
            mock.patch.object(teams, "_graph_request", boom),
            mock.patch.object(teams, "deliver_teams_messages", deliver),
            mock.patch.object(type(get_settings()), "teams_graph_sender_ready", lambda self: True),
            mock.patch.object(get_settings(), "app_base_url", BASE),
            mock.patch.object(game, "GAME_REQUEST_NOTIFY_EMAILS", (OPS_EMAIL,)),
            # SQLite 의 기본 시각(CURRENT_TIMESTAMP)은 UTC — 하루 개수 세기를 같은 기준으로
            mock.patch.object(game, "now_kst", lambda: datetime.now(timezone.utc)),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.client = self._client()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    # ── 준비 ──────────────────────────────────────────────────

    async def _schema(self):
        engine = create_async_engine(self.url, poolclass=NullPool)

        def make(conn):
            for t in Base.metadata.sorted_tables:
                try:
                    t.create(conn)
                except Exception:  # noqa: BLE001 — SQLite 가 못 만드는 표(Postgres 전용 형식)는 건너뛴다
                    pass

        async with engine.begin() as conn:
            await conn.run_sync(make)
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            db.add_all([
                Member(id=1, email=OPS_EMAIL, name="운영자", department="운영팀", status=MemberStatus.ACTIVE, entra_oid="oid-ops"),
                Member(id=2, email="kim@example.test", name="김가짜", department="시험부", status=MemberStatus.ACTIVE, entra_oid="oid-2"),
                Member(id=3, email="lee@example.test", name="이<script>", department="A&B", status=MemberStatus.ACTIVE, entra_oid="oid-3"),
            ])
            await db.commit()
        await engine.dispose()

    def _client(self) -> TestClient:
        app = FastAPI()
        app.include_router(play.router, prefix="/api")
        url = self.url

        async def db_dep():
            engine = create_async_engine(url, poolclass=NullPool)
            try:
                async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                    yield db
            finally:
                await engine.dispose()

        async def who(x_member: int = Header(2), db=Depends(get_db)):
            return await db.get(Member, x_member)

        app.dependency_overrides[get_db] = db_dep
        app.dependency_overrides[get_current_active_member] = who
        return TestClient(app)  # with 로 쓰지 않는다 — 앱 lifespan 을 돌리지 않음

    def _query(self, fn):
        async def go():
            engine = create_async_engine(self.url, poolclass=NullPool)
            try:
                async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                    return await fn(db)
            finally:
                await engine.dispose()
        return asyncio.run(go())

    def requests(self) -> list[GameRequest]:
        async def fn(db):
            return list((await db.execute(select(GameRequest).order_by(GameRequest.id))).scalars())
        return self._query(fn)

    def messages(self) -> list[TeamsMessage]:
        async def fn(db):
            return list((await db.execute(select(TeamsMessage).order_by(TeamsMessage.id))).scalars())
        return self._query(fn)

    def post(self, member_id: int = 2, **body):
        return self.client.post("/api/play/requests", json=body, headers={"x-member": str(member_id)})

    def set_member(self, member_id: int, **fields):
        async def fn(db):
            m = await db.get(Member, member_id)
            for k, v in fields.items():
                setattr(m, k, v)
            await db.commit()
        self._query(fn)

    # ── 시험 ──────────────────────────────────────────────────

    def test_game_kind_queues_one_message(self):
        r = self.post(body="공룡 달리기 게임 만들어 주세요", kind="GAME")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"data": {"ok": True}})
        req = self.requests()
        self.assertEqual(len(req), 1)
        msgs = self.messages()
        self.assertEqual(len(msgs), 1)
        m = msgs[0]
        self.assertEqual((m.type, m.to_member_id, m.to_entra_oid), (TeamsMessageType.GAME_REQUEST, 1, "oid-ops"))
        self.assertEqual(m.dedupe_key, f"game-request:{req[0].id}:1")
        self.assertTrue(m.body.startswith("<p><strong>[헬스키퍼]</strong> 아케이드 게임 요청이 들어왔어요</p>"))
        for words in ("하고 싶은 게임", "<b>김가짜</b> · 시험부", "공룡 달리기 게임 만들어 주세요", f'href="{BASE}/admin/game-requests"'):
            self.assertIn(words, m.body)
        self.assertNotIn("기기:", m.body)
        self.assertEqual(self.delivered, [[m.id]])  # 응답 뒤 백그라운드 발송

    def test_all_three_kinds(self):
        key, g = next(iter(game.GAMES.items()))
        self.assertEqual(self.post(body="화면이 멈춰요", kind="BUG", game=key, device="iPhone · Safari").status_code, 200)
        self.assertEqual(self.post(body="버튼을 크게 해 주세요", kind="IDEA", game=key, device="PC · Chrome").status_code, 200)
        self.assertEqual(self.post(body="체스 말고 장기도", kind="GAME").status_code, 200)
        msgs = self.messages()
        self.assertEqual(len(msgs), 3)
        bug, idea, want = (m.body for m in msgs)
        self.assertIn("오류 신고", bug)
        self.assertIn(f"게임: {g.title}", bug)
        self.assertIn("기기: iPhone · Safari", bug)
        self.assertIn("개선 의견", idea)
        self.assertIn(f"게임: {g.title}", idea)
        self.assertNotIn("기기:", idea)  # 기기는 오류 신고일 때만
        self.assertIn("하고 싶은 게임", want)
        self.assertNotIn("게임:", want)
        self.assertEqual(len({m.dedupe_key for m in msgs}), 3)

    def test_own_request_not_notified(self):
        self.assertEqual(self.post(member_id=1, body="내가 보낸 요청").status_code, 200)
        self.assertEqual(len(self.requests()), 1)
        self.assertEqual(self.messages(), [])
        self.assertEqual(self.delivered, [])

    def test_no_recipient_member(self):
        with mock.patch.object(game, "GAME_REQUEST_NOTIFY_EMAILS", ("nobody@example.test",)):
            self.assertEqual(self.post(body="받을 사람 없음").status_code, 200)
        with mock.patch.object(game, "GAME_REQUEST_NOTIFY_EMAILS", ()):
            self.assertEqual(self.post(body="알림 꺼짐").status_code, 200)
        self.assertEqual(len(self.requests()), 2)
        self.assertEqual(self.messages(), [])

    def test_recipient_without_entra_oid(self):
        self.set_member(1, entra_oid=None)
        self.assertEqual(self.post(body="팀즈 연결 안 된 운영자").status_code, 200)
        self.assertEqual(len(self.requests()), 1)
        self.assertEqual(self.messages(), [])

    def test_teams_not_configured(self):
        with mock.patch.object(type(get_settings()), "teams_graph_sender_ready", lambda self: False), \
                mock.patch.object(teams, "_effective_refresh_token", lambda: ""):
            self.assertEqual(self.post(body="팀즈 설정 없음").status_code, 200)
        self.assertEqual(len(self.requests()), 1)
        self.assertEqual(self.messages(), [])
        self.assertEqual(self.delivered, [])

    def _sender_env(self, file_token: str):
        cls = type(get_settings())
        return [
            mock.patch.object(cls, "teams_graph_sender_ready", lambda self: False),  # 환경 변수 토큰은 비어 있음
            mock.patch.object(cls, "sso_ready", lambda self: True),
            mock.patch.object(get_settings(), "sso_provider", "entra"),
            mock.patch.object(get_settings(), "teams_sender_email", "sender@example.test"),
            mock.patch.object(teams, "_effective_refresh_token", lambda: file_token),
        ]

    def test_file_token_counts_as_ready(self):
        # 발송이 쓰는 .teams-sender-refresh 파일 토큰만 있어도 알림을 만든다(파일은 읽지 않고 함수만 바꿔 끼움)
        ps = self._sender_env("file-token")
        for p in ps:
            p.start()
        try:
            self.assertEqual(self.post(body="파일 토큰만 있음").status_code, 200)
        finally:
            for p in reversed(ps):
                p.stop()
        self.assertEqual(len(self.messages()), 1)
        ps = self._sender_env("")
        for p in ps:
            p.start()
        try:
            self.assertEqual(self.post(body="토큰이 아무 데도 없음").status_code, 200)
        finally:
            for p in reversed(ps):
                p.stop()
        self.assertEqual(len(self.requests()), 2)
        self.assertEqual(len(self.messages()), 1)

    def _assert_saved_without_notice(self, r, text):
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"data": {"ok": True}})
        self.assertEqual([q.body for q in self.requests()], [text])
        self.assertEqual(self.messages(), [])
        self.assertEqual(self.delivered, [])

    def test_flush_not_null_error_keeps_request(self):
        # DB 가 알림 행을 거부(NOT NULL) — 세션이 PendingRollback 이 되어도 500 이 아니라 200
        original = teams.enqueue_teams_message

        async def bad(db, **kw):
            kw["to_entra_oid"] = None
            return await original(db, **kw)

        client = TestClient(self.client.app, raise_server_exceptions=False)
        with mock.patch.object(teams, "enqueue_teams_message", bad), self.assertLogs("app.services.game", "ERROR"):
            r = client.post("/api/play/requests", json={"body": "알림 행 저장 실패"}, headers={"x-member": "2"})
        self._assert_saved_without_notice(r, "알림 행 저장 실패")

    def test_flush_unique_error_keeps_request(self):
        # 중복 키(UNIQUE) 충돌도 같은 길 — 이미 있는 키를 확인 없이 다시 넣는다
        from app.models import MailStatus

        async def dup(db, *, message_type, to_member_id, to_entra_oid, body, dedupe_key=None, reservation_id=None):
            for _ in range(2):
                db.add(TeamsMessage(type=message_type, to_member_id=to_member_id, to_entra_oid=to_entra_oid,
                                    body=body, status=MailStatus.PENDING, dedupe_key=dedupe_key))
            await db.flush()

        client = TestClient(self.client.app, raise_server_exceptions=False)
        with mock.patch.object(teams, "enqueue_teams_message", dup), self.assertLogs("app.services.game", "ERROR"):
            r = client.post("/api/play/requests", json={"body": "중복 키 충돌"}, headers={"x-member": "2"})
        self._assert_saved_without_notice(r, "중복 키 충돌")

    def test_notice_error_keeps_request(self):
        with mock.patch.object(teams, "render_game_request_admin_body", side_effect=RuntimeError("x")), \
                self.assertLogs("app.services.game", "ERROR"):
            r = self.post(body="알림이 실패해도 저장")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"data": {"ok": True}})
        self.assertEqual([q.body for q in self.requests()], ["알림이 실패해도 저장"])
        self.assertEqual(self.messages(), [])
        self.assertEqual(self.delivered, [])

    def test_html_escaped(self):
        key = next(iter(game.GAMES))
        self.post(member_id=3, body='<img src=x onerror="a()"> & <b>굵게</b>', kind="BUG", game=key, device="<i>폰</i>")
        body = self.messages()[0].body
        self.assertNotIn("<img", body)
        self.assertNotIn("<script>", body)
        self.assertNotIn("<i>", body)
        self.assertIn("&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &lt;b&gt;굵게&lt;/b&gt;", body)
        self.assertIn("<b>이&lt;script&gt;</b> · A&amp;B", body)
        self.assertIn("기기: &lt;i&gt;폰&lt;/i&gt;", body)

    def test_body_max_300(self):
        self.post(body="가" * 500)
        self.assertIn("<p>" + "가" * 300 + "</p>", self.messages()[0].body)

    def test_sixth_request_429_no_notice(self):
        for i in range(game.GAME_REQUEST_PER_DAY):
            self.assertEqual(self.post(body=f"요청 {i}").status_code, 200)
        r = self.post(body="여섯 번째")
        self.assertEqual(r.status_code, 429)
        self.assertEqual(len(self.requests()), 5)
        self.assertEqual(len(self.messages()), 5)
        self.assertEqual(len(self.delivered), 5)

    def test_real_recipient_constant(self):
        # 운영 상수는 기존 관리자 알림 주소 가운데 한 명뿐(주소는 시험에 적지 않는다)
        from app.services.reservation_return import RETURN_ADMIN_NOTIFY_EMAILS
        from app.services.transfer import TRANSFER_ADMIN_NOTIFY_EMAILS

        real = _real_constant()
        self.assertEqual(len(real), 1)
        self.assertIn(real[0], TRANSFER_ADMIN_NOTIFY_EMAILS)
        self.assertIn(real[0], RETURN_ADMIN_NOTIFY_EMAILS)

    def test_migration_adds_enum_value(self):
        import importlib.util
        from pathlib import Path

        versions = Path(game.__file__).resolve().parents[2] / "alembic" / "versions"
        self.assertIn("0039_game_request_notice", {p.stem for p in versions.glob("00*.py")})
        spec = importlib.util.spec_from_file_location("m0039", versions / "0039_game_request_notice.py")
        mig = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mig)
        self.assertEqual((mig.revision, mig.down_revision), ("0039_game_request_notice", "0038_arcade_stamp_kind"))
        op = mock.Mock()
        with mock.patch.object(mig, "op", op):
            mig.upgrade()
        op.execute.assert_called_once_with("ALTER TYPE teamsmessagetype ADD VALUE IF NOT EXISTS 'GAME_REQUEST'")
        self.assertEqual(TeamsMessageType.GAME_REQUEST.value, "GAME_REQUEST")

    def test_one_try_type(self):
        self.assertIn(TeamsMessageType.GAME_REQUEST, teams._TRANSFER_NOTIFY_TYPES)  # 재시도로 채팅이 겹치지 않게


def _real_constant() -> tuple[str, ...]:
    import ast
    from pathlib import Path

    src = Path(game.__file__).read_text(encoding="utf-8")
    for node in ast.parse(src).body:
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", "") == "GAME_REQUEST_NOTIFY_EMAILS":
            return tuple(ast.literal_eval(node.value))
    raise AssertionError("GAME_REQUEST_NOTIFY_EMAILS 없음")


if __name__ == "__main__":
    unittest.main()
