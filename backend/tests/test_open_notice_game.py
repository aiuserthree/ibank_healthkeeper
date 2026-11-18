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
        for words in ("범퍼카", "1:1", "최대 6명", "빈자리는 컴퓨터"):
            self.assertIn(words, body)

    def test_versus_games_mention_win_bonus(self):
        # 사람 대전이 되는 게임은 소개 바로 다음 줄에 굵게 「🏅 동료를 이기면 그날 도장 2개!」 — 혼자 하는 게임에는 넣지 않는다
        from app.services.match import MATCH_GAMES
        from app.services.party import PARTY_GAMES

        bonus = "동료를 이기면 그날 도장 2개!"
        versus = set(MATCH_GAMES) | set(PARTY_GAMES)
        seen_versus = 0
        for i, (key, _, lines) in enumerate(teams.OPEN_NOTICE_GAMES):
            body = _body(FIRST + timedelta(weeks=i))
            if key in versus:
                seen_versus += 1
                self.assertEqual(lines[1], teams.WIN_BONUS_LINE, key)  # 소개 바로 다음 줄
                self.assertEqual(sum(bonus in x for x in lines), 1, key)
                self.assertIn(f"<b>🏅 {bonus}</b> (보너스는 한 달 5번까지)", body)
            else:
                self.assertNotIn(bonus, body, key)
                self.assertNotIn("도장", body.split("이번 주 게임")[1], key)
        self.assertGreaterEqual(seen_versus, 3)

    def test_short_and_no_win_rule(self):
        # 소개는 짧게, 승 · 순위 설명은 빼기
        for i, (key, _, lines) in enumerate(teams.OPEN_NOTICE_GAMES):
            body = _body(FIRST + timedelta(weeks=i))
            part = body.split("이번 주 게임")[1]
            for words in ("1승", "1등", "순위"):
                self.assertNotIn(words, part, key)
            self.assertLessEqual(len(lines), 2, key)
            self.assertEqual(part.count("<br>"), len(lines) + 1, key)  # 제목 줄 + 소개 줄 + 링크

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
            self.assertTrue(1 <= len(lines) <= 2, key)
            self.assertTrue((WEB / "games" / f"{key}.html").is_file(), key)
            self.assertTrue((WEB / "assets" / "lounge" / f"{key}.jpg").is_file(), key)
        self.assertEqual(teams.game_thumb_url("bumpervs"), "https://hk.example.test/assets/lounge/bumpervs.jpg")


def _old_teams():
    """고치기 전(HEAD) teams.py 를 따로 불러온다 — 다른 날짜 본문이 한 글자도 안 바뀌었는지 견주는 용도."""
    import importlib.util
    import subprocess
    import tempfile

    repo = Path(__file__).resolve().parents[2]
    src = subprocess.run(
        ["git", "-C", str(repo), "show", "HEAD:backend/app/services/teams.py"],
        check=True, capture_output=True, text=True,
    ).stdout
    tmp = Path(tempfile.mkdtemp()) / "teams_head.py"
    tmp.write_text(src, encoding="utf-8")
    spec = importlib.util.spec_from_file_location("teams_head_for_test", tmp)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _body_with(mod, notice_date: date) -> str:
    open_at = datetime.combine(notice_date, datetime.min.time(), tzinfo=KST).replace(hour=9)
    return mod.render_open_notice_body(
        name="홍길동",
        open_at=open_at,
        close_at=open_at.replace(hour=17),
        week_start=notice_date + timedelta(days=5),
        week_end=notice_date + timedelta(days=9),
        site_url="https://example.test/index",
        notice_date=notice_date,
    )


class OpenNoticeStampGoal(unittest.TestCase):
    """2026-12-02(수) 오픈 안내에 한 번만 붙는 「아케이드 도장 안내」 칸."""

    DAY = date(2026, 12, 2)

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

    def test_dec2_has_stamp_goal_part(self):
        self.assertEqual(teams.OPEN_NOTICE_STAMP_GOAL_DATE, self.DAY)
        self.assertEqual(self.DAY.weekday(), 2)  # 수요일
        body = _body(self.DAY)
        self.assertIn("<strong>🎮 아케이드 도장 안내</strong>", body)
        self.assertIn("12월 1일부터 도장 <b>15개</b>를 모으면 무적 쿠폰 1장이에요(전에는 10개).", body)
        for words in ("15개", "전에는 10개", "그대로 이어져요", "도장 2개", "한 달 5번까지"):
            self.assertIn(words, body)
        self.assertIn('<a href="https://hk.example.test/arcade">https://hk.example.test/arcade</a>', body)
        self.assertEqual(body.count("아케이드 도장 안내"), 1)
        # 자리 — 예약 링크 다음, 스트레칭 앞(기존 한 번짜리 칸과 같은 자리)
        self.assertLess(body.index('href="https://example.test/index"'), body.index("아케이드 도장 안내"))
        self.assertLess(body.index("아케이드 도장 안내"), body.index("오늘의 1분 스트레칭"))

    def test_other_days_have_no_part(self):
        for d in (date(2026, 11, 25), date(2026, 12, 9), date(2026, 12, 1), date(2026, 12, 3)):
            self.assertNotIn("아케이드 도장 안내", _body(d), d)

    def test_other_days_unchanged_from_head(self):
        old = _old_teams()
        days = [date(2026, 11, 4), date(2026, 11, 11), date(2026, 11, 18), date(2026, 11, 25),
                date(2026, 12, 1), date(2026, 12, 3), date(2026, 12, 9), date(2027, 1, 6)]
        for d in days:
            self.assertEqual(_body(d), _body_with(old, d), d)
        # 12월 2일은 도장 칸 하나만 더해진 것과 같다
        new2, old2 = _body(self.DAY), _body_with(old, self.DAY)
        part = teams._open_notice_stamp_goal_html()
        cut = old2.index("<p>&nbsp;</p><p><strong>오늘의 1분 스트레칭")
        self.assertEqual(new2, old2[:cut] + part + old2[cut:])

    def test_dec2_keeps_weekly_game(self):
        body = _body(self.DAY)
        key, title, lines = teams.open_notice_game_for(self.DAY)
        self.assertIn(f"이번 주 게임 · {title}", body)
        self.assertIn(f'href="https://hk.example.test/games/{key}"', body)
        self.assertLess(body.index("아케이드 도장 안내"), body.index("이번 주 게임"))
        self.assertTrue(body.endswith("</a></p>"))

    def test_numbers_follow_constants(self):
        from app.services import game as game_service

        with mock.patch.object(game_service, "STAMP_GOAL", 20), \
                mock.patch.object(game_service, "STAMP_GOAL_OLD", 12), \
                mock.patch.object(game_service, "STAMP_GOAL_FROM", date(2027, 1, 5)), \
                mock.patch.object(game_service, "WIN_BONUS_MONTHLY_CAP", 7):
            body = _body(self.DAY)
        self.assertIn("1월 5일부터 도장 <b>20개</b>", body)
        self.assertIn("(전에는 12개)", body)
        self.assertIn("한 달 7번까지", body.split("아케이드 도장 안내")[1].split("이번 주 게임")[0])
        self.assertNotIn("15개", body)


if __name__ == "__main__":
    unittest.main()
