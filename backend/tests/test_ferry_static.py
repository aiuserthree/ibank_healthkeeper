"""통통배 선착장(ferry) 아케이드 붙이기 — 서버 목록 · 틀 화면 · 본체 · 색 · 장르 · 대표 그림 정적 검사 (DB 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_ferry_static.py -v
"""

from __future__ import annotations

import os
import pathlib
import re
import struct
import unittest

os.environ.setdefault("DEBUG", "false")

from app.services import game  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
BODY_PATH = ROOT / "web/games/embed/ferry.html"
BODY = BODY_PATH.read_text(encoding="utf-8")
FRAME = (ROOT / "web/games/ferry.html").read_text(encoding="utf-8")
PLAY_JS = (ROOT / "web/_shared/play.js").read_text(encoding="utf-8")
ARCADE = (ROOT / "web/arcade.html").read_text(encoding="utf-8")
THUMB = ROOT / "web/assets/lounge/ferry.jpg"


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


class FerryStaticTest(unittest.TestCase):
    def test_games_entry(self):
        # 목록 맨 위는 그 뒤에 나온 더 새 게임이 차지한다 — 등록돼 있고 먼저 나온 게임(옥상 링 캐치)보다 위에 있는지만 본다
        keys = list(game.GAMES)
        self.assertLess(keys.index("ferry"), keys.index("ringcatch"))
        first = game.GAMES["ferry"]
        self.assertEqual(first.key, "ferry")
        self.assertEqual(first.title, "통통배 선착장")
        self.assertEqual(first.category, "MINI")
        self.assertEqual(first.max_score, 1_000_000)
        self.assertEqual(first.unit, "점")
        self.assertEqual(first.icon, "sailboat")
        self.assertRegex(first.added, r"^\d{4}-\d{2}-\d{2}$")

    def test_frame_page(self):
        self.assertIn('HKEmbed.mount({ key: "ferry"', FRAME)
        self.assertIn('src: "/games/embed/ferry.html?hk=1"', FRAME)
        self.assertIn(f"<title>{game.GAMES['ferry'].title} — 아케이드</title>", FRAME)

    def test_body_signals_and_score_max(self):
        m = re.search(r"const SCORE_MAX=(\d+);", BODY)
        self.assertIsNotNone(m)
        self.assertEqual(int(m.group(1)), game.GAMES["ferry"].max_score)
        for sig in ("hk:ready", "hk:start", "hk:live", "hk:score", "hk:esc", "hk:paused", "hk:resumed"):
            self.assertIn(sig, BODY, sig)
        self.assertRegex(BODY, r"const GAME=\{\s*name:'" + re.escape(game.GAMES["ferry"].title) + "'")

    def test_body_no_external_assets_and_size(self):
        self.assertIsNone(re.search(r"<(script|img|audio|link)[^>]+(src|href)=[\"']https?://", BODY))
        self.assertLessEqual(BODY_PATH.stat().st_size, 800_000)

    def test_tint_and_genre(self):
        self.assertIn('ferry: ["#0b5f86", "#ffb02e"],', PLAY_JS)
        self.assertIn('ferry: "퍼즐",', ARCADE)

    def test_art_assets_exist_and_small(self):
        # 본체가 부르는 그림(/assets/games/ferry/<이름>.webp) — ART_FILES 목록의 파일이 모두 있고, 폴더 합계 1.5MB · 한 장 300KB 이하
        self.assertIn("'/assets/games/ferry/'+n+'.webp'", BODY)
        m = re.search(r"const ART_FILES=\[([^\]]+)\]", BODY)
        self.assertIsNotNone(m)
        names = re.findall(r"'([a-z0-9]+)'", m.group(1))
        self.assertGreaterEqual(len(names), 10)
        folder = ROOT / "web/assets/games/ferry"
        for n in names:
            p = folder / f"{n}.webp"
            self.assertTrue(p.is_file(), n)
            self.assertLessEqual(p.stat().st_size, 300_000, n)
        self.assertLessEqual(sum(p.stat().st_size for p in folder.iterdir()), 1_500_000)
        self.assertNotRegex(BODY, r"https?://[^\"'\s]*\.(webp|png|jpe?g)")

    def test_thumbnail(self):
        self.assertEqual(jpeg_size(THUMB), (900, 450))
        self.assertLessEqual(THUMB.stat().st_size, 80_000)


if __name__ == "__main__":
    unittest.main()
