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
- 대전 바탕(차이표 단계 0): 판본 하나(VS_IV · 판본마다 VS_KNOWN 한 칸 · 같이 달릴 가장 낮은 판본 VS_MIX), 본체가 vs:ready 로 판본을 알리고
  바깥 대기실(1:1 · 여러 명)이 주고받아 맞지 않으면 준비 · 출발을 막음, 바깥 입력 덧칸(kb · tm · r · h) 범위 검사, R 키 넘기기, 스냅숏 칸 번호표(VS_COLS)
- 단계 1a(10초 끝): 첫 결승 뒤 10초(1:1 · 여러 명), 판본 5 · 섞여도 안전(VS_MIX 그대로, 손님은 host 판본으로 남은 초를 셈), 남은 초 표시(숫자 + 글),
  「경주 끝!」 · 「완주 못 함」, 바깥 결과는 전원 줄(순위 · 이름 · 기록 / 완주 못 함), 게임 방법 문구 10초, 다른 게임 고유 용어를 화면 글자에 안 씀
- 단계 3(새 키 — 지금 물리 위): ↓ · S 브레이크(0 까지, 후진 없음) · R 제자리로(길 가운데 · 속도 0 · 무적 1.5초, 맞는 중엔 자리 그대로 무적만, 3초 대기) ·
  출발 대시(「출발!」 앞뒤 0.25초, 일찍 · 늦게 없음, 손님은 자기 화면 판정 결과 dg 만 보냄), 판본 6(VS_KEYS) · 섞여도 안전(옛 손님이 있으면 host 가 제자리로 · 대시를 끔),
  바깥 dg 칸 · R 넘기기, 휴대폰 단추 2개(오른쪽), 안내 문구(아이템 키는 E · 1 · 2 · 3 만, Ctrl 없음)
- 단계 1b(정보 묶음 — 규칙 판본과 무관): 순위 목록(전원 · 휴대폰 3줄 · 손님은 스냅숏 순서 po), 속도계(45 ≈ 215km/h 표시만), 무작위 트랙(출발 순간 정해 go 로),
  컴퓨터 레벨(혼자 하기 save.lv · 여러 명 방 lv — 옛 본체는 보통), 레벨별 판단 주기 · 쉬움 공격 절반, 맞힘 소식(hl 이벤트 · 끄기) · 맞혔다 신호, 결승 뒤 카메라(동작 줄이기면 돌지 않음)
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
        self.assertRegex(BODY, r"const VS_IV=\d+,ITEM_OLD_N=13,VS_SNAP=2,VS_MIX=\d+;")
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
            self.assertIn("...inX(m) })", ln)  # 대전 바탕 — 판본 v 와 뒤 단계 칸(kb · tm · r · h)을 범위 검사해서 넘김

    def test_stage0_vs_base(self):
        """대전 바탕(단계 0) — 판본 하나 · 대기실 판본 비교 · 바깥 허용 칸 · R 키 넘기기 · 스냅숏 칸 번호표."""
        iv = int(re.search(r"const VS_IV=(\d+),", BODY).group(1))
        mx = int(re.search(r"VS_MIX=(\d+);", BODY).group(1))
        self.assertGreaterEqual(iv, 4)
        self.assertLessEqual(mx, iv)
        known = {int(k): int(v) for k, v in re.findall(r"(\d+):(\d+)", re.search(r"const VS_KNOWN=\{([^}]*)\}", BODY).group(1))}
        self.assertEqual(sorted(known), list(range(1, iv + 1)))  # 판본마다 한 칸(빠진 판본 없음)
        self.assertIn("vsPost({type:'vs:ready',v:VS_IV,mx:VS_MIX});", BODY)
        self.assertIn("const vsMixOk=v=>(v|0)>=VS_MIX;", BODY)
        # 스냅숏 칸 번호표 — 이름 수 · 지금 쓰는 칸 수가 스냅숏 만드는 줄과 같음
        cols = re.findall(r"'([a-zA-Z]+)'", re.search(r"const VS_COLS=\[([^\]]*)\]", BODY).group(1))
        used = int(re.search(r"VS_COLS_N=(\d+);", BODY).group(1))
        self.assertEqual(len(cols), len(set(cols)))
        self.assertEqual(cols[27:34], ["eff", "ths", "psi", "drift", "retire", "reset", "dash"])
        i = BODY.index("const cs=cars.map(c=>[") + len("const cs=cars.map(c=>[")
        depth, n, j = 0, 1, i
        while True:
            ch = BODY[j]
            if ch in "([{":
                depth += 1
            elif ch in ")]}":
                if depth == 0:
                    break
                depth -= 1
            elif ch == "," and depth == 0:
                n += 1
            j += 1
        self.assertEqual(n, used)
        # 바깥 — 판본을 받아 대기실에서 주고받고, 맞지 않으면 준비 · 출발을 막음
        self.assertIn("Object.assign(frameVer, verOf(m));", OUTER)
        self.assertEqual(OUTER.count("...myVer()"), 8)  # 1:1 · 여러 명 각각 hi · rd(준비 · 레이서 바꿈) · lb
        self.assertIn("!S.peerHere || verMix(S.pv)) return;", OUTER)  # 1:1 host 출발
        self.assertIn("S.rd[id] && !verMix(S.pv[id]));", OUTER)  # 여러 명 출발 — 맞지 않는 사람은 빠짐
        # 입력 덧칸 범위 검사
        for frag in ['if (int(m.v, 0, 99)) o.v = m.v;', 'if (int(m.kb, 0, 63)) o.kb = m.kb;', 'm.tm >= 0 && m.tm <= 400', 'if (int(m.r, 0, 1e6)) o.r = m.r;', 'if (m.h === 0 || m.h === 1) o.h = m.h;']:
            self.assertIn(frag, OUTER)
        # R 키 — 바깥이 넘기고(새로 고침 단축키는 빼고) 본체는 모르는 키로 무시(vs:key 정규식에 r 없음)
        self.assertIn('KeyR: "r"', OUTER)
        self.assertIn('if (k === "r" && (e.ctrlKey || e.metaKey || e.altKey)) return false;', OUTER)
        self.assertIn("/^(arrow(up|down|left|right)|[wasd ])$/.test(k)", BODY)
        # 새 안내 문구에 Shift 를 아이템 키로 적지 않음
        for txt in re.findall(r'VER_TXT = \{[^}]*\}', OUTER):
            self.assertNotIn("Shift", txt)

    def test_stage1a_retire(self):
        """단계 1a — 첫 결승 뒤 10초에 끝 · 남은 초 · 완주 못 함 · 결과 전원 줄."""
        iv = int(re.search(r"const VS_IV=(\d+),", BODY).group(1))
        self.assertGreaterEqual(iv, 5)
        self.assertIn("const VS_RET=5;", BODY)
        self.assertIn("const VS_GRACE=10,vsGrace=()=>VS_GRACE;", BODY)
        self.assertNotIn("cars.length>=3?20:12; // 누구든", BODY)  # 옛 기다림(12 · 20초)은 손님이 옛 host 를 볼 때만
        self.assertIn("(VS.lastL.iv|0)>=VS_RET)?VS_GRACE:cars.length>=3?20:12", BODY)
        self.assertIn("game.raceTime>=VS.firstT+vsGrace()", BODY)  # host 끝 판정
        # 섞여도 안전 — 결과 형식은 그대로라 같이 달릴 가장 낮은 판본은 올리지 않는다
        self.assertRegex(BODY, r"const VS_IV=\d+,ITEM_OLD_N=13,VS_SNAP=2,VS_MIX=0;")
        # 남은 초 — 숫자와 글(색만으로 알리지 않음), HUD 받침 · 외곽선 모양
        self.assertIn('<div class="vs-left" id="vsLeft" role="timer" hidden><b id="vsLeftN"></b><span id="vsLeftT"></span></div>', BODY)
        for txt in ("'초 안에 들어와요'", "'초 · 다른 차 기다리는 중'", "'완주 못 함'", "toast('경주 끝!')"):
            self.assertIn(txt, BODY)
        css = re.search(r"\.vs-left\{[^}]*\}", BODY).group(0)
        self.assertIn("var(--hud-bg)", css)
        self.assertIn("var(--hud-ol)", css)
        self.assertIn("vsLeftTick();", BODY)
        # 손님 — 끝 소식(vs:end r)으로 「경주 끝!」 · 「완주 못 함」
        self.assertIn("if(d.r&&Array.isArray(d.r.order)&&d.r.order.some(x=>x!=null))vsEndNote(d.r);", BODY)
        # 바깥 — 결과 전원 줄, 못 들어온 차는 「완주 못 함」(간 거리는 작게), 1:1 · 연습 · 여러 명 · 지난 판 모두 같은 줄
        self.assertEqual(OUTER.count("rankList("), 5)  # 정의 1 + 1:1 · 여러 명 · 지난 판 · 최근 경주 펼쳐 보기
        self.assertIn("`완주 못 함 <small>${pct(x.d)}</small>`", OUTER)
        self.assertNotIn("bv-stats", OUTER)
        self.assertIn("const END_HOLD = 1200;", OUTER)
        self.assertEqual(OUTER.count("afterEnd("), 4)  # 정의 1 + 연습 · 1:1 · 여러 명
        # 게임 방법 — 10초 · 완주 못 함, 옛 12 · 20초 문구 없음
        self.assertIn("10초 안에 상대가 못 들어오면 경주가 끝나고", OUTER)
        self.assertIn("누가 처음 들어온 뒤 10초가 지나면 경주가 끝나요", OUTER)
        self.assertNotIn("12초 안에 상대가", OUTER)
        self.assertNotIn("처음 들어온 뒤 20초", OUTER)
        # 다른 게임 고유 용어를 화면 글자에 쓰지 않음(차이표 0-3)
        for word in ("리타이어", "Retire", "RACE OVER", "완주 실패", "경기 종료"):
            self.assertNotIn(word, BODY)
            self.assertNotIn(word, OUTER)

    def test_stage1b_info(self):
        """단계 1b — 순위 목록 · 속도계 · 무작위 트랙 · 컴퓨터 레벨 · 레벨별 아이템 행동 · 맞힘 소식 · 맞혔다 신호 · 결승 뒤 카메라."""
        # 규칙 판본과 무관 — 판본 · 같이 달릴 가장 낮은 판본을 올리지 않는다(옛 화면과 섞여도 대전 정상). 뒤 단계(3)가 판본을 올려도 1b 는 그대로
        self.assertRegex(BODY, r"const VS_IV=\d+,ITEM_OLD_N=13,VS_SNAP=2,VS_MIX=0;")
        self.assertIn("const VS_KNOWN={1:13,2:17,3:20,4:20,5:20", BODY)
        # HUD 요소 4개 — 받침 · 외곽선은 지금 HUD 모양
        for el in ('<ol class="h-rank" id="hRank" aria-label="순위"></ol>', '<div class="h-spd" id="hSpd" aria-hidden="true"></div>',
                   '<div class="h-log" id="hLog" aria-hidden="true"></div>', '<div class="hit-ok" id="hitOk" aria-hidden="true"></div>'):
            self.assertIn(el, BODY)
        for sel in (r"\.h-rank\{", r"\.h-spd\{", r"\.h-log \.hl\{", r"\.hit-ok\{"):
            css = re.search(sel + r"[^}]*\}", BODY).group(0)
            self.assertIn("var(--hud-bg)", css, sel)
            self.assertIn("var(--hud-ol)", css, sel)
        # 순위 목록 — 순서가 바뀔 때만 자리 옮김, 휴대폰 3줄, 동작 줄이기면 미끄러짐 없음
        self.assertIn("RK.compact=!!(window.matchMedia&&matchMedia('(max-width:760px),(max-height:520px)').matches);", BODY)
        self.assertIn("const show=RK.compact?Math.min(3,n):n", BODY)
        self.assertIn("html.rm .h-rank li{transition:none}", BODY)
        self.assertIn("rankTick();spdTick();logTick();", BODY)
        # 손님 순위 = host 스냅숏 순서(po). 옛 host(po 없음)면 예전 계산
        self.assertIn(",ev:VS.evq,po:po};", BODY)
        self.assertIn("if(!vsPlaceFrom(L.po)){", BODY)
        # 속도계 — 물리 값은 그대로, 표시만 환산
        self.assertIn("const KMH=215/45,SPD_MAX=300;", BODY)
        self.assertIn("const km=Math.round(Math.max(0,player.v||0)*KMH);", BODY)
        # 맞힘 소식 — 맞힌 차는 맞은 순간에, host 는 hl 이벤트(옛 손님은 모르는 이벤트를 지나침), 끄면 안 보임, 내가 맞혔으면 신호 + 소리
        self.assertIn("q.push(['hl',c.id,[ITEM_CODE[ITEM_KEYS.indexOf(k)],by.id]]);", BODY)
        self.assertIn("if(k==='hl'){if(Array.isArray(a)){const j=ITEM_CODE.indexOf(a[0]);if(j>=0&&cars[a[1]])hitLogAdd(cars[a[1]],c,ITEM_KEYS[j]);}return;}", BODY)
        self.assertIn("if(by===player&&c!==player)hitOkShow(k);\n  if(!GFX.log)return;", BODY)
        self.assertIn("$('hLog').hidden=!GFX.log;", BODY)
        self.assertIn('<button class="rm-btn" id="btnLog" type="button" aria-pressed="true">맞힘 소식: 켬</button>', BODY)
        self.assertIn("else if(t==='vs:opt'){", BODY)
        hl = dict(re.findall(r"(\w+):'(\w+)'", _block("HL_KEY")))
        for k in hl.values():
            self.assertIn(k, self.keys)
        # 맞힌 차를 적는 곳 — 물체 주인 · 범퍼 폭발 · 퍼레이드 · 축포 · 오르골
        for snip in ("hitBy(c,o.own);hit(c,'pop')", "hitBy(g,o.own);if(!hit(g,'fire')", "hitBy(o,c);hit(o,'blast')", "hitBy(b,a);hit(b,'star')",
                     "o.thW=TH_WARN;o.thBy=c;", "o.revBy=c;", "hitBy(c,c.thBy);zap(c);", "hitBy(c,c.revBy);revStart(c);", "hitNote(o,'zap');"):
            self.assertIn(snip, BODY)
        # 컴퓨터 레벨 — 혼자 하기(보통이 예전 그대로) · 레벨별 판단 주기 · 쉬움 공격 절반
        self.assertIn("SOLO_LV={easy:{sp:.92,bonus:.5,arc:.5,", BODY)
        self.assertIn("normal:{sp:1,bonus:1,arc:1,", BODY)
        self.assertIn("const AI_ITEM_T={easy:[.8,.8],normal:[.4,.4],hard:[.3,.25]};", BODY)
        self.assertIn("if(SOLO_LV[o.lv])save.lv=o.lv;", BODY)
        self.assertIn('data-lv="easy"', BODY)
        # 결승 뒤 카메라 — 동작 줄이기면 돌지 않음
        self.assertIn("if(p.finished&&(st==='race'||st==='finish')&&!GFX.rm){", BODY)
        # 바깥 — 무작위 트랙(출발 순간 정해 출발 신호로) · 여러 명 컴퓨터 레벨(옛 주인 = 보통)
        self.assertIn('if (S.rnd) { S.track = pickRnd(S.max); S.rnd = false; }', OUTER)
        self.assertIn('if (S.rnd) { S.track = pickRnd(TRACKS.length); S.rnd = false; }', OUTER)
        self.assertIn('const track = pref.rnd ? pickRnd(unlocked()) : pref.track;', OUTER)
        self.assertIn('track: S.track, lv: S.lv, players, rids,', OUTER)
        self.assertIn('level: LEVEL_NAME[g.lv] ? g.lv : "normal"', OUTER)
        self.assertIn('S.lv = LEVEL_NAME[m.lv] ? m.lv : "normal";', OUTER)
        self.assertIn('toFrame({ type: "vs:opt", log: pref.log });', OUTER)
        self.assertNotIn('level: "normal", e: S.e', OUTER)
        # 새 안내 문구에 Shift 를 아이템 키로 적지 않음 · 다른 게임 용어 없음
        for word in ("피격 로그", "킬 로그", "순부", "스피드전", "아이템전"):
            self.assertNotIn(word, BODY)
            self.assertNotIn(word, OUTER)

    def test_stage2_solo_retire(self):
        """단계 2 — 혼자 하기도 첫 결승 뒤 10초에 끝, 못 들어오면 「완주 못 함」: 주운 티켓만(순위 보너스 · 최고 기록 · 다음 트랙 없음), 결과에 전원 기록."""
        # 대전과 같은 기다림(VS_GRACE 10초) — 모두 들어오면 바로
        self.assertIn("if(!all&&game.raceTime<game.order[0].finishT+VS_GRACE)return;", BODY)
        self.assertIn("if(VS.on)vsCheckEnd();else soloCheckEnd();", BODY)
        # 내 차가 들어온 뒤에도 끝날 때까지 시계가 가고(뒤 차 기록), 끝난 뒤에는 결승 · 티켓이 더 생기지 않음
        self.assertIn("if(racing||(!VS.on&&game.state==='finish'&&!game.sOver))game.raceTime+=dt;", BODY)
        self.assertIn("if(!c.finished&&c.s>=tr.finish&&!game.sOver){", BODY)
        self.assertIn("if(!p.finished&&!VS.on&&!game.sOver){", BODY)
        self.assertIn("function addTix(n,trick){if(game.sOver)return;", BODY)
        self.assertIn("const lost=game.sOver?0:Math.min(game.tix,c.st.ticketLoss);", BODY)
        # 결과는 경주가 끝나야
        self.assertIn("if(game.finishT<=0&&!VS.on&&game.sOver)showResults();", BODY)
        # 완주 못 함 — 주운 티켓(game.tix)만 · 순위 점수 0 · 열림 없음 · 최고 기록 안 바꿈
        dnf = re.search(r"function onPlayerDnf\(\)\{.*?\n\}", BODY, re.S).group(0)
        self.assertIn("total=game.tix;", dnf)
        self.assertIn("save.tickets+=total;", dnf)
        self.assertIn("arcadeScore(0,idx,total,L.arc)", dnf)
        self.assertIn("opened:-1", dnf)
        self.assertNotIn("save.unlocked", dnf)
        self.assertNotIn("save.best", dnf)
        # 다음 트랙 열림은 완주했을 때만(onPlayerFinish 그대로)
        self.assertIn("if(place<=3)save.unlocked=Math.max(save.unlocked,Math.min(TRACKS.length,idx+2));", BODY)
        # 저장값 이름 · 모양 그대로(새 칸 없음)
        self.assertIn("const save={tickets:0,up:{engine:0,tires:0,boost:0,bumper:0},owned:['bunny'],racer:'bunny',unlocked:1,best:TRACKS.map(()=>0),seenHelp:false,mute:false,track:0,lv:'normal'};", BODY)
        self.assertIn("'sundown-bumpers-v1'", BODY)
        # 결과 화면 — 전원 기록 · 완주 못 함 문구, 남은 초 표시는 혼자 하기에서도
        self.assertIn('<ol class="res-board" id="resBoard" aria-label="이번 판 기록" hidden></ol>', BODY)
        self.assertIn("resBoard(r.rows);", BODY)
        self.assertIn("$('resTitle').textContent=r.dnf?'완주 못 함'", BODY)
        self.assertIn("  }else vsLeftTick();\n}", BODY)
        self.assertIn("if(solo?game.sDnf:VS.dnf)mode='dnf';", BODY)
        # 대전은 섞여도 안전 그대로(혼자 하기만 바뀜 — 판본은 뒤 단계 3 이 6 으로 올림)
        self.assertRegex(BODY, r"const VS_IV=\d+,ITEM_OLD_N=13,VS_SNAP=2,VS_MIX=0;")
        # 다른 게임 용어를 화면 글자에 쓰지 않음
        for w in ("리타이어", "RETIRE", "RACE OVER"):
            self.assertNotIn(w, re.sub(r"/\*.*?\*/|//[^\n]*", "", BODY, flags=re.S), w)

    def test_stage3_new_keys(self):
        """단계 3 — ↓ 브레이크 · R 제자리로 · 출발 대시 · 휴대폰 단추 · 안내 문구 · 판본 6(섞여도 안전)."""
        iv = int(re.search(r"const VS_IV=(\d+),", BODY).group(1))
        self.assertGreaterEqual(iv, 6)
        self.assertIn("const VS_KEYS=6;", BODY)
        self.assertRegex(BODY, r"const VS_IV=\d+,ITEM_OLD_N=13,VS_SNAP=2,VS_MIX=0;")  # 섞여도 안전 — 대기실에서 막지 않음
        self.assertIn("6:20", re.search(r"const VS_KNOWN=\{([^}]*)\}", BODY).group(1))
        # 값 — 브레이크 0 까지 · 제자리로 무적 1.5초 · 대기 3초 · 출발 대시 창 0.25초
        self.assertIn("const BRAKE_DEC=42,RS_INV=1.5,RS_CD=3,DASH_W=.25,DASH_EARLY=1,DASH_MIN=.6,DASH_MAX=1.1,", BODY)
        # 브레이크 — 후진 없음(0 에서 멈춤), 입력 ↓ · S · 단추, host · 손님 예측 같은 규칙
        self.assertIn("if(!spun){if(inp.brake){if(c.v>0)c.v=Math.max(0,c.v-BRAKE_DEC*dt);}", BODY)
        self.assertIn("input.brake=input.tBrake||!!(K.arrowdown||K.s);", BODY)
        self.assertIn("else if(acc===2){if(v>0)v=Math.max(0,v-BRAKE_DEC*dt);}", BODY)
        self.assertIn("c.lastBrake?2:c.lastAccel?1:0,", BODY)  # 스냅숏 20번 — 2 = 브레이크(옛 손님은 「달리기 아님」)
        self.assertIn("brake:Number.isInteger(d.kb)&&(d.kb&KB_DOWN)!==0}", BODY)
        # 제자리로 — 맞는 중이면 자리 그대로 무적만(보통 공중은 수정 단계에서 안 씀 — test_stage3_fix), 대기, 조합 키(Ctrl/Cmd/Alt+R)는 건드리지 않음
        reset = re.search(r"function carReset\(c\)\{.*?\n\}", BODY, re.S).group(0)
        for frag in ("if(c.finished||c.rsCd>0)return false;", "c.rsCd=RS_CD;", "const held=rsHeld(c);",
                     "c.invuln=Math.max(c.invuln,RS_INV);", "c.uVel=0;c.v=0;"):
            self.assertIn(frag, reset)
        self.assertIn("if(k==='r'&&!mod&&racing){resetPress();return;}", BODY)
        self.assertIn("else if(k==='r'&&d.down)resetPress();}", BODY)
        self.assertIn("if(Number.isInteger(rn)&&rn>(VS.rU[i]||0)){VS.rU[i]=rn;", BODY)
        # 출발 대시 — 일찍(창 전에 누름 · 창이 열릴 때 누르고 있음) · 늦게 · 손님은 결과만(dg), host 는 처음 받은 것만
        tick = re.search(r"function dashTick\(\)\{.*?\n\}", BODY, re.S).group(0)
        for frag in ("if(t>DASH_W){dashDecide('late',0);return;}", "dashDecide(t<-DASH_W?'early':'ok',t<-DASH_W?0:dashLen(t))", "if(a&&t>=-DASH_W)dashDecide('early',0);"):
            self.assertIn(frag, tick)
        self.assertIn("VS.dg=res==='ok'?Math.round(dur*100):0;", BODY)
        self.assertIn("if(Number.isInteger(dg)&&dg>=0&&dg<=120&&!c.dashGot&&", BODY)
        self.assertIn("if(VS.on&&VS.role==='host')VS.keysOk=cars.every(c=>!c.remote||(c.ver|0)>=VS_KEYS);", BODY)
        # 바깥 — dg 칸 범위 검사, R 넘기기(새로 고침 단축키 제외) 그대로
        self.assertIn("if (int(m.dg, 0, 120)) o.dg = m.dg;", OUTER)
        self.assertIn('KeyR: "r"', OUTER)
        self.assertIn('ArrowDown: "arrowdown"', OUTER)
        self.assertIn('KeyS: "s"', OUTER)
        # 휴대폰 단추 — 오른쪽 · 브레이크(누르는 동안) · 제자리로
        self.assertIn('<div class="tkeys" id="tKeys" role="group" aria-label="브레이크 · 제자리로">', BODY)
        self.assertIn("@media (pointer:coarse){\n  .tkeys{display:flex}", BODY)
        # 컴퓨터 — 레벨만큼 대시 · 브레이크
        self.assertIn("DASH_AI={easy:.3,normal:.55,hard:.85}", BODY)
        self.assertIn("AI_BRAKE={easy:0,normal:.5,hard:.9}", BODY)
        # 안내 문구 — 브레이크 · 출발 대시 · 제자리로가 있고, 아이템 키로 Shift · Ctrl 을 적지 않음
        how = re.search(r'<p class="how" id="howTxt">(.*?)</p>', BODY).group(1)
        pause = re.search(r'<section id="pause"[^>]*>\s*<div class="panel">\s*<h2>잠깐 멈춤</h2>\s*<p>(.*?)</p>', BODY, re.S).group(1)
        help_ = re.search(r"function helpHtml\(\)\{.*?\n\}", BODY, re.S).group(0)
        rules = re.search(r"<h3>조작</h3>(.*?)<h3>경주 화면</h3>", OUTER, re.S).group(1)
        for txt in (how, pause, help_, rules):
            for w in ("브레이크", "출발 대시", "제자리로"):
                self.assertIn(w, txt)
            for w in ("Shift", "Ctrl", "순간부스터", "출부", "리셋"):
                self.assertNotIn(w, txt)
        # 다른 게임 용어를 화면 글자에 쓰지 않음
        plain = re.sub(r"/\*.*?\*/|//[^\n]*", "", BODY, flags=re.S)
        for w in ("출발 부스터", "재배치", "순간부스터"):
            self.assertNotIn(w, plain)
            self.assertNotIn(w, OUTER)

    def test_stage3_fix(self):
        """단계 0~3 수정 — 공중 R 무적 꼼수 막기 · 손님 R 예측 · 결승 대기 멈춤 · 화면 겹침 · 안내 줄 · 완주 못 함 표기."""
        self.assertIn("const rsHeld=c=>c.spinout>0||c.tieT>0||c.airLock>0||!!c.pend;", BODY)  # 맞는 중에 c.air(보통 점프)는 없음
        reset = re.search(r"function carReset\(c\)\{.*?\n\}", BODY, re.S).group(0)
        i_air = reset.index("if(c.air&&!held){vsEv('reset',c,3);resetFx(c,3);return false;}")
        self.assertLess(i_air, reset.index("c.rsCd=RS_CD;"))  # 공중이면 대기도 무적도 주지 않고 돌아감
        self.assertLess(i_air, reset.index("c.invuln=Math.max(c.invuln,RS_INV);"))
        press = re.search(r"function resetPress\(\)\{.*?\n\}", BODY, re.S).group(0)
        self.assertIn("if(p.air&&!rsHeld(p)){resetFx(p,3);return;}", press)  # 손님도 공중이면 보내지 않음
        self.assertIn("VS.rsMs=performance.now();VS.rsMv=!rsHeld(p);VS.rsSeq=Infinity;", press)
        # 손님 예측 — host 가 옮길 즈음(누른 때 + 한쪽 지연) 적용, host 의 reset 이 실린 스냅숏부터는 빼기
        self.assertIn("rzT=VS.rsMs+VS.rtt/2,rz=!(H&&VS.rsMv&&VS.pSeq<VS.rsSeq&&rzT>t0);", BODY)
        self.assertIn("if(!rz&&tm>=rzT){rz=true;surf(track,s,u,0,_PS);u=rsCenterU(s,u,_PS);v=0;uv=0;bo=0;}", BODY)
        self.assertIn("if(a>=2){VS.rsMv=false;VS.rsAt=-9;}else VS.rsSeq=VS.seq;", BODY)
        self.assertIn("VS.pSeq=L.seq;", BODY)
        self.assertIn("VS.pSeq=Pv.seq;", BODY)
        # 혼자 하기 결승 대기 — 멈출 수 있고 아래 단추는 「결과 보기」
        self.assertIn("const soloWait=()=>!VS.on&&game.state==='finish'&&!!player&&player.finished&&!!game.result;", BODY)
        self.assertIn("if(game.state!=='race'&&game.state!=='countdown'&&!soloWait())return;", BODY)
        self.assertIn("click('btnQuit',()=>{if(soloWait())soloEndNow();else goHome();});", BODY)
        # 화면 — 세로 휴대폰 맞힘 표시는 내 차 위가 아닌 자리, 경고 띠는 미니맵을 비키고 설명 위로
        self.assertIn(".hit-ok{top:312px}", BODY)
        self.assertNotIn(".hit-ok{top:472px}", BODY)
        self.assertIn("@media (max-width:760px) and (min-height:521px){.warn-band{left:calc(50% - 54px)}}", BODY)
        self.assertIn(".warn-band{z-index:1}", BODY)
        # 바깥 — 첫 화면 키 줄에 브레이크 · 제자리로, 휴대폰 무작위 글자, 결과 「—」, 막힘 안내
        hh = re.search(r"function helpHtml\(\) \{.*?\n    \}", OUTER, re.S).group(0)
        for frag in ('${k("↓")}${k("S")} 브레이크', '${k("R")} 제자리로', "「브레이크」 · 「제자리로」 단추"):
            self.assertIn(frag, hh)
        self.assertNotIn("Shift", hh)
        self.assertIn(".bv-grid.is-tracks .bv-rnd small { display: block;", OUTER)
        self.assertIn('<b>${x.t == null ? "—" : x.place}</b>', OUTER)
        self.assertIn("상대에게 새로 고침을 부탁해 주세요", OUTER)
        self.assertIn('VER_TXT[mix].replace(/상대/g, "연 사람")', OUTER)
        # 다른 게임 이름을 서버 주석에 쓰지 않음
        srv = (ROOT / "backend/app/services/versus_bumpervs.py").read_text(encoding="utf-8")
        self.assertNotIn("카트라이더", srv)

    def test_stage2_arcade_score_range(self):
        """단계 2 — 완주 못 함 점수(순위 점수 0 + 티켓 × 10, 0점일 수도 있음)를 아케이드 점수 서버가 그대로 받는다(서버 규칙은 안 바꿈)."""
        try:
            from app.services.game import get_game
        except Exception as e:  # 시스템 파이썬(정적 시험)에는 서버 의존성이 없을 수 있다
            self.skipTest("서버 모듈 없음: %s" % e)
        g = get_game("sundown")
        self.assertEqual(g.min_score, 0)
        self.assertFalse(g.lower_better)
        # 완주 못 함 최저(티켓 0장) 0점 · 완주 최고(1등 × 트랙 13 + 넉넉한 티켓)가 범위 안
        self.assertLessEqual(g.min_score, 0)
        self.assertGreaterEqual(g.max_score, 3000 * 13 + 2000 * 10)
        # 본체 점수는 정수(Math.round · Math.floor) — 서버는 int 만 받는다
        self.assertIn("pp=Math.round(ps*mul*k);", BODY)
        self.assertIn("tk=Math.max(0,Math.floor(tickets))", BODY)

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
        self.assertRegex(BODY, r"  if\(!c\|\|!track\)return;\n(  if\(k==='hl'\)[^\n]*\n)?  fxEv\(k,c,a\);")  # 손님 vsPlayEv(단계 1b 맞힘 소식은 연출 전에 따로)
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
        self.assertIn("(window.__sdLv&&DEVHOST&&window.__sdLv)||(SOLO_LV[save.lv]?save.lv:'normal')", BODY)  # 단계 1b — 혼자 하기는 고른 레벨
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
