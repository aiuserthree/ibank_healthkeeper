"""뿅뿅 달나라 대포(moonshot) 아케이드 붙이기 — 서버 목록 · 틀 화면 · 본체 신호 · 그림 · 색 · 장르 · 대표 그림 정적 검사 (DB 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_moonshot_static.py -v
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import struct
import unittest

os.environ.setdefault("DEBUG", "false")

from app.services import game  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
BODY_PATH = ROOT / "web/games/embed/moonshot.html"
BODY = BODY_PATH.read_text(encoding="utf-8")
FRAME = (ROOT / "web/games/moonshot.html").read_text(encoding="utf-8")
PLAY_JS = (ROOT / "web/_shared/play.js").read_text(encoding="utf-8")
ARCADE = (ROOT / "web/arcade.html").read_text(encoding="utf-8")
THUMB = ROOT / "web/assets/lounge/moonshot.jpg"
ART = ROOT / "web/assets/games/moonshot"


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


class MoonshotStaticTest(unittest.TestCase):
    def test_games_entry(self):
        # Newer releases may precede this game; it must remain ahead of older ones.
        self.assertLess(list(game.GAMES).index("moonshot"), list(game.GAMES).index("ferry"))
        first = game.GAMES["moonshot"]
        self.assertEqual(first.key, "moonshot")
        self.assertEqual(first.title, "뿅뿅 달나라 대포")
        self.assertEqual(first.category, "MINI")
        self.assertEqual(first.max_score, 10_000)
        self.assertEqual(first.unit, "점")
        self.assertEqual(first.icon, "moon-star")
        self.assertFalse(first.lower_better)
        self.assertEqual(first.added, "2026-11-20")

    def test_frame_page_wide(self):
        self.assertIn('HKEmbed.mount({ key: "moonshot"', FRAME)
        self.assertIn('src: "/games/embed/moonshot.html?hk=1"', FRAME)
        self.assertIn("wide: true", FRAME)
        self.assertIn(f"<title>{game.GAMES['moonshot'].title} — 아케이드</title>", FRAME)

    def test_body_signals_and_score_max(self):
        m = re.search(r"var SCORE_MAX = (\d+);", BODY)
        self.assertIsNotNone(m)
        self.assertEqual(int(m.group(1)), game.GAMES["moonshot"].max_score)
        for sig in ("hk:ready", "hk:start", "hk:live", "hk:score", "hk:esc", "hk:paused", "hk:resumed", "hk:pause", "hk:resume", "hk:restart", "hk:hello"):
            self.assertIn(sig, BODY, sig)
        # 아케이드 모드는 ?hk=1 · 도전 판만 시작 · 점수(연습 판 제외) · 받는 쪽 주소는 같은 주소
        self.assertIn("ARC = /[?&]hk=1(&|$)/.test(location.search)", BODY)
        self.assertIn("chal: ARC && !practice", BODY)
        self.assertIn("window.parent.postMessage(msg, location.origin)", BODY)
        self.assertIn(f"<title>{game.GAMES['moonshot'].title}</title>", BODY)

    def test_body_no_external_assets_and_size(self):
        self.assertIsNone(re.search(r"<(script|img|audio|link)[^>]+(src|href)=[\"']https?://", BODY))
        self.assertNotRegex(BODY, r"https?://[^\"'\s]*\.(webp|png|jpe?g|mp3|ogg|wav)")
        self.assertNotRegex(BODY, r"\.(mp3|ogg|wav|m4a)['\"]")  # 소리는 Web Audio 합성
        self.assertLessEqual(BODY_PATH.stat().st_size, 800_000)

    def test_tint_and_genre(self):
        self.assertIn('moonshot: ["#1b1f4b", "#ffcf4a"],', PLAY_JS)
        self.assertIn('moonshot: "슈팅",', ARCADE)
        # 새 게임 줄은 ferry 줄 바로 위(최신순)
        self.assertLess(PLAY_JS.index("moonshot:"), PLAY_JS.index("ferry:"))
        self.assertLess(ARCADE.index('moonshot: "'), ARCADE.index('ferry: "'))

    def test_art_assets(self):
        self.assertIn("var ART_BASE = '/assets/games/moonshot/';", BODY)
        names = {"hero"}
        names |= {f"rover-{k}" for k in ("rabbit", "turtle", "squirrel", "mole", "penguin", "owl")}
        names |= set(re.findall(r"'((?:icon|bg|soil|rim)-[a-z0-9-]+)'", BODY))
        self.assertGreaterEqual(len(names), 31)
        man = json.loads((ART / "manifest.json").read_text(encoding="utf-8"))["files"]
        listed = {v["file"][:-5] for v in man.values()}
        for n in names:
            p = ART / f"{n}.webp"
            self.assertTrue(p.is_file(), n)
            self.assertIn(n, listed, n)
            self.assertLessEqual(p.stat().st_size, 300_000, n)
        self.assertLessEqual(sum(p.stat().st_size for p in ART.iterdir()), 1_500_000)
        first = sum((ART / v["file"]).stat().st_size for v in man.values() if v.get("load") == "first")
        self.assertLessEqual(first + BODY_PATH.stat().st_size, 1_500_000)
        self.assertIn("noart", BODY)  # 그림을 못 받으면 코드 그림 — ?noart=1 로 시험

    def test_thumbnail(self):
        self.assertEqual(jpeg_size(THUMB), (900, 450))
        self.assertLessEqual(THUMB.stat().st_size, 80_000)

    def test_no_other_game_titles(self):
        # 본체 · 틀 화면 · 소개 글에 다른 게임 이름을 쓰지 않는다
        g = game.GAMES["moonshot"]
        texts = {"body": BODY, "frame": FRAME, "desc": g.desc}
        for key, other in game.GAMES.items():
            if key == "moonshot" or len(other.title) < 3:
                continue
            for where, t in texts.items():
                self.assertNotIn(other.title, t, f"{where} 에 「{other.title}」")


if __name__ == "__main__":
    unittest.main()
