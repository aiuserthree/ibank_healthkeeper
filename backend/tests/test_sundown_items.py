"""선다운 범퍼스 아이템 — 본체(web/games/embed/sundown.html) · 대전 바깥(web/games/bumpervs.html) 정적 검사.

대전에서 칸 · 물체를 한 글자로 주고받으므로, 글자 표가 어긋나면 예전 화면과 새 화면이 서로 다른 아이템을 보게 된다.
- ITEM_KEYS 앞 13개는 예전 순서 그대로(옛 화면 손님에게는 이 13개만 준다 — ITEM_OLD_N)
- ITEM_CODE 길이 = 키 수, 글자 겹침 없음, '-'(빈 칸 표시) 없음
- 키마다 ITEM · ITEM_TIP 항목
- 물체 코드(OB_CODE)는 한 글자 · 겹침 없음, 예전 5개 글자(p c w f m)는 그대로
- 바깥 입력 중계 4곳이 판본 v 를 통과시킴
- 뽑기 표(ROLL_TAB): 설계 20종 · 열 6개(G1~G4 · A · B) 모두 합 100, 게임에 있는 키는 모두 표에 있음, 1등(G1 · A)에게 앞 공격 · 저격 · 훔치기 0
- 아이템 그림 묶음(item-icons-v1.webp)이 있고, 설계 20종 모두 칸 자리(ICON_CELL)가 있으며 서로 겹치지 않음
- 옛 이름(자석 · 무지개 별 · 물풍선 · 번개 구름 · 유령 망토)이 ITEM 에 남아 있지 않음(2단계 — 오리지널 이름)
- 3단계 새 아이템(순풍 n · 스프링 k)이 13키 뒤에 붙고, 스프링만 도는 중에도 쓸 수 있음(itemBlock 첫 줄)
"""

import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
BODY = (ROOT / "web/games/embed/sundown.html").read_text(encoding="utf-8")
OUTER = (ROOT / "web/games/bumpervs.html").read_text(encoding="utf-8")

OLD_KEYS = ["rocket", "shield", "blast", "popcorn", "candy", "wind", "magnet", "star", "balloon", "thunder", "firework", "ghost", "meteor"]
OLD_CODE = "rsbpcwmtlzfgo"


def _block(name: str) -> str:
    """`const NAME={ ... };` 의 중괄호 안(한 단계 중첩까지)."""
    m = re.search(r"const " + name + r"=\{", BODY)
    assert m, name
    i, depth = m.end() - 1, 0
    for j in range(i, len(BODY)):
        ch = BODY[j]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return BODY[i + 1 : j]
    raise AssertionError(name)


def _keys(block: str) -> set:
    return set(re.findall(r"(?:^|[,{\s])([a-z]+):", block))


class SundownItems(unittest.TestCase):
    def setUp(self):
        m = re.search(r"const ITEM_KEYS=\[([^\]]*)\];", BODY)
        self.keys = re.findall(r"'([a-z]+)'", m.group(1))
        self.code = re.search(r"const ITEM_CODE='([^']*)';", BODY).group(1)

    def test_old_order_kept(self):
        self.assertEqual(self.keys[:13], OLD_KEYS)
        self.assertEqual(self.code[:13], OLD_CODE)
        self.assertEqual(int(re.search(r"ITEM_OLD_N=(\d+)", BODY).group(1)), 13)

    def test_codes(self):
        self.assertEqual(len(self.code), len(self.keys))
        self.assertEqual(len(set(self.code)), len(self.code))
        self.assertNotIn("-", self.code)
        self.assertEqual(len(set(self.keys)), len(self.keys))

    def test_every_key_has_item_and_tip(self):
        item = _keys(_block("ITEM"))
        tip = _keys(_block("ITEM_TIP"))
        for k in self.keys:
            self.assertIn(k, item, k)
            self.assertIn(k, tip, k)

    def test_object_codes(self):
        pairs = dict(re.findall(r"([a-z]+):'(.)'", _block("OB_CODE")))
        self.assertTrue(pairs)
        self.assertEqual(len(set(pairs.values())), len(pairs))
        for k, ch in {"popcorn": "p", "candy": "c", "wind": "w", "firework": "f", "meteor": "m"}.items():
            self.assertEqual(pairs.get(k), ch, k)

    def test_snapshot_and_input_version(self):
        self.assertRegex(BODY, r"const VS_IV=2")
        self.assertIn("iv:VS_IV", BODY)  # host 스냅숏
        self.assertIn("v:VS_IV", BODY)  # 손님 입력

    def test_outer_relays_version(self):
        relays = [ln for ln in OUTER.splitlines() if '"vs:in"' in ln and ("send({ t: \"in\"" in ln or "u: m.u" in ln)]
        self.assertEqual(len(relays), 4, relays)
        for ln in relays:
            self.assertIn("Number.isInteger(m.v) ? { v: m.v } : {}", ln)

    def test_roll_table(self):
        rows = dict(
            (k, [int(x) for x in v.split(",")])
            for k, v in re.findall(r"([a-z]+):\[([\d,]+)\]", _block("ROLL_TAB"))
        )
        planned = OLD_KEYS + ["pinwheel", "spring", "ribbon", "mask", "swirl", "jack", "confetti"]
        self.assertEqual(sorted(rows), sorted(planned))
        for r in rows.values():
            self.assertEqual(len(r), 6)
        for col in range(6):
            self.assertEqual(sum(r[col] for r in rows.values()), 100, col)
        for k in self.keys:
            self.assertIn(k, rows, k)
        for k in ["popcorn", "balloon", "meteor", "firework", "ribbon", "wind", "mask", "thunder", "swirl", "ghost", "magnet"]:
            self.assertEqual(rows[k][0], 0, k)  # G1
            self.assertEqual(rows[k][4], 0, k)  # A
        self.assertIn("if(ctx.old&&i>=ITEM_OLD_N)continue;", BODY)  # 보정 8 — 옛 화면 차는 앞 13키만

    def test_icon_atlas(self):
        self.assertTrue((ROOT / "web/assets/games/sundown/item-icons-v1.webp").is_file())
        self.assertIn("/assets/games/sundown/item-icons-v1.webp", BODY)
        cells = dict((k, (int(x), int(y))) for k, x, y in re.findall(r"([a-z]+):\[(\d+),(\d+)\]", _block("ICON_CELL")))
        planned = OLD_KEYS + ["pinwheel", "spring", "ribbon", "mask", "swirl", "jack", "confetti"]
        self.assertEqual(sorted(cells), sorted(planned))
        self.assertEqual(len(set(cells.values())), len(cells))
        for x, y in cells.values():
            self.assertTrue(x + 200 <= 1024 and y + 200 <= 1024)

    def test_original_names(self):
        item = _block("ITEM")
        for old in ["'자석'", "'무지개 별'", "'물풍선'", "'번개 구름'", "'유령 망토'"]:
            self.assertNotIn(old, item, old)

    def test_stage3_pinwheel_spring(self):
        # 3단계 — 순풍(n) · 스프링(k)은 옛 13키 뒤에 붙고, 스프링만 도는 중 · 묶임 · 공중에도 쓸 수 있다
        self.assertEqual(self.keys[13:15], ["pinwheel", "spring"])
        self.assertEqual(self.code[13:15], "nk")
        m = re.search(r"function itemBlock\(c,k\)\{\n([^\n]*)", BODY)
        self.assertIsNotNone(m)
        self.assertIn("if(k==='spring')return '';", m.group(1))

    def test_stage4_jack_confetti(self):
        # 4단계 — 광대 북(j) · 색종이 분수(e)는 15키 뒤에 붙고, 물체 코드도 같은 글자, 함정 셋 공통 규칙(3개 · 무장 · 장애물 둘레), 색종이 덮개 캔버스는 HUD 맨 앞
        self.assertEqual(self.keys[15:17], ["jack", "confetti"])
        self.assertEqual(self.code[15:17], "je")
        pairs = dict(re.findall(r"([a-z]+):'(.)'", _block("OB_CODE")))
        self.assertEqual(pairs.get("jack"), "j")
        self.assertEqual(pairs.get("confetti"), "e")
        self.assertRegex(BODY, r"OBJ_TRAP=\{candy:1,jack:1,confetti:1\}")
        self.assertRegex(BODY, r"const TRAP_MAX=3,TRAP_ARM=\.5,TRAP_OWN=1,TRAP_HZ=12,TRAP_PAD=4")
        self.assertIn('<section id="hud" hidden>\n    <canvas class="blind-fx" id="blindFx"', BODY)


if __name__ == "__main__":
    unittest.main()
