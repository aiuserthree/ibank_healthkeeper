"""곰돌이 새총 원정대(slingfort) 아케이드 붙이기 — 서버 목록 · 틀 화면 · 본체 · 색 · 장르 · 그림 · 진행 저장 검사 (DB 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_slingfort_static.py -v
"""

from __future__ import annotations

import os
import pathlib
import re
import struct
import unittest

os.environ.setdefault("DEBUG", "false")

from app.services import game, mgmt  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
BODY_PATH = ROOT / "web/games/embed/slingfort.html"
BODY = BODY_PATH.read_text(encoding="utf-8")
FRAME = (ROOT / "web/games/slingfort.html").read_text(encoding="utf-8")
PLAY_JS = (ROOT / "web/_shared/play.js").read_text(encoding="utf-8")
ARCADE = (ROOT / "web/arcade.html").read_text(encoding="utf-8")
DOC = (ROOT / "docs/arcade-higgsfield.md").read_text(encoding="utf-8")
THUMB = ROOT / "web/assets/lounge/slingfort.jpg"
ART = ROOT / "web/assets/games/slingfort"


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


def good_state() -> dict:
    return {
        "v": 1, "gold": 450, "unlocked": 4, "last": 4,
        "stars": {"1": 3, "2": 2, "3": 1}, "best": {"1": 520, "2": 610, "3": 480},
        "cleared": {"1": True, "2": True, "3": True},
        "up": {"bomb": 1, "shield": 0, "giant": 2, "horn": 1}, "music": True, "sfx": False,
    }


class SlingfortStaticTest(unittest.TestCase):
    def test_games_entry_on_top(self):
        # 새 게임은 목록 맨 위(숨긴 문구 팡팡 주석 줄보다도 위) — 그 뒤 더 새 게임이 오면 이 줄만 고친다
        keys = list(game.GAMES)
        self.assertEqual(keys[0], "slingfort")
        self.assertLess(keys.index("slingfort"), keys.index("ferry"))
        g = game.GAMES["slingfort"]
        self.assertEqual(g.title, "곰돌이 새총 원정대")
        self.assertEqual(g.category, "MINI")
        self.assertEqual(g.max_score, 100_000)
        self.assertEqual(g.unit, "점")
        self.assertEqual(g.icon, "castle")
        self.assertEqual(g.added, "2026-11-20")
        src = (ROOT / "backend/app/services/game.py").read_text(encoding="utf-8")
        self.assertLess(src.index('Game("slingfort"'), src.index('# Game("deskpop"'))

    def test_frame_page_wide(self):
        self.assertIn('HKEmbed.mount({ key: "slingfort"', FRAME)
        self.assertIn('src: "/games/embed/slingfort.html?hk=1"', FRAME)
        self.assertIn("wide: true", FRAME)
        self.assertIn(f"<title>{game.GAMES['slingfort'].title} — 아케이드</title>", FRAME)

    def test_body_signals_and_score_max(self):
        m = re.search(r"const SCORE_MAX=(\d+);", BODY)
        self.assertIsNotNone(m)
        self.assertEqual(int(m.group(1)), game.GAMES["slingfort"].max_score)
        for sig in ("hk:ready", "hk:start", "hk:live", "hk:score", "hk:esc", "hk:paused", "hk:resumed", "hk:pause", "hk:resume", "hk:restart"):
            self.assertIn(sig, BODY, sig)
        self.assertRegex(BODY, r"const GAME=\{name:'" + re.escape(game.GAMES["slingfort"].title) + "'")
        # 점수는 0 ~ 상한으로 잘라 보낸다
        self.assertIn("hk({type:'hk:score',score:clamp(Math.round(SAVE.score()),0,SCORE_MAX)})", BODY)

    def test_body_no_external_assets_and_size(self):
        self.assertIsNone(re.search(r"<(script|img|audio|link)[^>]+(src|href)=[\"']https?://", BODY))
        self.assertNotRegex(BODY, r"https?://[^\"'\s]*\.(webp|png|jpe?g|mp3|ogg|wav)")
        self.assertNotRegex(BODY, r"new Audio\(|\.mp3|\.ogg")  # 소리는 WebAudio 로 그 자리에서 만든다
        self.assertIn('<script src="/_shared/mgmt.js"></script>', BODY)
        self.assertLessEqual(BODY_PATH.stat().st_size, 1_000_000)  # three r128 + cannon-es 를 안에 넣어서 크다

    def test_tint_genre_doc(self):
        self.assertIn('slingfort: ["#e8762c", "#7a4520"],', PLAY_JS)
        self.assertIn('slingfort: "액션",', ARCADE)
        self.assertIn("| 곰돌이 새총 원정대 | `slingfort` | Sling Raiders — https://higgsfield.ai/ko/playable?preset=1b4973cd-b1a7-4b40-9cd4-c278277b807d", DOC)

    def test_art_assets_exist_and_small(self):
        self.assertIn("'/assets/games/slingfort/'+n+'.webp'", BODY)
        m = re.search(r"const ART_FILES=\[([^\]]+)\]", BODY)
        self.assertIsNotNone(m)
        names = re.findall(r"'([a-z_]+)'", m.group(1))
        self.assertEqual(len(names), 19)
        for n in names:
            p = ART / f"{n}.webp"
            self.assertTrue(p.is_file(), n)
            self.assertLessEqual(p.stat().st_size, 300_000, n)
        self.assertLessEqual(sum(p.stat().st_size for p in ART.iterdir()), 1_200_000)
        # 본체가 이름으로 부르는 그림(aimg · artWhen · setBackdrop)은 모두 목록 안에 있다
        used = set(re.findall(r"(?:aimg|artWhen|artLoad)\('([a-z_]*[a-z])'[,)]", BODY)) | set(re.findall(r"'(bg_[a-z]+)'", BODY))
        used |= {"tex_" + k for k in ("wood", "stone", "ice")}
        self.assertTrue(used <= set(names), used - set(names))

    def test_thumbnail(self):
        self.assertEqual(jpeg_size(THUMB), (900, 450))
        self.assertLessEqual(THUMB.stat().st_size, 100_000)

    def test_mgmt_entry(self):
        g = mgmt.MGMT_GAMES["slingfort"]
        self.assertEqual(g.title, "곰돌이 새총 원정대 진행")
        self.assertFalse(g.listed)
        self.assertIs(mgmt.STATE_CHECKS["slingfort"], mgmt.check_slingfort_state)
        # 화면 저장 칸 = 서버가 받는 칸
        m = re.search(r"function cleanSave\(r\)\{const o=\{([^}]*)\}", BODY)
        self.assertIsNotNone(m)
        js_keys = set(re.findall(r"([a-z]+):", m.group(1)))
        self.assertTrue(js_keys <= mgmt.SLINGFORT_KEYS, js_keys - mgmt.SLINGFORT_KEYS)
        self.assertIn("LV_SCORE_MAX=20000", BODY)
        self.assertEqual(mgmt.SLINGFORT_MAX_LEVEL_SCORE, 20_000)
        # 강화 칸 수 = 화면 UPG 값 칸 수
        for k, n in mgmt.SLINGFORT_UP_MAX.items():
            mm = re.search(k + r":\{name:'[^']+',art:'[^']+',emo:'[^']+',val:\[[^\]]+\],cost:\[([^\]]+)\]", BODY)
            self.assertIsNotNone(mm, k)
            self.assertEqual(len(mm.group(1).split(",")), n, k)

    def test_check_state_good(self):
        check = mgmt.check_slingfort_state
        self.assertTrue(check({}))
        self.assertTrue(check(good_state()))
        full = good_state()
        full.update(unlocked=10, last=10, cleared={str(i): True for i in range(1, 11)}, stars={str(i): 3 for i in range(1, 11)},
                    best={str(i): 20_000 for i in range(1, 11)}, up={"bomb": 3, "shield": 3, "giant": 3, "horn": 2}, gold=9_999_999)
        self.assertTrue(check(full))

    def test_check_state_bad(self):
        check = mgmt.check_slingfort_state
        bad = []
        for k, v in (
            ("gold", -1), ("gold", 10_000_000), ("gold", 1.5), ("gold", True), ("unlocked", 0), ("unlocked", 11), ("last", 5),
            ("stars", {"1": 4}), ("stars", {"4": 1}), ("stars", {"1": 0}), ("best", {"1": 20_001}), ("best", {"11": 1}),
            ("cleared", {"1": 1}), ("cleared", {"5": True}), ("up", {"bomb": 4}), ("up", {"horn": 3}), ("up", {"fly": 1}),
            ("music", 1), ("sfx", "on"), ("v", 2), ("summary", {"line": "x"}), ("hack", 1),
        ):
            s = good_state()
            s[k] = v
            bad.append((k, v, s))
        for k, v, s in bad:
            self.assertFalse(check(s), (k, v))
        self.assertFalse(check([]))
        self.assertFalse(check("x"))


if __name__ == "__main__":
    unittest.main()
