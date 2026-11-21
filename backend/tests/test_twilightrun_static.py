"""황혼 질주(twilightrun) 아케이드 붙이기 — 서버 목록 · 틀 화면 · 본체 신호 · 점수 상한 · 색 · 장르 · 대표 그림 정적 검사 (DB 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_twilightrun_static.py -v
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
EMBED = ROOT / "web/games/embed"
PAGE = EMBED / "twilightrun.html"
JS_DIR = EMBED / "twilightrun"
FRAME = (ROOT / "web/games/twilightrun.html").read_text(encoding="utf-8")
PLAY_JS = (ROOT / "web/_shared/play.js").read_text(encoding="utf-8")
ARCADE = (ROOT / "web/arcade.html").read_text(encoding="utf-8")
THUMB = ROOT / "web/assets/lounge/twilightrun.jpg"


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


class TwilightrunStaticTest(unittest.TestCase):
    def test_games_entry(self):
        # 목록 맨 위는 그 뒤에 나온 더 새 게임이 차지할 수 있다 — 먼저 나온 달나라 대포 대전(moonshotvs)보다 위인지만 본다
        keys = list(game.GAMES)
        self.assertLess(keys.index("twilightrun"), keys.index("moonshotvs"))
        g = game.GAMES["twilightrun"]
        self.assertEqual(g.title, "황혼 질주")
        self.assertEqual(g.category, "MINI")
        self.assertEqual(g.unit, "점")
        self.assertEqual(g.max_score, 1_000_000)
        self.assertFalse(g.lower_better)
        self.assertRegex(g.added, r"^\d{4}-\d{2}-\d{2}$")

    def test_frame_page(self):
        self.assertIn('HKEmbed.mount({ key: "twilightrun"', FRAME)
        self.assertIn('src: "/games/embed/twilightrun.html?hk=1"', FRAME)
        self.assertIn("wide: true", FRAME)
        self.assertIn(f"<title>{game.GAMES['twilightrun'].title} — 아케이드</title>", FRAME)

    def test_score_limit_matches_server(self):
        drive = (JS_DIR / "drive.js").read_text(encoding="utf-8")
        m = re.search(r"export const SCORE_LIMIT = ([\d_]+);", drive)
        self.assertIsNotNone(m)
        self.assertEqual(int(m.group(1).replace("_", "")), game.GAMES["twilightrun"].max_score)
        # 점수는 상한으로 자른다
        self.assertIn("Math.min(SCORE_LIMIT", drive)

    def test_embed_messages(self):
        js = (JS_DIR / "game.js").read_text(encoding="utf-8")
        for sig in ("ready", "start", "live", "score", "esc", "paused", "resumed", "hello", "pause", "resume", "restart"):
            self.assertIn(f"hk:{sig}", js, sig)
        self.assertIn("event.origin !== location.origin", js)
        self.assertIn("event.source !== parent", js)
        self.assertIn("parent.postMessage({ type, ...detail }, location.origin)", js)

    def test_local_files_only(self):
        html = PAGE.read_text(encoding="utf-8")
        for src in re.findall(r'(?:src|href)="([^"]+)"', html):
            self.assertNotIn("://", src)
            self.assertTrue((PAGE.parent / src.split("?")[0]).is_file(), src)
        for f in list(JS_DIR.glob("*.js")) + [JS_DIR / "style.css"]:
            text = f.read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"(?:import|fetch|url)\s*\(?\s*['\"]https?://", text), f.name)
            for imp in re.findall(r"from '(\./[^']+)'", text):
                self.assertTrue((JS_DIR / imp.split("?")[0]).is_file(), imp)
        total = sum(p.stat().st_size for p in JS_DIR.rglob("*") if p.is_file())
        self.assertLessEqual(total, 1_000_000)

    def test_art_and_audio_exist(self):
        art = ROOT / "web/assets/games/twilightrun"
        for name in ("coupe", "sport", "gt", "hyper"):
            self.assertTrue((art / "garage" / f"{name}.webp").is_file(), name)
        # 휴게소(차에서 내린 장면 · 식당) 그림과 음식 4종 — 게임 안 drive.js 의 음식 id 와 같아야 한다
        drive = (JS_DIR / "drive.js").read_text(encoding="utf-8")
        for name in ("exterior", "interior", "walnut", "udon", "hotbar", "coffee"):
            self.assertTrue((art / "rest" / f"{name}.webp").is_file(), name)
        for food in ("walnut", "udon", "hotbar", "coffee"):
            self.assertIn(f"id: '{food}'", drive)
        for name in ("collision", "debris", "horn"):
            self.assertTrue((art / "audio" / f"{name}.mp3").is_file(), name)
        self.assertTrue((art / "hero.jpg").is_file())
        # 그림 · 소리는 합쳐 2MB, 휴게소 영상(주유 12초 · 메뉴별 음식 8초, 소리 없음 960×540)은 따로 5MB
        files = [p for p in art.rglob("*") if p.is_file()]
        self.assertLessEqual(sum(p.stat().st_size for p in files if p.suffix != ".mp4"), 2_000_000)
        movies = ["refuel", "eat-walnut", "eat-udon", "eat-hotbar", "eat-coffee"]
        for name in movies:
            self.assertTrue((art / "rest" / f"{name}.mp4").is_file(), name)
        game_js = (JS_DIR / "game.js").read_text(encoding="utf-8")
        self.assertIn("playMovie('refuel'", game_js)
        self.assertIn("playMovie(`eat-${food.id}`", game_js)
        self.assertLessEqual(sum(p.stat().st_size for p in files if p.suffix == ".mp4"), 5_000_000)

    def test_tint_and_genre(self):
        self.assertIn('twilightrun: ["#302722", "#a4b840"],', PLAY_JS)
        self.assertIn('twilightrun: "레이싱",', ARCADE)

    def test_thumbnail(self):
        self.assertEqual(jpeg_size(THUMB), (900, 450))
        self.assertLessEqual(THUMB.stat().st_size, 80_000)


if __name__ == "__main__":
    unittest.main()
