"""뿅뿅 달나라 대포 새 맵 「달빛 협곡 마을」(valley · 맵 번호 6) — 엔진 · 화면 · 대전 틀 · 서버 결과 검사가 같은 맵 수를 쓰는지 정적 검사 (DB 없이).

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_moonshot_valley.py -v
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import unittest

os.environ.setdefault("DEBUG", "false")

from fastapi import HTTPException as AppError  # noqa: E402
from app.services import party  # noqa: E402
from app.services import versus_moonshotvs as mv  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
BODY = (ROOT / "web/games/embed/moonshot.html").read_text(encoding="utf-8")
FRAME = (ROOT / "web/games/moonshotvs.html").read_text(encoding="utf-8")
ART = ROOT / "web/assets/games/moonshot"
ENG = re.search(r'<script id="moonshot-sim">(.*?)</script>', BODY, re.S).group(1)
PASS = json.dumps({"m": [], "pass": 1}, separators=(",", ":"))
SHOT = json.dumps({"m": [[1, 4]], "a": 450, "p": 620, "w": "mochi", "f": 1}, separators=(",", ":"))


def map_keys() -> list[str]:
    return re.findall(r"'(\w+)'", re.search(r"var MAP_KEYS = \[(.*?)\];", ENG).group(1))


class ValleyMapTest(unittest.TestCase):
    def test_engine_has_valley_last(self):
        # 새 맵은 맨 뒤(맵 번호 6) — 앞 다섯 맵 번호는 그대로
        self.assertEqual(map_keys(), ["calm", "canyon", "ice", "mushroom", "ring", "valley"])
        self.assertIn("valley:   { name: '달빛 협곡 마을', gravity: 1000, windMul: 1000, seaY: 1000, gen: 'valley'", ENG)
        self.assertIn("valley: genValley", ENG)
        self.assertIn("function genValley(st, rng)", ENG)

    def test_server_map_count(self):
        self.assertEqual(mv.MAP_COUNT, len(map_keys()))
        self.assertEqual(party.MOON_MAPS, len(map_keys()))
        self.assertEqual(party._track("moonshotvs", 6), 6)
        self.assertEqual(party._track("moonshotvs", 7), 6)

    def test_versus_result_map6(self):
        d = {"winner": "host", "how": "sea", "hash": "5d6c077e", "turns": 12, "sec": 312.4, "map": 6, "ver": "m1-2d61d04b",
             "log": [SHOT if i % 2 else PASS for i in range(13)]}
        self.assertEqual(mv._check(d)["rep"]["map"], 6)
        with self.assertRaises(AppError):
            mv._check({**d, "map": 7})

    def test_team_result_map6(self):
        d = {"winner": 1, "how": "sea", "hash": "0badc0de", "turns": 20, "sec": 300.0, "map": 6, "ver": "m1-2d61d04b",
             "log": [SHOT if i % 2 else PASS for i in range(20)]}
        got = party._clean_moon(d, 4, party._now_ms() - 60_000)
        self.assertEqual(got["map"], 6)
        with self.assertRaises(AppError):
            party._clean_moon({**d, "map": 7}, 4, party._now_ms() - 60_000)

    def test_frame_lists_valley(self):
        self.assertIn('["valley", "달빛 협곡 마을", "계곡에 떨어뜨리기"]]', FRAME)
        self.assertIn("Math.min(MAPS.length, Number(n) || 1)", FRAME)

    def test_body_ui_and_art(self):
        self.assertIn("valley: 'bg-valley'", BODY)
        self.assertIn("valley: ['계곡에 떨어뜨리기',", BODY)
        self.assertIn("여섯 맵 가운데 하나를 골라 줘요", BODY)
        self.assertIn("grid-template-columns:repeat(7,1fr)", BODY)
        man = json.loads((ART / "manifest.json").read_text(encoding="utf-8"))
        f = man["files"]["bg-valley"]
        self.assertEqual((f["file"], f["load"]), ("bg-valley.webp", "map"))
        self.assertTrue((ART / "bg-valley.webp").is_file())
        self.assertLess((ART / "bg-valley.webp").stat().st_size, 140_000)


if __name__ == "__main__":
    unittest.main()
