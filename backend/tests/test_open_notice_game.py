"""수요일 오픈 안내 「이번 주 게임」 소개 칸 시험 — 메시지 만들기(render_open_notice_body)만 부른다.

Teams 로 보내는 함수(_send_chat_message · _graph_request)는 부르지 않고, 혹시 불리면 실패하도록 mock 해 둔다.
돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend <파이썬> -m unittest discover -s <저장소>/backend/tests -p "test_open_notice_game.py" -v
"""

from __future__ import annotations

import os
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest import mock

os.environ.setdefault("DEBUG", "false")

from app.config import get_settings  # noqa: E402
from app.core.time import KST  # noqa: E402
from app.services import teams  # noqa: E402
from app.services.game import GAMES  # noqa: E402

WEB = Path(__file__).resolve().parents[2] / "web"
FIRST = date(2026, 11, 18)  # 첫 회(수)


def _body(notice_date: date) -> str:
    open_at = datetime.combine(notice_date, datetime.min.time(), tzinfo=KST).replace(hour=9)
    return teams.render_open_notice_body(
        name="홍길동",
        open_at=open_at,
        close_at=open_at.replace(hour=17),
        week_start=notice_date + timedelta(days=5),
        week_end=notice_date + timedelta(days=9),
        site_url="https://example.test/index",
        notice_date=notice_date,
    )


class OpenNoticeGame(unittest.TestCase):
    def setUp(self):
        boom = mock.AsyncMock(side_effect=AssertionError("Teams 로 보내면 안 됨"))
        self._patches = [
            mock.patch.object(teams, "_send_chat_message", boom),
            mock.patch.object(teams, "_graph_request", boom),
            mock.patch.object(get_settings(), "app_base_url", "https://hk.example.test"),
            mock.patch.object(get_settings(), "teams_open_notice_game_enabled", True),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in reversed(self._patches):
            p.stop()

    def test_first_is_sundown_bumpervs(self):
        self.assertEqual(FIRST.weekday(), 2)  # 수요일
        self.assertEqual(teams.OPEN_NOTICE_GAME_START, FIRST)
        key, title, _ = teams.open_notice_game_for(FIRST)
        self.assertEqual((key, title), ("bumpervs", "선다운 범퍼스 대전"))
        body = _body(FIRST)
        self.assertIn("이번 주 게임 · 선다운 범퍼스 대전", body)
        self.assertIn('href="https://hk.example.test/games/bumpervs"', body)
        for words in ("최대 6명이 한 트랙에서", "빈자리는 컴퓨터", "Teams 로 알림", "13개", "아이템", "점심시간"):
            self.assertIn(words, body)

    def test_versus_games_mention_win_bonus(self):
        # 대전 게임(1 ~ 3회)은 「동료를 이기면 그날 도장 2개!」 한 줄 — 혼자 하는 게임(4회부터)에는 넣지 않는다
        bonus = "동료를 이기면 그날 도장 2개!"
        for i, (key, _, lines) in enumerate(teams.OPEN_NOTICE_GAMES):
            body = _body(FIRST + timedelta(weeks=i))
            if key in ("bumpervs", "jellyvs", "mansion"):
                self.assertEqual(sum(bonus in x for x in lines), 1, key)
                self.assertIn(f"<b>{bonus}</b>", body)
            else:
                self.assertNotIn(bonus, body, key)

    def test_existing_parts_kept_and_game_last(self):
        body = _body(FIRST)
        self.assertTrue(body.startswith("<p><strong>[헬스키퍼]</strong> 차주 안마 예약 신청 안내</p>"))
        self.assertIn('<a href="https://example.test/index">', body)
        self.assertLess(body.index("오늘의 1분 스트레칭"), body.index("이번 주 게임"))
        self.assertTrue(body.endswith("</a></p>"))

    def test_rotates_weekly_and_wraps(self):
        n = len(teams.OPEN_NOTICE_GAMES)
        self.assertGreaterEqual(n, 6)
        for i, (key, _, _) in enumerate(teams.OPEN_NOTICE_GAMES):
            self.assertEqual(teams.open_notice_game_for(FIRST + timedelta(weeks=i))[0], key)
        self.assertEqual(teams.open_notice_game_for(FIRST + timedelta(weeks=1))[0], "jellyvs")
        self.assertEqual(teams.open_notice_game_for(FIRST + timedelta(weeks=n))[0], "bumpervs")  # 끝나면 처음부터
        # 같은 주 다른 요일(수동 조기 발송 등)도 그 주 게임
        self.assertEqual(teams.open_notice_game_for(FIRST + timedelta(days=6))[0], "bumpervs")
        self.assertEqual(teams.open_notice_game_for(FIRST + timedelta(days=7))[0], "jellyvs")
        self.assertIn("꿀꺽 젤리 숲 대전", _body(FIRST + timedelta(weeks=1)))

    def test_not_before_first(self):
        self.assertIsNone(teams.open_notice_game_for(date(2026, 11, 11)))
        self.assertIsNone(teams.open_notice_game_for(None))
        self.assertNotIn("이번 주 게임", _body(date(2026, 11, 11)))
        self.assertNotIn("이번 주 게임", _body(FIRST - timedelta(days=1)))

    def test_can_turn_off(self):
        with mock.patch.object(get_settings(), "teams_open_notice_game_enabled", False):
            body = _body(FIRST)
        self.assertNotIn("이번 주 게임", body)
        self.assertNotIn("/games/bumpervs", body)
        self.assertIn("오늘의 1분 스트레칭", body)

    def test_entries_are_real_games(self):
        seen = set()
        for key, title, lines in teams.OPEN_NOTICE_GAMES:
            self.assertIn(key, GAMES)
            self.assertEqual(title, GAMES[key].title)
            self.assertNotIn(key, seen)
            seen.add(key)
            self.assertTrue(2 <= len(lines) <= 5, key)
            self.assertTrue((WEB / "games" / f"{key}.html").is_file(), key)
            self.assertTrue((WEB / "assets" / "lounge" / f"{key}.jpg").is_file(), key)
        self.assertEqual(teams.game_thumb_url("bumpervs"), "https://hk.example.test/assets/lounge/bumpervs.jpg")


if __name__ == "__main__":
    unittest.main()
