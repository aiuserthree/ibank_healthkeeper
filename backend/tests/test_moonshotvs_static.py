"""뿅뿅 달나라 대포 대전(moonshotvs) 아케이드 붙이기 — 서버 목록 · 목록 자리 · 색 · 장르 · 대전 알림 · 함께하기 · 팀즈 문구 · 대표 그림 정적 검사 (DB 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_moonshotvs_static.py -v
"""

from __future__ import annotations

import os
import pathlib
import re
import struct
import unittest

os.environ.setdefault("DEBUG", "false")

from app.models import Member, MemberStatus  # noqa: E402
from app.routers import realtime_ws  # noqa: E402
from app.services import game, match, party, teams  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
FRAME_PATH = ROOT / "web/games/moonshotvs.html"
FRAME = FRAME_PATH.read_text(encoding="utf-8")
BODY = (ROOT / "web/games/embed/moonshot.html").read_text(encoding="utf-8")
PLAY_JS = (ROOT / "web/_shared/play.js").read_text(encoding="utf-8")
ARCADE = (ROOT / "web/arcade.html").read_text(encoding="utf-8")
TOGETHER = (ROOT / "web/together.html").read_text(encoding="utf-8")
THUMB = ROOT / "web/assets/lounge/moonshotvs.jpg"
SOLO_THUMB = ROOT / "web/assets/lounge/moonshot.jpg"


def jpeg_size(path: pathlib.Path) -> tuple[int, int]:
    data = path.read_bytes()
    assert data[:2] == b"\xff\xd8", "JPEG 머리가 아님"
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", data[i + 5 : i + 9])
            return w, h
        seg = struct.unpack(">H", data[i + 2 : i + 4])[0]
        i += 2 + seg
    raise AssertionError("JPEG 크기를 못 찾음")


def block(text: str, start: str, end: str) -> str:
    i = text.index(start)
    return text[i : text.index(end, i)]


class MoonshotVsStaticTest(unittest.TestCase):
    def test_frame_file(self):
        self.assertTrue(FRAME_PATH.is_file())
        self.assertIn(f"<title>{game.GAMES['moonshotvs'].title} — 아케이드</title>", FRAME)
        # 전장은 혼자 하기 본체(16:9 와이드 1920×1080 판)를 ?vs=1 로 창에 띄운다
        self.assertIn('"/games/embed/moonshot.html?vs=1"', FRAME)
        self.assertIn("var W = 1920, H = 1080", BODY)

    def test_game_entry(self):
        g = game.GAMES["moonshotvs"]
        self.assertEqual(g.title, "뿅뿅 달나라 대포 대전")
        self.assertEqual(g.category, "MINI")
        self.assertEqual(g.unit, "승")  # 대전 게임 꼴(bumpervs · jellyvs 와 같음)
        self.assertEqual(g.max_score, game.GAMES["jellyvs"].max_score)
        self.assertEqual(g.icon, "moon-star")
        self.assertFalse(g.lower_better)
        self.assertEqual(g.added, "2026-11-20")
        self.assertTrue(g.desc.startswith("동료와 1:1 또는 2:2 · 3:3 팀전(빈자리는 컴퓨터) · "))
        self.assertNotIn("moonshotvs", game.LOCAL_ONLY_GAMES)  # 정식 공개
        self.assertTrue(game.game_visible("moonshotvs"))

    def test_list_position(self):
        # 새 게임은 맨 위 — 혼자 하기 · 대전 짝은 대전이 바로 위(bumpervs/sundown · jellyvs/jelly 처럼)
        keys = list(game.GAMES)
        self.assertEqual(keys[:2], ["moonshotvs", "moonshot"])
        self.assertLess(keys.index("bumpervs"), keys.index("sundown"))
        self.assertLess(keys.index("jellyvs"), keys.index("jelly"))

    def test_versus_wiring(self):
        self.assertIn("moonshotvs", match.ENGINE_GAMES)
        self.assertIn("moonshotvs", match.MATCH_GAMES)
        self.assertIn("moonshotvs", realtime_ws.REALTIME_GAMES)
        self.assertIn("moonshotvs", party.PARTY_GAMES)
        self.assertIn("moonshotvs", party.TEAM_GAMES)

    def test_tint_and_genre(self):
        self.assertIn('moonshotvs: ["#1b1f4b", "#ffcf4a"],', PLAY_JS)  # 혼자 하기와 같은 색
        self.assertLess(PLAY_JS.index("moonshotvs:"), PLAY_JS.index("moonshot:"))
        self.assertIn('moonshotvs: "대전",', ARCADE)
        self.assertLess(ARCADE.index('moonshotvs: "'), ARCADE.index('moonshot: "'))

    def test_match_notice_first(self):
        notice = block(ARCADE, "const MATCH_NOTICE = [", "];")
        first = re.search(r'\["([a-z0-9]+)"', notice).group(1)
        self.assertEqual(first, "moonshotvs")
        self.assertIn('["moonshotvs", "달나라 대포 대전"]', notice)
        # 기존 줄은 그대로
        self.assertIn('["mansion", "두뇌 저택", "하러"], ["bumpervs", "범퍼카 대전"], ["jellyvs", "젤리 숲 대전"]', notice)

    def test_together_first(self):
        versus = block(TOGETHER, "const VERSUS = [", "];")
        first = re.search(r'key: "([a-z0-9]+)"', versus).group(1)
        self.assertEqual(first, "moonshotvs")
        line = next(ln for ln in versus.splitlines() if 'key: "moonshotvs"' in ln)
        for part in ('page: "/games/moonshotvs"', 'title: "뿅뿅 달나라 대포 대전"', 'img: "/assets/lounge/moonshotvs.jpg"', "1:1", "2:2 · 3:3", "빈자리는 컴퓨터"):
            self.assertIn(part, line)

    def test_teams_words(self):
        host = Member(id=1, email="u1@3ibank.com", name="김주인", status=MemberStatus.ACTIVE, entra_oid="oid-1")
        target = Member(id=2, email="u2@3ibank.com", name="이손님", status=MemberStatus.ACTIVE, entra_oid="oid-2")
        self.assertEqual(teams.MATCH_GAME_NAME["moonshotvs"], "달나라 대포")
        ch = teams.render_match_challenged_body(game="moonshotvs", match_id=3, target=target, challenger=host, deadline_at=None)
        self.assertIn("달나라 대포 대전 신청", ch)
        self.assertNotIn("대전 대전", ch)
        self.assertIn("/games/moonshotvs#m3", ch)
        ac = teams.render_match_accepted_body(game="moonshotvs", match_id=3, challenger=host, opponent=target, first=host)
        self.assertIn("달나라 대포 대전 수락", ac)
        self.assertIn("탈것을 고르면 시작돼요", ac)
        self.assertNotIn("대전 대전", ac)
        inv = teams.render_party_invited_body(game="moonshotvs", party_id=7, target=target, host=host, deadline_at=None)
        self.assertIn("달나라 대포 여러 명 팀전 초대", inv)
        self.assertIn("여러 명이 함께하는 달나라 대포 팀전에 초대했어요", inv)
        self.assertIn("/games/moonshotvs#p7", inv)
        self.assertNotIn("경주", inv)
        # 다른 게임 문구는 그대로
        old = teams.render_party_invited_body(game="bumpervs", party_id=8, target=target, host=host, deadline_at=None)
        self.assertIn("범퍼카 대전 여러 명 경주 초대", old)
        jv = teams.render_match_accepted_body(game="jellyvs", match_id=4, challenger=host, opponent=target, first=host)
        self.assertIn("둘 다 대전 화면에 들어오면 바로 경기가 시작돼요.", jv)
        # 주간 소개(수요일 안내)에는 넣지 않음 — PM 몫
        self.assertNotIn("moonshotvs", [k for k, *_ in teams.OPEN_NOTICE_GAMES])

    def test_thumbnail(self):
        self.assertEqual(jpeg_size(THUMB), (900, 450))
        self.assertLessEqual(THUMB.stat().st_size, 80_000)
        self.assertNotEqual(THUMB.read_bytes(), SOLO_THUMB.read_bytes())  # 혼자 하기와 다른 구도

    def test_no_other_game_titles(self):
        # 틀 화면 · 소개 글에 다른 게임 이름을 쓰지 않는다(자기 이름 안에 든 혼자 하기 이름 「뿅뿅 달나라 대포」는 뺌)
        me = game.GAMES["moonshotvs"]
        texts = {"frame": FRAME, "desc": me.desc}
        for key, other in game.GAMES.items():
            if key == "moonshotvs" or len(other.title) < 3 or other.title in me.title:
                continue
            for where, t in texts.items():
                self.assertNotIn(other.title, t, f"{where} 에 「{other.title}」")


if __name__ == "__main__":
    unittest.main()
