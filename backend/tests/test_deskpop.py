"""문구 팡팡(deskpop) — 진행 저장(매니지먼트 저장 'deskpop', 목록에 안 보임) 값 검사 · 본체와 같은 과제 별 표 (DB 없이).

- check_deskpop_state: 좋은 값 · 빈 값 · 범위 밖 · 타입 틀림(bool · 실수 · 문자열) · 모르는 칸 · 별 초과 · 앞 구역 미완 · 상자 초과
- 자동 놀이로 30단계를 깨고 별을 과제에 쓴 뒤 화면이 서버로 보내는 값(Sync.pick())이 검사를 통과한다
- 서버의 과제 별 표 = 본체(web/games/embed/deskpop.html)의 TASK_STARS, 구역별 별 합 = 그 구역 단계 수, 합 = 단계 묶음 수(300)
- 아케이드 등록(game.py · 단위 · 상한 = 본체 SCORE_MAX · 들어온 날) · 틀 화면 · 아케이드 신호 문자열 · 바깥 주소 없음 · 힉스필드 그림 지도(이름 · 파일) · 기존 「비타민 3매치」 그대로

돌리기 (backend/.env 를 읽지 않게 다른 폴더에서):
  cd /tmp && PYTHONPATH=<저장소>/backend python -m unittest <저장소>/backend/tests/test_deskpop.py -v
"""

from __future__ import annotations

import copy
import json
import os
import pathlib
import re
import unittest

os.environ.setdefault("DEBUG", "false")

from app.services import mgmt  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
BODY = (ROOT / "web/games/embed/deskpop.html").read_text(encoding="utf-8")
LEVELS_JS = (ROOT / "web/games/embed/deskpop-levels.js").read_text(encoding="utf-8")

check = mgmt.check_deskpop_state
BOOST = {"line": 3, "stamp": 3, "globe": 3, "hammer": 3, "rowRuler": 2, "colTape": 2, "fan": 2}
OK = {
    "level": 91, "stars": 13, "starsTotal": 90, "tasks": [5, 5, 5, 5, 2, 0, 0, 0, 0, 0],
    "styles": [[0] * 5 for _ in range(10)], "chest": 4, "coins": 5200, "boost": dict(BOOST),
    "streak": 7, "bestRun": 24100, "seen": ["give-pre", "give-in", "tut-ob:cabinet"],
}
# 자동 놀이(?dbg=1&bot=1)로 30단계를 깬 뒤 꾸미기에서 별을 다 쓰고(구역 1 · 2 다 꾸밈, 상자 2개) 화면이 서버로 보낸 값 그대로
# (.claude/work/deskpop/tmp/s3bshot.py bot 으로 뽑음 — 2026-11-19)
BOT30 = json.loads(
    '{"level": 31, "stars": 0, "starsTotal": 30, "tasks": [5, 5, 0, 0, 0, 0, 0, 0, 0, 0], "styles": [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], '
    '[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], '
    '"chest": 2, "coins": 4857, "boost": {"line": 5, "stamp": 5, "globe": 5, "hammer": 5, "rowRuler": 4, "colTape": 4, "fan": 4}, '
    '"streak": 30, "bestRun": 0, "seen": ["tut-swap", "tut-line", "tut-plane", "tut-stain", "tut-stamp", "tut-globe", "give-pre", '
    '"tut-combo", "tut-ob:cabinet", "give-in", "tut-streak", "tut-ob:fax", "tut-ob:paper"]}'
)


def with_(**kw):
    s = copy.deepcopy(OK)
    s.update(kw)
    return s


class DeskpopSaveTest(unittest.TestCase):
    def test_registered_hidden(self):
        g = mgmt.MGMT_GAMES["deskpop"]
        self.assertIs(g.listed, False)  # 매니지먼트 목록에 안 보인다
        self.assertIs(mgmt.STATE_CHECKS["deskpop"], check)
        self.assertIs(mgmt.STATE_CHECKS["hoops"], mgmt.check_hoops_state)  # 기존 그대로
        keys = list(mgmt.MGMT_GAMES)
        self.assertEqual(keys.index("deskpop") + 1, keys.index("hoops"))  # 최신이 위

    def test_good_states(self):
        self.assertTrue(check(OK))
        self.assertTrue(check({}))  # 처음 — 서버에 아무것도 없을 때 화면이 보내는 빈 상태
        self.assertTrue(check({"level": 1, "stars": 0, "starsTotal": 0, "tasks": [0] * 10, "chest": 0, "coins": 200}))
        # 다 꾸밈 · 상자 10개 · 301단계 뒤
        full = with_(level=320, starsTotal=319, stars=19, tasks=[5] * 10, chest=10)
        self.assertTrue(check(full))
        # 상자를 아직 안 열었어도 된다(상자 ≤ 다 꾸민 구역 수)
        self.assertTrue(check(with_(chest=3)))

    def test_bot_30_levels_state_passes(self):
        self.assertTrue(check(BOT30))
        # 꾸미기 전(별을 안 씀)
        self.assertTrue(check({**BOT30, "stars": 30, "tasks": [0] * 10, "chest": 0}))
        # 별을 쓰기 전 구역 1 만 다 함
        self.assertTrue(check({**BOT30, "stars": 20, "tasks": [5] + [0] * 9, "chest": 1}))

    def test_ranges(self):
        for k, bad in (("level", 0), ("level", 100_001), ("stars", -1), ("starsTotal", 100_001), ("coins", -1),
                       ("coins", 10_000_000), ("chest", 11), ("chest", -1), ("streak", -1), ("streak", 100_001),
                       ("bestRun", 1_000_001), ("bestRun", -5)):
            self.assertFalse(check(with_(**{k: bad})), (k, bad))
        self.assertTrue(check(with_(coins=9_999_999, bestRun=1_000_000, streak=100_000)))
        self.assertFalse(check(with_(boost={**BOOST, "hammer": 1000})))
        self.assertFalse(check(with_(boost={**BOOST, "fan": -1})))
        self.assertTrue(check(with_(boost={**BOOST, "hammer": 999})))

    def test_wrong_types(self):
        for k in ("level", "stars", "starsTotal", "chest", "coins", "streak", "bestRun"):
            for bad in (True, False, 1.5, "3", None, [1]):
                self.assertFalse(check(with_(**{k: bad})), (k, bad))
        self.assertFalse(check(with_(tasks=[True, 5, 5, 5, 2, 0, 0, 0, 0, 0])))
        self.assertFalse(check(with_(tasks=[5.0, 5, 5, 5, 2, 0, 0, 0, 0, 0])))
        self.assertFalse(check(with_(tasks="5,5,5,5,2")))
        self.assertFalse(check(with_(boost={**BOOST, "line": True})))
        self.assertFalse(check(with_(boost=[3, 3])))
        self.assertFalse(check(with_(seen="give-pre")))
        self.assertFalse(check(with_(seen=["give-pre", 3])))
        self.assertFalse(check(with_(styles=[[0] * 5 for _ in range(10)][:9])))
        self.assertFalse(check(with_(styles=[[0, 0, 0, 0, 3]] + [[0] * 5 for _ in range(9)])))  # 모양 0~2
        self.assertFalse(check(with_(styles=[[0, 0, 0, 0, False]] + [[0] * 5 for _ in range(9)])))
        self.assertFalse(check([1, 2]))
        self.assertFalse(check(None))

    def test_lengths(self):
        self.assertFalse(check(with_(tasks=[5, 5, 5, 5, 2, 0, 0, 0, 0])))  # 9칸
        self.assertFalse(check(with_(tasks=[5, 5, 5, 5, 2, 0, 0, 0, 0, 0, 0])))
        self.assertFalse(check(with_(tasks=[5, 5, 5, 5, 6, 0, 0, 0, 0, 0])))  # 과제 0~5
        self.assertFalse(check(with_(seen=["x" * 33])))
        self.assertFalse(check(with_(seen=[""])))
        self.assertFalse(check(with_(seen=[f"s{i}" for i in range(65)])))
        self.assertTrue(check(with_(seen=[f"s{i}" for i in range(64)])))

    def test_unknown_keys(self):
        self.assertFalse(check(with_(muted=True)))  # 소리 끄기는 이 기기에만 — 서버로 보내지 않는다
        self.assertFalse(check(with_(srvMerged=True)))
        self.assertFalse(check(with_(summary={"line": "x"})))
        self.assertFalse(check(with_(boost={**BOOST, "rocket": 1})))

    def test_star_rules(self):
        self.assertFalse(check(with_(stars=91, starsTotal=90)))  # 남은 별 > 별 전체
        self.assertFalse(check(with_(starsTotal=91)))  # 별 전체 > 깬 단계 수(level - 1)
        self.assertFalse(check(with_(stars=14)))  # 쓴 별 77 + 남은 별 14 > 90
        self.assertTrue(check(with_(stars=13)))  # 77 + 13 = 90
        self.assertFalse(check(with_(level=1, starsTotal=1, stars=1, tasks=[0] * 10, chest=0)))
        self.assertFalse(check(with_(tasks=[5, 5, 5, 5, 5, 0, 0, 0, 0, 0], stars=6)))  # 쓴 별 90 + 6 > 90
        self.assertTrue(check(with_(tasks=[5, 5, 5, 5, 5, 0, 0, 0, 0, 0], stars=0)))  # 쓴 별 90 + 0 = 90

    def test_previous_area_must_be_done(self):
        self.assertFalse(check(with_(tasks=[5, 5, 5, 4, 1, 0, 0, 0, 0, 0], stars=0)))  # 4구역을 다 안 했는데 5구역
        self.assertFalse(check(with_(level=31, starsTotal=30, stars=0, tasks=[3, 1] + [0] * 8, chest=0)))
        self.assertFalse(check(with_(level=301, starsTotal=300, stars=0, tasks=[5] * 8 + [0, 1], chest=8)))

    def test_chest_not_more_than_done_areas(self):
        self.assertFalse(check(with_(chest=5)))  # 다 꾸민 구역 4개
        self.assertTrue(check(with_(chest=0)))


class DeskpopTablesTest(unittest.TestCase):
    def body_table(self):
        m = re.search(r"var TASK_STARS = (\[\[.*?\]\]);", BODY)
        self.assertIsNotNone(m, "본체 TASK_STARS 를 못 찾음")
        return [tuple(r) for r in json.loads(m.group(1))]

    def test_server_table_equals_body(self):
        self.assertEqual(self.body_table(), [tuple(r) for r in mgmt.DESKPOP_TASK_STARS])

    def test_area_sums_equal_level_counts(self):
        self.assertEqual(len(mgmt.DESKPOP_TASK_STARS), 10)
        self.assertTrue(all(len(r) == 5 for r in mgmt.DESKPOP_TASK_STARS))
        self.assertEqual([sum(r) for r in mgmt.DESKPOP_TASK_STARS], list(mgmt.DESKPOP_AREA_LEVELS))
        self.assertEqual(list(mgmt.DESKPOP_AREA_LEVELS), [10, 20, 20, 20, 20, 30, 30, 40, 50, 60])
        count = int(re.search(r"var COUNT = (\d+);", LEVELS_JS).group(1))
        self.assertEqual(sum(mgmt.DESKPOP_AREA_LEVELS), count)  # 300단계 = 별 300개로 10구역을 다 꾸민다

    def test_body_text_has_ten_areas_five_tasks(self):
        block = re.search(r"areas: \[\n(.*?)\n    \]", BODY, re.S).group(1)
        rows = re.findall(r"\{ name: '([^']+)', tasks: \[([^\]]*)\] \}", block)
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows[0][0], "빈 사무실")
        self.assertEqual(rows[9][0], "대표실")
        self.assertTrue(all(len(re.findall(r"'[^']+'", t)) == 5 for _, t in rows))

    def test_body_limits_match_server(self):
        self.assertIn("COIN_MAX = 9999999", BODY)
        self.assertIn("SCORE_MAX = 1000000", BODY)
        self.assertEqual(mgmt.DESKPOP_MAX_COINS, 9_999_999)
        self.assertEqual(mgmt.DESKPOP_MAX_RUN, 1_000_000)
        self.assertIn("HKMgmt.open('deskpop'", BODY)
        self.assertIn('<script src="/_shared/mgmt.js"></script>', BODY)



ENGINE_JS = (ROOT / "web/games/embed/deskpop-engine.js").read_text(encoding="utf-8")
ART_JS = (ROOT / "web/assets/games/deskpop/deskpop-art.js").read_text(encoding="utf-8")


class DeskpopArcadeTest(unittest.TestCase):
    """아케이드에 붙인 것 — 자리(GAMES 맨 위)는 합칠 때 다른 새 게임이 위에 올 수 있어 보지 않는다"""

    def test_registered_in_games(self):
        from app.services import game as game_svc

        g = game_svc.GAMES.get("deskpop")
        self.assertIsNotNone(g)
        self.assertEqual(g.title, "문구 팡팡")
        self.assertEqual(g.unit, "점")
        self.assertEqual(g.max_score, 1_000_000)
        self.assertRegex(g.added, r"^\d{4}-\d{2}-\d{2}$")

    def test_score_max_equals_server(self):
        from app.services import game as game_svc

        m = re.search(r"SCORE_MAX = (\d+)", BODY)
        self.assertIsNotNone(m)
        self.assertEqual(int(m.group(1)), game_svc.GAMES["deskpop"].max_score)

    def test_arcade_signals(self):
        for sig in ("hk:start", "hk:score", "hk:live", "hk:ready", "hk:paused", "hk:resumed", "hk:esc"):
            self.assertIn("'" + sig + "'", BODY, sig)
        # 받는 쪽 주소는 자기 origin(본보기 게임과 같은 방식)
        self.assertIn("window.parent.postMessage(msg, HK)", BODY)
        self.assertIn("HK = location.origin", BODY)

    def test_no_outside_urls(self):
        for name, txt in (("body", BODY), ("engine", ENGINE_JS), ("levels", LEVELS_JS), ("art", ART_JS)):
            self.assertIsNone(re.search(r"https?://", txt), name)

    def test_text_in_one_place(self):
        self.assertIn("const TEXT = {", BODY)

    def test_run_starts_when_level_starts(self):
        # 처음 화면에서 시작 카드를 여는 것만으로는 판이 아니다 — 판 시작(hk:start)은 시작 카드의 「N단계 시작」
        self.assertIn("$('bStart').onclick = function () { audioOn(); showStart(n); };", BODY)
        self.assertIn("audioOn(); runStart(); startLevel(n,", BODY)
        self.assertEqual(BODY.count("runStart();"), 1)

    def test_local_only_fields_not_sent(self):
        # 이 기기에만 두는 칸은 서버로 안 보낸다(서버 검사가 모르는 칸을 거절)
        m = re.search(r"var LOCAL_K = \[([^\]]*)\]", BODY)
        self.assertIsNotNone(m)
        local = set(re.findall(r"'(\w+)'", m.group(1)))
        self.assertEqual(local, {"muted", "playing", "tryLv", "tryK", "lostLv"})
        self.assertFalse(local & mgmt.DESKPOP_KEYS)
        self.assertIn("LOCAL_K.forEach(function (k) { delete c[k]; }); delete c.srvMerged;", BODY)
        for k in local:  # 혹시 보내면 서버가 거절한다 — 그래서 보내지 않는다
            self.assertFalse(check(with_(**{k: 1})), k)

    def test_boost_cap(self):
        self.assertIn("BOOST_MAX = 999", BODY)
        self.assertIn("full = Save.d.boost[k] >= BOOST_MAX", BODY)

    def test_frame_page(self):
        frame = (ROOT / "web/games/deskpop.html").read_text(encoding="utf-8")
        self.assertIn('key: "deskpop"', frame)
        self.assertIn('src: "/games/embed/deskpop.html?hk=1"', frame)
        self.assertIn("<title>문구 팡팡 — 아케이드</title>", frame)
        self.assertTrue((ROOT / "web/assets/lounge/deskpop.jpg").is_file())

    def test_match3_untouched(self):
        m3 = ROOT / "web/games/match3.html"
        self.assertEqual(m3.stat().st_size, 86_729)
        self.assertIn("<title>비타민 3매치 — 아케이드</title>", m3.read_text(encoding="utf-8"))


class DeskpopArtTest(unittest.TestCase):
    """힉스필드 그림 지도(deskpop-art.js) — 코드가 찾는 이름이 다 있고 가리키는 파일이 있다"""

    @classmethod
    def setUpClass(cls):
        m = re.search(r"window\.DeskArt = (\{.*\});", ART_JS, re.S)
        cls.art = json.loads(m.group(1))

    def test_names(self):
        pm, um = self.art["pieces"]["map"], self.art["ui"]["map"]
        need = [f"t{i}" for i in range(5)] + [f"lineH:{i}" for i in range(5)] + [f"plane:{i}" for i in range(5)] + ["stamp", "globe", "globeG"]
        need += [f"box:{h}" for h in range(1, 5)] + [f"mug:{h}" for h in range(1, 4)] + [f"brick:{h}" for h in range(1, 4)]
        need += ["paint:1", "paint:2", "fax:1", "paper:1", "weight:1", "duck", "capsule"] + [f"gacha:{n}" for n in range(4)]
        need += [f"folder:{h}:{c}" for h in range(1, 4) for c in range(5)] + ["stain:1", "stain:2", "splat:1", "tape", "sheet", "blindI", "pen"]
        need += [f"cabinet:{h}" for h in range(1, 5)] + [f"pot:{h}" for h in range(1, 6)] + [f"locker:{h}" for h in range(1, 6)]
        need += ["pensCup", "blindTile"] + [f"pen{c}" for c in range(5)]
        for k in need:
            self.assertIn(k, pm, k)
        for k in ("b:hammer", "b:rowRuler", "b:colTape", "b:fan", "coin", "star", "giftBasket", "giftBox", "cat:idle", "cat:happy", "cat:sad", "cat:point"):
            self.assertIn(k, um, k)
        pens = self.art["meta"]["pens"]
        self.assertEqual(len(pens["slotsX"]), 4)
        self.assertEqual(len(pens["penTopY"]), 4)

    def test_files_exist(self):
        srcs = [self.art["pieces"]["src"], self.art["ui"]["src"], self.art["bg"]["portrait"], self.art["bg"]["landscape"]]
        for src in srcs:
            self.assertTrue(src.startswith("/assets/games/deskpop/"), src)
            self.assertTrue((ROOT / "web" / src.lstrip("/")).is_file(), src)

    def test_body_loads_art_with_version(self):
        self.assertRegex(BODY, r'<script src="/assets/games/deskpop/deskpop-art\.js\?v=\d+"></script>')
        self.assertRegex(BODY, r'<script src="deskpop-engine\.js\?v=\d+"></script>')
        self.assertRegex(BODY, r'<script src="deskpop-levels\.js\?v=\d+"></script>')


if __name__ == "__main__":
    unittest.main()
