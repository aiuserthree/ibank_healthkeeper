"""먹보 구멍 3D 구역 5개(공원 → 주택가 → 도심 → 항구 → 공항) — 본체(web/games/embed/holecity.html) · 서버 설명 정적 검사.

- game.py 의 holecity 설명에 구역 이름 다섯이 이 순서로 있다
- 본체 AREAS 의 key 가 park · suburbs · downtown · harbor · airport 순서로 5개
- 1~3구역(공원 · 주택가 · 도심) AREAS 항목 글자가 구역을 더하기 전과 같다(기대값을 상수로 박음 — 깃 기록에 기대지 않음)
- 「구역 3개」가 박힌 자리가 남아 있지 않다: 디버그 area 상한 Math.min(2, · 결과 글 '공원부터 도심까지 · HUD 점 <i> 3개 하드코딩
"""

import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
BODY = (ROOT / "web/games/embed/holecity.html").read_text(encoding="utf-8")
GAME_PY = (ROOT / "backend/app/services/game.py").read_text(encoding="utf-8")

AREA_NAMES = ["공원", "주택가", "도심", "항구", "공항"]
AREA_KEYS = ["park", "suburbs", "downtown", "harbor", "airport"]

# 1~3구역 AREAS 항목(구역을 더하기 전 글자 그대로)
OLD_AREAS = [
    "  { key: 'park', name: '공원', H: 50, time: 90, goal: 0.45, gen: genPark, ground: C.grass, sky: 0xbfe8f7, sun: 0xfff3d9, hemi: 0x8aa67c, sunI: 0.67,\n"
    "    rivals: [0.5, 0.72, 1.05], rivalSpeed: 4.7, aggro: 0.8 },",
    "  { key: 'suburbs', name: '주택가', H: 57, time: 85, goal: 0.6, gen: genSuburb, ground: C.walk, sky: 0xffe3bd, sun: 0xffe2b0, hemi: 0x9a8f86, sunI: 0.69,\n"
    "    rivals: [0.5, 0.75, 1.1, 1.5], rivalSpeed: 5.2, aggro: 1.0 },",
    "  { key: 'downtown', name: '도심', H: 60, time: 95, goal: 0.7, gen: genDowntown, ground: C.walk, sky: 0xd9c9f6, sun: 0xffd9c2, hemi: 0x8a86a6, sunI: 0.67,\n"
    "    rivals: [0.55, 0.8, 1.15, 1.6, 2.1], rivalSpeed: 5.6, aggro: 1.2 },",
]


def areas_block():
    m = re.search(r"var AREAS = SC\.AREAS = \[\n(.*?)\n\];", BODY, re.S)
    assert m, "AREAS 목록을 못 찾음"
    return m.group(1)


class HolecityAreasTest(unittest.TestCase):
    def test_game_py_description_lists_five_areas_in_order(self):
        line = next(l for l in GAME_PY.splitlines() if 'Game("holecity"' in l)
        pos = [line.find(n) for n in AREA_NAMES]
        self.assertTrue(all(p >= 0 for p in pos), pos)
        self.assertEqual(pos, sorted(pos))
        self.assertIn("공원 → 주택가 → 도심 → 항구 → 공항", line)

    def test_area_keys_in_order(self):
        keys = re.findall(r"\{ key: '([a-z]+)'", areas_block())
        self.assertEqual(keys, AREA_KEYS)

    def test_first_three_areas_unchanged(self):
        block = areas_block()
        for item in OLD_AREAS:
            self.assertEqual(block.count(item), 1, item[:40])
        self.assertTrue(block.startswith("".join(x + "\n" for x in OLD_AREAS)))

    def test_no_hardcoded_three_areas(self):
        self.assertNotIn("Math.min(2,", BODY)
        self.assertNotIn("'공원부터 도심까지", BODY)
        m = re.search(r'<span class="pips" id="pips">(.*?)</span>', BODY)
        self.assertIsNotNone(m)
        self.assertNotEqual(m.group(1).count("<i>"), 3)


if __name__ == "__main__":
    unittest.main()
