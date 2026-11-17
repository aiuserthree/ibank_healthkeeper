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
- 4단계 광대 북 j · 색종이 e, 5단계 리본 y · 가면 u(옛 화면 차는 대상으로 삼지 않음)
- 7단계 연출 · 소리: 20종 모두 「쓸 때」 소리 자리(SFX_USE), 같은 이벤트로 host · 손님 화면에 같은 연출(fxEv), 소리 상한 · 소리 끔,
  생성 아이콘을 못 불러오면 그림 없이(iconTex null), 파티클 한 프레임 상한 240 · 꼬리 점 640, 동작 줄이기면 무적 깜빡임 없음, 광대 북 카메라
- 8단계 컴퓨터 · 도움말: 경고 반응(레벨 지연 · 확률, 사람 화면에 뜨는 경고만), 방패는 들고 있음, 함정 · 그림자 · 과녁 피하기, 집게 비키기,
  1등 함정 자리, 반전 적응 지연. ITEM_TIP 20줄 = 설계 12절, 멈춤 화면 · 대전 게임 방법에 20종(아이콘 + 이름 + 한 줄), 개발 지급 단추 20종 아이콘
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
        self.assertRegex(BODY, r"const VS_IV=\d+,ITEM_OLD_N=13,VS_SNAP=2;")
        self.assertIn("iv:VS_IV", BODY)  # host 스냅숏
        self.assertIn("v:VS_IV", BODY)  # 손님 입력
        self.assertIn("L.iv>=VS_SNAP", BODY)  # 효과 묶음 · 추적 물체 처리는 스냅숏 형식 판본(2)으로 — 판본을 올려도 4504d30 host 와 맞음

    def test_version_knows_items(self):
        # 9단계 — 판본마다 아는 아이템 수. 아이템을 더하면 VS_IV 를 올리고 VS_KNOWN 에 한 칸 더해야 한다(안 올리면 이 시험이 실패)
        iv = int(re.search(r"const VS_IV=(\d+),", BODY).group(1))
        known = {int(k): int(v) for k, v in re.findall(r"(\d+):(\d+)", re.search(r"const VS_KNOWN=\{([^}]*)\}", BODY).group(1))}
        self.assertEqual(known.get(iv), len(self.keys))
        self.assertEqual(known.get(1), 13)
        self.assertEqual(known.get(2), 17)  # 4504d30
        self.assertEqual(sorted(known.values()), list(known.values()))
        for fn in ["function ribTarget(c){const g=aheadOf(c,RIB_REACH);return g&&knowsK(g,'ribbon')?g:null;}",
                   "function maskTarget(c){const g=leaderFor(c);return g&&knowsK(g,'mask')?g:null;}",
                   "o.s>c.s&&knowsK(o,'swirl'))return true;"]:
            self.assertIn(fn, BODY)
        self.assertIn("if(ctx.old&&i>=(ctx.kn||ITEM_OLD_N))continue;", BODY)

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
        self.assertIn("if(ctx.old&&i>=(ctx.kn||ITEM_OLD_N))continue;", BODY)  # 보정 8 — 옛 화면 차는 그 판본이 아는 키만(판본 없음 13)

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

    def test_stage5_ribbon_mask(self):
        # 5단계 — 리본 올가미(y) · 심술 가면(u)은 17키 뒤에 붙고 물체 코드도 같은 글자, 둘 다 옛 화면 차는 노리지 않음(oldView),
        # 손님 화면은 추적 물체 4종을 대상 기준 자리로 그림, 리본 경고는 색만이 아니라 모양(두 줄 테두리)으로도 구분
        self.assertEqual(self.keys[17:19], ["ribbon", "mask"])
        self.assertEqual(self.code[17:19], "yu")
        pairs = dict(re.findall(r"([a-z]+):'(.)'", _block("OB_CODE")))
        self.assertEqual(pairs.get("ribbon"), "y")
        self.assertEqual(pairs.get("mask"), "u")
        self.assertIn("const RIB_REACH=280;", BODY)  # 9단계 — 닿을 수 없는 먼 앞차(한 바퀴 앞 포함)는 대상 아님
        self.assertIn("ban:{ribbon:!ribTarget(c),mask:!maskTarget(c)", BODY)  # 6단계에서 swirl 이 뒤에 붙음
        self.assertRegex(BODY, r"const RIB_T=1\.2,RIB_MIN=\.4,RIB_FLIP=3,RIB_LIFE=5,RIB_SPD=70,MASK_FLY=1\.2,MASK_W=1,MASK_T=3")
        self.assertIn("const VS_TRACK={wind:1,firework:1,ribbon:1,mask:1};", BODY)
        self.assertRegex(BODY, r"\.warn-edge\.k-ribbon\{border:12px double")

    def test_stage6_swirl_all20(self):
        # 6단계 — 어질 오르골(v)이 마지막 20번째, 설계의 20종이 ITEM · ITEM_TIP · ROLL_TAB · ICON_CELL 에 모두 있음.
        # 오르골은 옛 화면 차를 노리지 않고(뽑기 ban 포함), 축포와 서로 겹치지 않으며(globBusy), 컴퓨터는 레벨별 적응 확률로 상쇄
        planned = OLD_KEYS + ["pinwheel", "spring", "jack", "confetti", "ribbon", "mask", "swirl"]
        self.assertEqual(self.keys, planned)
        self.assertEqual(self.code, OLD_CODE + "nkjeyuv")
        for name in ["ITEM", "ITEM_TIP", "ROLL_TAB", "ICON_CELL"]:
            self.assertEqual(_keys(_block(name)) & set(planned), set(planned), name)
        self.assertIn("swirl:'앞선 모두의 좌우를 잠깐 바꿔요'", BODY)
        self.assertIn("const SW_W=1,SW_T=2.5,GLOB_GAP=3,SW_ADAPT={easy:.2,normal:.4,hard:.6};", BODY)
        self.assertIn("function globBusy(o){return o.thW>0||o.thS>0||o.revW>0||o.revT>0||o.immGlob>0;}", BODY)
        self.assertIn("&&!globBusy(o)){o.thW=TH_WARN;", BODY)  # 축포도 반전 중 · 전체 효과 면역 차에는 안 걸림
        self.assertIn("o.s<=c.s||!knowsK(o,'swirl')||revOff(o))continue;o.revW=SW_W+(VS.on&&VS.role==='host'&&o.remote?VS_PEND:0);", BODY)  # 옛 화면 손님은 대상 아님 · 원격 손님은 예고 +0.12초(맞기 보류)
        self.assertIn("swirl:!swAny(c)", BODY)
        self.assertIn("if(ROLL_GLOB[k])game.cdGlob=game.raceTime+ROLL_GLOB_CD;", BODY)  # 전체 효과 쿨다운 6초
        self.assertIn("ai.revAd=Math.random()<(SW_ADAPT[aiLv()]||.4)", BODY)
        self.assertRegex(BODY, r"\.warn-edge\.k-swirl\{")
        self.assertIn("else if(k==='rev')", BODY)

    def test_stage7_fx_sound(self):
        # 7단계 — 연출 · 소리. 아이템마다 쓸 때 소리가 있고(폭발은 부풀기 「쀼웅」, 스프링은 「뾰잉」이 따로 울려 null),
        # 이벤트 하나로 host · 혼자 하기(vsEv) · 손님(vsPlayEv)이 같은 연출 함수를 부른다(손님이 두 번 부르지 않게 vsEv 는 손님이면 건너뜀)
        keys = _keys(_block("SFX_USE"))
        self.assertEqual(keys, set(self.keys))
        self.assertRegex(_block("SFX_USE"), r"blast:null")
        self.assertRegex(_block("SFX_USE"), r"spring:null")
        self.assertEqual(_keys(_block("SFX_HIT")), {"pop", "fire", "trap", "wind", "star"})
        self.assertIn("if(!(VS.on&&VS.role==='guest'))fxEv(k,c,a);", BODY)
        self.assertIn("  if(!c||!track)return;\n  fxEv(k,c,a);", BODY)  # 손님 vsPlayEv
        # 소리 — 동시에 24개까지 · 소리 끔이면 만들지 않음 · 같은 소리 겹침 막기 · 남이 쓴 소리는 작게
        self.assertIn("const Snd={ctx:null,out:null,ends:[],VMAX:24,gk:1,last:{},", BODY)
        self.assertIn("if(n>=this.VMAX||save.mute)return false;", BODY)
        self.assertEqual(BODY.count("if(!this.slot(t,d))return;"), 2)  # tone · noise
        self.assertIn("Snd.gk=.4;sf();Snd.gk=1;", BODY)
        # 생성 아이콘 — 못 불러오면 null(가면 · 매듭은 코드 그림으로), 그림 파일은 -v1 그대로(30일 캐시라 덮어쓰지 않음)
        self.assertIn("if(!ICON.ok||!ICON.img||!ICON_CELL[k])return null;", BODY)
        self.assertIn("iconTex('mask')||TEX.mask", BODY)
        self.assertIn("iconTex('ribbon')||TEX.bow", BODY)
        self.assertIn("'/assets/games/sundown/item-icons-v1.webp'", BODY)
        self.assertTrue((ROOT / "web/assets/games/sundown/item-icons-v1.webp").is_file())
        # 성능 상한 — 한 프레임 새 파티클 240, 꼬리 점 640, 아이템 그림 스프라이트 12(낮음 6), 품질별 불꽃 수
        self.assertIn("const PCAP_FRAME=240;", BODY)
        self.assertIn("const DMAX=640,", BODY)
        self.assertIn("fxSprPool.length<(GFX.tier==='low'?6:12)", BODY)
        self.assertIn("const FXK={high:1,normal:.8,low:.5};", BODY)
        # 동작 줄이기 — 무적 깜빡임 없음 · 망토는 깜빡이지 않고 반투명
        self.assertIn("b.visible=c.ghostT>0||GFX.rm||!(c.invuln>0", BODY)
        self.assertIn("if(c.ghostT>0&&drive)f=Math.min(f,.4);", BODY)
        # 광대 북 · 회오리로 뜬 내 차를 카메라가 따라 올라감
        self.assertIn("camAir+=(((p.airLock>0||(p.fx&&p.fx.lift>0))?1:0)-camAir)", BODY)
        # 바깥 주소 · CDN 을 새로 쓰지 않음
        self.assertNotRegex(BODY, r"https?://(?!www\.w3\.org)[a-z]")

    def test_stage8_ai_help(self):
        # 8단계 — 컴퓨터 레이서 공통 규칙(설계 9절)
        self.assertIn("const AI_WARN={easy:{p:0,d:.6},normal:{p:.85,d:.45},hard:{p:1,d:.25}};", BODY)  # 9-1 쉬움 반응 안 함 · 보통 0.45 · 어려움 0.25초
        self.assertIn("  if(aiGuard(c))return; // 경고 반응(9-1)", BODY)
        thr = BODY[BODY.index("function aiThreats(c,out){"):BODY.index("function aiGuard(c){")]
        self.assertIn("if(d<-2||d>160)continue;", thr)  # 사람 화면 화살표와 같은 거리(내 뒤 160)만 — 미리 알지 않음
        self.assertIn("if(c.thW>0)", thr)
        self.assertIn("if(c.revW>0)", thr)
        self.assertNotIn("isPlayer", thr)  # 9-9 사람을 골라 노리지 않음
        self.assertIn("const AI_GUARD_SH=['shield','star','ghost'],AI_GUARD_NS=['star','ghost'];", BODY)  # 방패 → 퍼레이드 → 망토, 가면 · 오르골은 방패 빼고
        # 9-4 방패는 들고 있음(보통 · 어려움), 오래 들어도 칸이 꽉 차야 씀
        self.assertIn("if(k==='shield')return c.shield<=0&&aiLv()==='easy'&&c.itemHeld>4;", BODY)
        self.assertIn("(full||(k!=='spring'&&(k!=='shield'||aiLv()==='easy')))", BODY)
        # 9-3 피하기 · 집게 비키기 · 9-8 1등 함정 자리 · 반전 적응 지연
        self.assertIn("const AI_DODGE={easy:.5,normal:.65,hard:1}", BODY)  # 9단계 조정(보통 0.9 → 0.65)
        self.assertIn("dl=aiDodge(c,lane,", BODY)
        self.assertIn("lane=aiMagEvade(c,lane);", BODY)
        self.assertIn("const sp=trapSpot(c,TRAP_DEF[k].back);", BODY)
        tg = BODY[BODY.index("function trapGood(){"):BODY.index("function trapSpot(")]
        self.assertIn("if(trapZoneAt(at))continue;", tg)  # 장애물 둘레 · 발판 앞 금지
        self.assertIn("AI_REV_D={easy:.8,normal:.5,hard:.3}", BODY)
        self.assertIn("ai.revAd&&game.time>=ai.revAt", BODY)
        # 개발 시험용 레벨 바꾸기는 개발 주소에서만
        self.assertIn("(window.__sdLv&&DEVHOST&&window.__sdLv)||'normal'", BODY)
        # ITEM_TIP 20줄 = 설계 12절 한 줄
        tips = dict(re.findall(r"(\w+):'([^']*)'", _block("ITEM_TIP")))
        self.assertEqual(tips, SPEC12)
        # 멈춤 화면 — 아이템 20가지(접었다 펴기 · 목록 스크롤), 그림을 못 불러오면 이모지
        self.assertIn('<details class="ihelp" id="itemHelp">', BODY)
        self.assertIn('<ul id="itemHelpList"></ul>', BODY)
        self.assertIn("const ITEM_ORDER=Object.keys(ICON_CELL).filter(k=>ITEM[k]);", BODY)
        self.assertRegex(BODY, r"\.ihelp ul\{[^}]*overflow-y:auto")
        self.assertIn("html.icons-img .ic-alt em{display:none}", BODY)
        # 개발 지급 단추 20종 — 생성 아이콘(못 불러오면 이모지)
        self.assertIn("for(const k of ITEM_ORDER){ // 아이템 8단계 — 20종 생성 아이콘", BODY)
        self.assertIn("b.innerHTML=icAlt(k,26);", BODY)
        # 대전 게임 방법 — 20종(아이콘 + 이름 + 한 줄), 본체와 같은 이름 · 한 줄 · 이모지 · 색, 순서 = 아이콘 칸 순서
        rows = re.findall(r'\["([a-z]+)", "([^"]+)", "([^"]+)", "([^"]+)", "#([0-9a-f]{6})"\]', OUTER)
        self.assertEqual(len(rows), 20)
        order = re.findall(r"([a-z]+):\[\d+,\d+\]", _block("ICON_CELL"))
        self.assertEqual([r[0] for r in rows], order)
        item = {m[0]: m[1:] for m in re.findall(r"(\w+):\{n:'([^']*)',ic:'([^']*)',col:0x([0-9a-f]+)", _block("ITEM"))}
        for k, ic, n, tip, col in rows:
            self.assertEqual((n, ic, col), item[k], k)
            self.assertEqual(tip, SPEC12[k], k)
        self.assertIn("${itemsHtml()}", OUTER)
        self.assertIn('<details class="bv-items">', OUTER)
        self.assertIn('img.src = "/assets/games/sundown/item-icons-v1.webp";', OUTER)
        bv = OUTER[OUTER.index("const BV_ITEMS = ["):OUTER.index("function itemsHtml()")]
        self.assertNotIn("Shift", bv)


# 설계 12절 한 줄(ITEM_TIP · 처음 얻을 때 · 도움말)
SPEC12 = {
    "rocket": "짧고 세게 앞으로 튀어 나가요",
    "pinwheel": "5초 동안 조금 더 빠르게, 긁혀도 덜 느려져요",
    "magnet": "바로 앞차를 집어 끌려가요 — 걸리면 옆으로 크게 비켜 끊어요",
    "shield": "6초 안에 한 번 막아 줘요 — 경고가 뜨면 켜요",
    "star": "4초 동안 무엇에도 안 걸리고, 부딪힌 차를 튕겨요",
    "spring": "돌고 있을 때도 써요 — 빙글을 끊고 붙은 것을 털어 내요",
    "popcorn": "앞으로 곧게 던져 처음 닿는 차를 돌려요",
    "balloon": "앞차 앞에 떨어져 둘레 차를 끈적하게 느리게 해요",
    "blast": "잠깐 부풀었다가 둘레 차를 튕겨요",
    "meteor": "앞길에 별똥별 다섯 개 — 바닥 과녁을 피해요",
    "firework": "앞차를 잠깐 겨눈 뒤 쫓아가 맞혀요",
    "ribbon": "바로 앞 순위를 쫓아가 묶어요 — 묶이면 좌우를 번갈아 눌러요",
    "wind": "1등을 쫓아가 띄워요",
    "mask": "1등 머리에 붙어 느리게 해요 — 방패로 못 막고 스프링으로 떼요",
    "thunder": "앞선 모두의 머리 위에서 터져 느리게 해요 — 휘파람 소리에 방패!",
    "swirl": "앞선 모두의 좌우를 잠깐 바꿔요",
    "candy": "뒤에 놓아 밟은 차를 미끄러뜨려요",
    "jack": "뒤에 놓아 밟은 차를 하늘로 튕겨요",
    "confetti": "뒤에 놓아 지나간 차 화면을 색종이로 가려요",
    "ghost": "3초 동안 모두 통과하고, 앞차 아이템 하나를 가져와요",
}


if __name__ == "__main__":
    unittest.main()
