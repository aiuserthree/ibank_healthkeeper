"""안개 군도 FPS(키 fogisle) 시험 하네스 — 본체 web/games/embed/fogisle.html 을 검사하고 헤드리스 크롬으로 연다.

실행(시스템 파이썬 · playwright 1.58.0, -I 붙이지 않음):
    REPO="/Users/jhcho/Documents/개인 프로젝트/헬스키퍼"
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py lint
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py smoke [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py arcade --frame [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py move --basic [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py move [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py perf [--sec 20] [--fire] [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py shoot --core [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py shoot [--out DIR]
    cd "$REPO" && /usr/bin/python3 scripts/games/fogisle_check.py perf --blast [--sec 20] [--out DIR]

- 종료 코드 0 = 통과. 마지막 줄은 JSON 요약.
- 산출물(스크린샷 · 수치)은 --out (기본: 환경 변수 FOGISLE_OUT 또는 /tmp/fogisle-check/).
- 페이지는 http://hk.test/** 를 저장소 web/ 폴더로 돌려준다(route). /api/** 는 가짜 {"data":{}}, unpkg 는 가짜 lucide.
  그 밖의 바깥 주소 요청은 막고 기록한다(본체는 바깥 파일을 부르지 않아야 함).
- 본체 파일을 통째로 출력하지 않는다(three 압축본 한 줄이 67만 자).

명령(단계마다 늘어남 — build-plan.md 부록 A):
    lint   S0  문법(node --check) · 금지 문자열 · 금지어 · sim 모듈 규칙 · 크기
    smoke  S0  단독으로 열어 오류 0 · __fps.ready 5초 안 · THREE r160 · 타이틀 스크린샷 · 단독이면 hk 신호 없음
    arcade --frame  S1  단독: 출격 · 대체 조작 끌기 · Space · 고리 손잡이 · 멈춤 / 가짜 부모 창(/__parent.html): 멈춤 규약 신호 순서
    move --basic    S2  시험 구역 t0: 앞으로 걷기 · 속도 · 벽/모서리/좁은 통로/60° 모서리 뚫지 않음 · 경사판 · 계단 · 천장 낮은 통로 일어서기 거부 ·
                        점프 높이 0.4~0.6m · 문 · 결정성 · 맵 자료 확인 · 구역 만들기 50ms · 그리기 호출
    move            S3  위 + 낮은 벽 넘기 · 높은 벽 실패 · 가슴 높이 오르기 · 넘기 취소 · 슬라이딩 3~5m · 대기 · 점프 취소 · 넘은 직후 슬라이딩 ·
                        전술 달리기 ×1.8 → 3초 뒤 ×1.5 · 대기 6초 · 착지 감속 · 연속 점프 · 기대기(기본 끔) · 실제 키 Shift 두 번 · 결정성
    perf [--sec N]  S3  실시간 고리 t0(보통 화질): 그리기 호출 ≤ 40 · 삼각형 · 33ms 초과 1% 이하 · 이동 sim ≤ 0.8ms · ?dbg=1 표(아케이드는 없음)
                        — 헤드리스 M5 수치는 참고, 판정은 실제 사무 PC. --fire(S4): 걸으며 연사 중 그리기 호출 ≤ 60
    shoot --core    S4  무기 6종 발사 · aimAt → hit · 탄창 감소 · 반동 배열 = 카메라 pitch · 쏜 뒤 그린 카메라 = 다음 탄 방향 · 손 떼면 0.2초 복귀 ·
                        전술(+약실 1) < 빈 탄창 재장전 · 자동 · 달리기 취소 · 달리기 → 사격 0.2초 · 산탄 8줄기 고정 무늬 · 펌프 간격 · 조준 시야각 ·
                        부위 배율 · 방탄 · 감쇠 · 처치 · 맞힘 표시 4종(X 아님) · 교체 0.45/0.3 · 조준경 덮개 · 십자선 · 소리 · 결정성 · 연사 중 호출 ≤ 60
    shoot           S5  위 전부 + 부착물 9종(큰 탄창 +50% · 빠른 탄창 · 소음기 · 반동 억제기 · 점/배율 조준경 · 칸 제한) · 근접 1.5m(방탄 2회 · 재장전 취소) ·
                        벽 앞 총 거두기 · 발사기 날아가는 탄 · 기대기 켬 → 섬광 키 4(실제 키) · 훈련장: 나무 판자 · 얇은 철판 관통 ×0.5 · 콘크리트 막힘 ·
                        수류탄 반경 · 엄폐 뒤 무피해 · 쿠킹 퓨즈 3초 · 궤적 점 · 손에서 터짐 · 섬광 반경 8m · 플레이어 흰빛(동작 줄이기 회색) ·
                        효과(예광 · 탄피 · 탄흔 · 점광 · 폭발 빛 · 흔들림 · 붉은 입자 없음) · 첫 폭발 셰이더 새로 안 만듦 · 「훈련장」 클릭 → 과제 6개를 __fps 입력만으로
    perf --blast    S5  실시간 고리 t0 에서 폭발 연속(0.7초마다) 중 33ms 넘는 프레임 0 · 호출 ≤ 60 · 셰이더 새로 안 만듦
"""
import argparse
import json
import mimetypes
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time

REPO = pathlib.Path(__file__).resolve().parents[2]
WEB = REPO / "web"
BODY = pathlib.Path(os.environ["FOGISLE_BODY"]) if os.environ.get("FOGISLE_BODY") else WEB / "games" / "embed" / "fogisle.html"  # lint 음성 시험용 바꿔 끼우기
BODY_URL = "/games/embed/fogisle.html"
HOST = "http://hk.test"
DEFAULT_OUT = os.environ.get("FOGISLE_OUT", "/tmp/fogisle-check")

SIZE_WARN = int(1.6 * 1024 * 1024)       # tdd-final §1-2 — 넘으면 임무 자료 분리를 사용자에게 묻는다
GAME_CODE_WARN = 800 * 1024
THREE_MIN_LINE = 200_000                 # 이보다 긴 줄이 든 <script> 는 three 압축본 덩어리로 본다
SIM_MODULES = {"player", "weapons", "ballistics", "combat", "projectiles", "drill", "ai", "nav", "allies", "mission", "world"}
SIM_BANNED = [("Math.random", r"Math\.random"), ("performance.now", r"performance\.now"), ("document.", r"\bdocument\.")]

# 금지 문자열(본체 게임 코드 · 마크업 — three 덩어리는 빼고 검사)
BANNED_STRINGS = [
    ("cdnjs.", r"cdnjs\."),
    ("unpkg.", r"unpkg\."),
    ("jsdelivr.", r"jsdelivr\."),
    ("alert(", r"(?:(?<![\w$.])|(?<=window\.))alert\s*\("),
    ("confirm(", r"(?:(?<![\w$.])|(?<=window\.))confirm\s*\("),
    ("prompt(", r"(?:(?<![\w$.])|(?<=window\.))prompt\s*\("),
    ("mix-blend-mode", r"mix-blend-mode"),
    ("api.js/mgmt.js", r"/_shared/(?:api|mgmt)\.js"),
]

# 금지어 — 레퍼런스 시리즈 · 제작사 · 인물 · 부대 · 실존 부대 · 실존 총기 · 실존 국가/지역(대소문자 무시).
# 라틴 글자는 낱말 경계로, 한글은 그대로 찾는다. 새 이름이 나오면 여기에 더한다.
BANNED_WORDS_LATIN = [
    "call of duty", "modern warfare", "black ops", "warzone", "infinity ward", "treyarch", "activision", "raven software",
    "mactavish", "captain price", "soap", "makarov", "zakhaev", "task force 141", "tf141", "tf 141", "shadow company",
    "nikolai", "farah karim", "alex keller", "kate laswell", "laswell", "ghost riley", "simon riley", "gaz garrick",
    "valeria garza", "hassan zyani", "konni", "al-qatala", "al qatala", "urzikstan", "verdansk", "las almas",
    "navy seal", "seal team", "delta force", "spetsnaz", "gign", "green beret", "rangers", "marsoc", "sas", "kssf", "udt",
    "ak-47", "ak47", "akm", "ak-74", "m4a1", "m16", "m249", "mp5", "mp7", "ump45", "p90", "scar-h", "scar-l", "fn scar",
    "glock", "desert eagle", "kalashnikov", "barrett", "hk416", "famas", "steyr aug", "uzi", "rpg-7", "m1911", "beretta",
    "dragunov", "remington", "mossberg", "kar98", "javelin", "stinger",
    "korea", "dprk", "pyongyang", "seoul", "busan", "incheon", "china", "beijing", "shanghai", "japan", "tokyo",
    "russia", "moscow", "ukraine", "usa", "united states", "america",
]
BANNED_WORDS_HANGUL = [
    "콜 오브 듀티", "콜오브듀티", "모던 워페어", "모던워페어", "블랙 옵스", "블랙옵스", "워존", "인피니티 워드", "트레이아크", "액티비전",
    "맥태비시", "프라이스 대위", "마카로프", "자카예프", "태스크 포스", "섀도 컴퍼니", "쉐도우 컴퍼니",
    "델타 포스", "스페츠나츠", "네이비 실", "그린베레", "특전사", "해병대",
    "칼라시니코프", "글록", "데저트 이글", "바렛", "드라구노프", "레밍턴", "모스버그", "베레타",
    "한반도", "대한민국", "한국군", "북한", "남한", "조선인민군", "평양", "서울", "부산", "인천", "중국", "베이징", "일본", "도쿄",
    "러시아", "모스크바", "우크라이나", "미국", "미군",
]


def out_dir(args):
    p = pathlib.Path(args.out or DEFAULT_OUT)
    p.mkdir(parents=True, exist_ok=True)
    return p


def finish(name, ok, summary, notes):
    for n in notes:
        print(("  ok  " if n[0] else "  XX  ") + n[1])
    summary = dict(summary)
    summary["cmd"] = name
    summary["ok"] = bool(ok)
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if ok else 1


# ───────────────────────────── lint ─────────────────────────────

SCRIPT_RE = re.compile(r"<script(\s[^>]*)?>(.*?)</script>", re.S | re.I)
MODULE_RE = re.compile(r"/\*\s*====\s*MODULE:\s*([A-Za-z0-9_-]+)")


def split_body(text):
    """본체를 (three 덩어리, 게임 코드 덩어리 목록, three 를 뺀 나머지 글) 로 나눈다."""
    # HTML 주석을 같은 길이의 빈칸으로 가린 글에서 덩어리를 찾는다(주석 안 글자가 <script> 로 잘못 읽히지 않게).
    # 자리는 같으니 잘라 내는 내용은 원문에서 — 주석 안 금지어도 검사된다.
    masked = re.sub(r"<!--.*?-->", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)
    three = []
    blocks = []
    rest_parts = []
    pos = 0
    for m in SCRIPT_RE.finditer(masked):
        attrs = m.group(1) or ""
        code = text[m.start(2):m.end(2)]
        line = text.count("\n", 0, m.start()) + 1
        longest = max((len(x) for x in code.split("\n")), default=0)
        if "src=" in attrs:
            continue
        if longest >= THREE_MIN_LINE:
            three.append({"line": line, "chars": len(code)})
            rest_parts.append(text[pos:m.start()])
            rest_parts.append("\n" * text.count("\n", m.start(), m.end()))  # 줄 번호 유지
            pos = m.end()
            continue
        mm = MODULE_RE.search(code.split("\n", 1)[0])
        blocks.append({"line": line, "code": code, "module": mm.group(1) if mm else None, "first": code.split("\n", 1)[0][:80]})
    rest_parts.append(text[pos:])
    return three, blocks, "".join(rest_parts)


def line_of(text, idx):
    return text.count("\n", 0, idx) + 1


def cmd_lint(args):
    notes = []
    ok = True
    if not BODY.exists():
        return finish("lint", False, {"error": "본체 없음"}, [(False, f"본체 없음: {BODY}")])
    raw = BODY.read_bytes()
    text = raw.decode("utf-8")
    size = len(raw)
    three, blocks, rest = split_body(text)

    # 0) 구조: 4줄 no-zoom.js, three 덩어리 1개, 게임 코드 덩어리마다 모듈 표시, boot 가 마지막
    lines4 = text.split("\n", 5)[:5]
    nz = len(lines4) >= 4 and "/_shared/no-zoom.js" in lines4[3]
    notes.append((nz, "4줄에 /_shared/no-zoom.js"))
    ok &= nz
    t_ok = len(three) == 1
    notes.append((t_ok, f"three 덩어리 1개(찾은 수 {len(three)}{', ' + str(three[0]['line']) + '줄~' if three else ''})"))
    ok &= t_ok
    if three:
        before = all(b["line"] > three[0]["line"] for b in blocks)
        notes.append((before, "three 덩어리가 게임 코드보다 앞"))
        ok &= before
    unmarked = [b for b in blocks if not b["module"]]
    notes.append((not unmarked, "게임 코드 덩어리마다 첫 줄 모듈 표시" + (f" — 표시 없음: {[b['line'] for b in unmarked]}" if unmarked else "")))
    ok &= not unmarked
    names = [b["module"] for b in blocks if b["module"]]
    dup = sorted({n for n in names if names.count(n) > 1})
    notes.append((not dup, "모듈 이름 겹침 없음" + (f" — {dup}" if dup else "")))
    ok &= not dup
    last_boot = bool(names) and names[-1] == "boot"
    notes.append((last_boot, "boot 모듈이 마지막"))
    ok &= last_boot

    # 1) 문법 — 덩어리마다 node --check
    syntax_err = []
    with tempfile.TemporaryDirectory(prefix="fogisle-lint-") as td:
        for k, b in enumerate(blocks):
            p = pathlib.Path(td) / f"b{k:02d}_{b['module'] or 'x'}.js"
            p.write_text(b["code"], encoding="utf-8")
            r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
            if r.returncode != 0:
                msg = (r.stderr or r.stdout).strip().splitlines()
                syntax_err.append(f"{b['module']}({b['line']}줄~): " + " / ".join(x[:160] for x in msg[:4]))
    notes.append((not syntax_err, f"문법 node --check {len(blocks)}덩어리" + ("" if not syntax_err else " — " + " | ".join(syntax_err))))
    ok &= not syntax_err

    # 2) 금지 문자열(three 덩어리 제외)
    hits = []
    for label, pat in BANNED_STRINGS:
        for m in re.finditer(pat, rest):
            hits.append(f"{label}@{line_of(rest, m.start())}")
    # localStorage 키 접두 — 게임 키는 core 의 FG.GAME.key 에서 읽는다
    km = re.search(r"FG\.GAME\s*=\s*Object\.freeze\(\{\s*key:\s*'([a-z0-9_-]+)'", rest)
    gkey = km.group(1) if km else "fogisle"
    for m in re.finditer(r"localStorage\.(setItem|getItem|removeItem)\(\s*(['\"`])([^'\"`]*)", rest):
        if not m.group(3).startswith(gkey + "."):
            hits.append(f"localStorage 키 접두 없음 '{m.group(3)[:30]}'@{line_of(rest, m.start())}")
    if re.search(r"<select\b", rest, re.I) and not re.search(r"appearance\s*:\s*none", rest):
        hits.append("select 에 appearance:none 없음")
    notes.append((not hits, "금지 문자열 0" + ("" if not hits else " — " + ", ".join(hits[:20]))))
    ok &= not hits

    # 3) 금지어(대소문자 무시)
    words = []
    low = rest.lower()
    for w in BANNED_WORDS_LATIN:
        for m in re.finditer(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])", low):
            words.append(f"{w}@{line_of(rest, m.start())}")
    for w in BANNED_WORDS_HANGUL:
        for m in re.finditer(re.escape(w), rest):
            words.append(f"{w}@{line_of(rest, m.start())}")
    notes.append((not words, f"금지어 0(목록 {len(BANNED_WORDS_LATIN) + len(BANNED_WORDS_HANGUL)}개)" + ("" if not words else " — " + ", ".join(words[:20]))))
    ok &= not words

    # 4) sim 모듈 안 Math.random · performance.now · document.
    sim_hits = []
    sim_found = []
    for b in blocks:
        if b["module"] in SIM_MODULES:
            sim_found.append(b["module"])
            for label, pat in SIM_BANNED:
                for m in re.finditer(pat, b["code"]):
                    sim_hits.append(f"{b['module']}:{label}@{b['line'] + b['code'].count(chr(10), 0, m.start())}")
    notes.append((not sim_hits, f"sim 모듈 규칙(검사한 sim 모듈 {sim_found or '아직 없음'})" + ("" if not sim_hits else " — " + ", ".join(sim_hits[:20]))))
    ok &= not sim_hits

    # 5) 크기
    game_code = sum(len(b["code"].encode("utf-8")) for b in blocks)
    warn = []
    if size > SIZE_WARN:
        warn.append(f"본체 {size / 1048576:.2f}MB > 1.6MB — 임무 자료 분리를 사용자에게 물을 것")
    if game_code > GAME_CODE_WARN:
        warn.append(f"게임 코드 {game_code / 1024:.0f}KB > 800KB — 분리를 사용자에게 물을 것")
    for w in warn:
        print("  !!  " + w)
    notes.append((True, f"크기 본체 {size / 1024:.0f}KB · 게임 코드 {game_code / 1024:.1f}KB · 모듈 {names}"))

    return finish("lint", ok, {"bytes": size, "game_code_bytes": game_code, "modules": names,
                               "three_line": three[0]["line"] if three else None, "warnings": warn,
                               "syntax_errors": len(syntax_err), "banned": len(hits) + len(words), "sim_hits": len(sim_hits)}, notes)


# ───────────────────────────── 브라우저 ─────────────────────────────

FAKE_LUCIDE = "window.lucide={createIcons:function(){},icons:{}};"
HK_SPY = """(() => {
  window.__hkSeen = [];
  window.addEventListener('message', (e) => {
    const d = e.data; if (d && typeof d.type === 'string' && d.type.indexOf('hk:') === 0) window.__hkSeen.push(d.type);
  });
})();"""


class Session:
    """헤드리스 크롬 한 판 — route · 오류 수집을 맡는다."""

    def __init__(self, pw, viewport=(1280, 720)):
        self.browser = pw.chromium.launch(headless=True, args=[
            "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        self.viewport = viewport
        self.ctx = None

    def page(self, init_scripts=()):
        if self.ctx:
            self.ctx.close()
        self.ctx = self.browser.new_context(viewport={"width": self.viewport[0], "height": self.viewport[1]}, device_scale_factor=1)
        for s in init_scripts:
            self.ctx.add_init_script(s)
        pg = self.ctx.new_page()
        self.errors = []      # pageerror + console.error
        self.external = []    # 막은 바깥 요청
        self.missing = []     # hk.test 에서 없는 파일
        self.api = []         # /api/** 요청(메서드 · 경로 · 본문)
        pg.on("pageerror", lambda e: self.errors.append("pageerror: " + str(e)[:300]))
        pg.on("console", lambda m: self.errors.append("console.error: " + m.text[:300]) if m.type == "error" else None)
        # 나중에 등록한 route 가 먼저 — 바깥 막기를 먼저 깔고 그 위에 hk.test · unpkg
        pg.route("**/*", self._block)
        pg.route("https://unpkg.com/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE_LUCIDE))
        pg.route(HOST + "/**", self._serve)
        self.pg = pg
        return pg

    def _block(self, route):
        u = route.request.url
        if u.startswith("data:") or u.startswith("blob:"):
            return route.continue_()
        self.external.append(u[:200])
        return route.abort()

    def _serve(self, route):
        req = route.request
        path = req.url.split("?")[0].split("#")[0].replace(HOST, "")
        if path == PARENT_PATH:  # 가짜 부모 창(하네스가 직접 돌려줌 — 저장소에 시험용 HTML 을 두지 않음)
            return route.fulfill(status=200, content_type="text/html; charset=utf-8", body=PARENT_HTML)
        if path.startswith("/api/"):
            self.api.append({"method": req.method, "path": path, "body": req.post_data})
            return route.fulfill(status=200, content_type="application/json", body='{"data":{}}')
        p = (WEB / path.lstrip("/")).resolve()
        if WEB.resolve() not in p.parents or not p.is_file():
            self.missing.append(path)
            return route.fulfill(status=404, body="")
        ctype = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
        if p.suffix == ".woff2":
            ctype = "font/woff2"
        return route.fulfill(status=200, content_type=ctype, body=p.read_bytes())

    def close(self):
        try:
            if self.ctx:
                self.ctx.close()
        finally:
            self.browser.close()


def wait_ready(pg, timeout_ms=5000):
    """__fps.ready 를 기다린다 → (ok, 걸린 ms)."""
    t0 = time.time()
    try:
        pg.wait_for_function("() => !!(window.__fps && window.__fps.ready)", timeout=timeout_ms)
        left = max(100, timeout_ms - int((time.time() - t0) * 1000))
        val = pg.evaluate("""(ms) => Promise.race([
            window.__fps.ready.then(v => ({v: v})),
            new Promise(r => setTimeout(() => r({timeout: true}), ms))])""", left)
        ok = bool(val.get("v")) and not val.get("timeout")
    except Exception as e:  # noqa: BLE001
        print("  ..  ready 대기 실패: " + str(e)[:200])
        ok = False
    return ok, int((time.time() - t0) * 1000)


def image_spread(path):
    """스크린샷이 한 색으로만 칠해졌는지(그림이 안 나옴) — 밝기 표준편차를 돌려준다."""
    try:
        from PIL import Image, ImageStat
    except Exception:  # noqa: BLE001
        return None
    im = Image.open(path).convert("L").resize((160, 90))
    return round(ImageStat.Stat(im).stddev[0], 2)


# ───────────────────────────── smoke ─────────────────────────────

def cmd_smoke(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {}
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            # 1) 단독으로 열기
            pg = s.page([HK_SPY])
            t0 = time.time()
            pg.goto(HOST + BODY_URL, wait_until="load")
            load_ms = int((time.time() - t0) * 1000)
            r_ok, r_ms = wait_ready(pg, 5000)
            notes.append((r_ok, f"__fps.ready 5초 안(대기 {r_ms}ms · 불러오기 {load_ms}ms)"))
            ok &= r_ok
            pg.wait_for_timeout(1200)  # 몇 프레임 그리기
            info = pg.evaluate("""() => ({
                rev: window.THREE ? window.THREE.REVISION : null,
                st: window.__fps ? window.__fps.state() : null,
                perf: window.__fps ? window.__fps.perf() : null,
                hkEv: window.__fps ? window.__fps.events().filter(e => e.type === 'hk').length : -1,
                hkSeen: (window.__hkSeen || []).slice(),
                title: document.title,
                game: window.FG ? {key: FG.GAME.key, title: FG.GAME.title, logo: FG.GAME.logo, prefix: FG.STORE_PREFIX} : null,
                logo: (document.getElementById('titleName') || {}).textContent || '',
                titleOn: (() => { const t = document.getElementById('scrTitle'); return !!t && getComputedStyle(t).display !== 'none'; })(),
                btn: (() => { const b = document.getElementById('btnSortie'); if (!b) return null;
                               const r = b.getBoundingClientRect(); return {text: b.textContent.trim(), w: r.width, h: r.height}; })(),
                fatalOn: (() => { const f = document.getElementById('fatal'); return !!f && getComputedStyle(f).display !== 'none'; })(),
                fontOk: document.fonts ? document.fonts.check('700 20px Pretendard') : null,
            })""")
            summary.update({"three": info["rev"], "phase": (info["st"] or {}).get("phase"), "perf": info["perf"], "game": info["game"]})
            c = info["rev"] == "160"
            notes.append((c, f"THREE.REVISION === '160' (값 {info['rev']!r})")); ok &= c
            c = bool(info["st"]) and info["st"]["phase"] == "title" and info["st"]["gfx"]
            notes.append((c, f"phase title · 그리기 준비(state {info['st']})")); ok &= c
            c = info["titleOn"] and not info["fatalOn"] and info["btn"] and info["btn"]["text"] == "출격 준비" and info["btn"]["w"] > 40
            notes.append((c, f"타이틀 화면 · 「출격 준비」 단추 보임 · 실패 안내 숨김(btn {info['btn']})")); ok &= c
            g = info["game"] or {}
            c = bool(g) and info["title"] == g.get("title") and info["logo"] == g.get("logo") and g.get("prefix") == g.get("key", "") + "."
            notes.append((c, f"이름 · 키 한 곳(FG.GAME) — 문서 제목 {info['title']!r} · 로고 {info['logo']!r} · 저장 접두 {g.get('prefix')!r}")); ok &= c
            c = info["hkEv"] == 0 and not info["hkSeen"]
            notes.append((c, f"단독 열기라 hk 신호 안 보냄(사건 {info['hkEv']} · 받은 메시지 {info['hkSeen']})")); ok &= c
            p = info["perf"] or {}
            c = p.get("frames", 0) > 10 and p.get("calls", 0) > 0
            notes.append((c, f"그리기 고리 돎(프레임 {p.get('frames')} · 호출 {p.get('calls')} · 삼각형 {p.get('tris')} · 중앙값 {p.get('ftMed')}ms)")); ok &= c
            notes.append((True, f"Pretendard 글꼴 확인 {info['fontOk']}"))
            shot = out / "smoke-title.png"
            pg.screenshot(path=str(shot))
            spread = image_spread(shot)
            c = spread is None or spread > 4
            notes.append((c, f"타이틀 스크린샷 {shot} (밝기 퍼짐 {spread})")); ok &= c
            summary["shot"] = str(shot)
            c = not s.errors
            notes.append((c, "오류 0(pageerror · console.error)" + ("" if c else " — " + " | ".join(s.errors[:6])))); ok &= c
            c = not s.external
            notes.append((c, "바깥 요청 0" + ("" if c else " — " + ", ".join(s.external[:6])))); ok &= c
            c = not s.missing
            notes.append((c, "없는 파일 요청 0" + ("" if c else " — " + ", ".join(s.missing[:6])))); ok &= c
            summary["errors"] = len(s.errors)

            # 2) ?hk=1(아케이드 표시, dev 없음) — 손잡이 없음 · 오류 0
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL + "?hk=1", wait_until="load")
            pg.wait_for_function("() => window.FG && FG.game && FG.game.phase !== 'boot'", timeout=5000)
            pg.wait_for_timeout(300)
            v = pg.evaluate("() => ({fps: typeof window.__fps, phase: FG.game.phase, seen: (window.__hkSeen||[]).slice()})")
            c = v["fps"] == "undefined" and v["phase"] == "title" and not v["seen"] and not s.errors
            notes.append((c, f"?hk=1 단독: __fps 없음 · phase title · hk 신호 없음(부모 없음) · 오류 0 ({v}, 오류 {s.errors[:3]})")); ok &= c

            # 3) ?hk=1&dev=1 — 손잡이 있음
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL + "?hk=1&dev=1", wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            c = r_ok and not s.errors
            notes.append((c, "?hk=1&dev=1: __fps 있음 · ready" + ("" if not s.errors else f" — {s.errors[:3]}"))); ok &= c
        finally:
            s.close()
    return finish("smoke", ok, summary, notes)


# ───────────────────────────── arcade --frame ─────────────────────────────

PARENT_PATH = "/__parent.html"
# 가짜 부모 창 — hk-embed.js 와 같은 sandbox · allow 속성의 iframe, 받은 신호 기록, hk-embed 의 paused 규칙과 play.js togglePause 흉내.
PARENT_HTML = """<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>가짜 부모</title>
<style>body{margin:0;background:#0f172a;color:#cbd5e1;font:13px system-ui}#bar{height:40px;display:flex;gap:8px;align-items:center;padding:0 10px}
#f{display:block;width:1200px;height:660px;border:0}</style></head><body>
<div id="bar"><button id="bPause" type="button">pause</button><button id="bResume" type="button">resume</button><button id="bRestart" type="button">restart</button><span id="log"></span></div>
<iframe id="f" title="게임" src="/games/embed/fogisle.html?hk=1&dev=1" allow="autoplay; fullscreen; gamepad"
  sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms" referrerpolicy="no-referrer"></iframe>
<script>
(() => {
  const f = document.getElementById('f');
  const origin = location.origin;
  let paused = false;
  window.__got = []; window.__sent = [];
  const send = (type) => { window.__sent.push(type); try { f.contentWindow.postMessage({ type }, origin); } catch (_) {} };
  f.addEventListener('load', () => send('hk:hello'));
  window.addEventListener('message', (e) => {
    if (e.origin !== origin || e.source !== f.contentWindow) return;
    const m = e.data && typeof e.data === 'object' ? e.data : {};
    window.__got.push(m.type);
    document.getElementById('log').textContent = window.__got.join(' ');
    if (m.type === 'hk:ready') return send('hk:hello');
    if (m.type === 'hk:paused') { paused = true; return; }
    if (m.type === 'hk:resumed') { paused = false; return; }
    if (m.type === 'hk:esc') return togglePause();
  });
  const pauseFn = () => { paused = true; send('hk:pause'); };
  const resumeFn = () => { if (!paused) return false; paused = false; send('hk:resume'); return true; };
  const togglePause = () => { if (!resumeFn()) pauseFn(); };
  document.getElementById('bPause').onclick = pauseFn;
  document.getElementById('bResume').onclick = () => resumeFn();
  document.getElementById('bRestart').onclick = () => { paused = false; send('hk:restart'); };
  window.__parentPaused = () => paused;
})();
</script></body></html>"""

ST = "() => window.__fps.state()"


def _phase_wait(fr, phase, ms=1500):
    try:
        fr.wait_for_function("(p) => window.__fps && window.__fps.state().phase === p", arg=phase, timeout=ms)
        return True
    except Exception:  # noqa: BLE001
        return False


def _check(notes, cond, text):
    notes.append((bool(cond), text))
    return bool(cond)


def _standalone(s, out, notes, summary):
    """단독으로 열기 — 출격 · 대체 조작 끌기 · Space · 고리 손잡이 · Esc/blur/잠금 풀림 멈춤 · 멈춤 중 Space(no-zoom 「계속하기」)."""
    ok = True
    pg = s.page([HK_SPY])
    pg.goto(HOST + BODY_URL, wait_until="load")
    r_ok, _ = wait_ready(pg, 5000)
    ok &= _check(notes, r_ok, "[단독] __fps.ready")
    pg.click("#btnSortie")
    ok &= _check(notes, _phase_wait(pg, "play"), "[단독] 「출격 준비」 클릭 → phase play")
    pg.wait_for_timeout(400)  # 헤드리스는 잠금 실패 → 대체 조작
    v = pg.evaluate("""() => ({st: __fps.state(), active: document.activeElement && document.activeElement.id,
        hint: (document.getElementById('hint')||{}).textContent || '', hintOn: document.getElementById('hint').classList.contains('on'),
        titleOn: getComputedStyle(document.getElementById('scrTitle')).display, pauseOn: getComputedStyle(document.getElementById('scrPause')).display})""")
    st = v["st"]
    ok &= _check(notes, st["fallback"] and not st["locked"] and v["hintOn"] and "끌어서" in v["hint"],
                 f"[단독] 헤드리스 잠금 실패 → 대체 조작 + 안내 한 줄(fallback {st['fallback']} · 안내 {v['hint']!r})")
    ok &= _check(notes, v["active"] == "gl" and v["titleOn"] == "none" and v["pauseOn"] == "none",
                 f"[단독] 초점 규칙: 초점 {v['active']!r} · 타이틀 {v['titleOn']} · 덮개 {v['pauseOn']}")
    # 출격 직후 Space — 덮개 · 단추가 다시 눌리지 않음, 화면 안 밀림
    pg.keyboard.press("Space")
    pg.wait_for_timeout(250)
    v = pg.evaluate("() => ({st: __fps.state(), sy: window.scrollY, pz: getComputedStyle(document.getElementById('scrPause')).display})")
    ok &= _check(notes, v["st"]["phase"] == "play" and v["st"]["ui"]["sortieCount"] == 1 and v["st"]["ui"]["resumeClicks"] == 0 and v["pz"] == "none" and v["sy"] == 0,
                 f"[단독] 출격 직후 Space → 그대로 play · 출격 1번 · 덮개 안 뜸({v['st']['phase']}, 출격 {v['st']['ui']['sortieCount']}, 덮개 {v['pz']})")
    # 대체 조작: 누른 채 끌어서 시점
    y0 = pg.evaluate(ST)
    pg.mouse.move(640, 360)
    pg.mouse.down()
    pg.mouse.move(840, 330, steps=12)
    pg.mouse.up()
    pg.wait_for_timeout(120)
    y1 = pg.evaluate(ST)
    dyaw = y1["yaw"] - y0["yaw"]
    dpitch = y1["pitch"] - y0["pitch"]
    ok &= _check(notes, dyaw > 10 and dpitch > 1 and y1["phase"] == "play",
                 f"[단독] 끌어서 둘러보기: 오른쪽 200px → yaw +{dyaw:.1f}° · 위 30px → pitch +{dpitch:.1f}°")
    summary["drag_yaw_deg"] = round(dyaw, 2)
    # 키 입력 → 입력 표(e.code)
    pg.keyboard.down("KeyW"); pg.keyboard.down("ShiftLeft")
    pg.wait_for_timeout(120)
    v = pg.evaluate(ST)
    pg.keyboard.up("KeyW"); pg.keyboard.up("ShiftLeft")
    pg.wait_for_timeout(80)
    v2 = pg.evaluate(ST)
    ok &= _check(notes, v["input"]["moveZ"] == 1 and v["input"]["sprint"] and v2["input"]["moveZ"] == 0 and not v2["input"]["sprint"],
                 f"[단독] W · Shift → 입력 표 moveZ {v['input']['moveZ']} · sprint {v['input']['sprint']} → 뗀 뒤 {v2['input']['moveZ']}")
    shot = out / "arcade-standalone-play.png"
    pg.screenshot(path=str(shot))
    summary["shot_play"] = str(shot)
    # 고리 손잡이: pauseLoop · step · resumeLoop · fast · setInput · look · turn
    v = pg.evaluate("""async () => {
        const F = window.__fps; const r = {};
        F.pauseLoop(); const t0 = F.state().time; await new Promise(z => setTimeout(z, 300)); r.held = F.state().time - t0;
        const n = F.step(1); r.stepN = n; r.stepDt = +(F.state().time - t0).toFixed(6);
        F.setInput({moveZ: -1, jump: true}); F.step(1/60); r.inp = F.state().input; F.clearInput(); F.step(1/60); r.inp2 = F.state().input;
        F.resumeLoop(); const t1 = F.state().time; await new Promise(z => setTimeout(z, 500)); r.normal = F.state().time - t1;
        F.fast(8, 8); const t2 = F.state().time; const fr0 = F.state().loop.frames; await new Promise(z => setTimeout(z, 500));
        r.fast = F.state().time - t2; r.fastFrames = F.state().loop.frames - fr0; F.fast(1, 1);
        r.look = F.look(30, -10); r.turn = F.turn(15, 5); r.tainted = F.state().tainted;
        return r; }""")
    ok &= _check(notes, v["held"] == 0 and v["stepN"] == 60 and abs(v["stepDt"] - 1) < 1e-6,
                 f"[단독] pauseLoop 중 시간 멈춤({v['held']}) · step(1) = 60단계 · 시간 +{v['stepDt']}")
    ok &= _check(notes, v["inp"]["moveZ"] == -1 and v["inp"]["jump"] and v["inp2"]["moveZ"] == 0 and not v["inp2"]["jump"],
                 f"[단독] setInput 이 입력 표를 덮어씀 → clearInput 으로 풂({v['inp']['moveZ']}/{v['inp']['jump']} → {v['inp2']['moveZ']}/{v['inp2']['jump']})")
    ok &= _check(notes, v["fast"] > v["normal"] * 4 and v["normal"] > 0.3,
                 f"[단독] fast(8): 0.5초 동안 sim {v['fast']:.2f}초(보통 {v['normal']:.2f}초) — 상한 4번에 안 막힘")
    ok &= _check(notes, abs(v["look"]["yaw"] - 30) < 1e-3 and abs(v["look"]["pitch"] + 10) < 1e-3 and abs(v["turn"]["yaw"] - 45) < 1e-3 and abs(v["turn"]["pitch"] + 5) < 1e-3 and v["tainted"],
                 f"[단독] look(30,-10) → {v['look']} · turn(15,5) → {v['turn']} · tainted {v['tainted']}")
    summary["fast_sim_sec_in_0.5s"] = round(v["fast"], 2)
    # Esc(잠금 없는 놀이) → 멈춤
    pg.keyboard.press("Escape")
    ok &= _check(notes, _phase_wait(pg, "paused") and pg.evaluate(ST)["pauseWhy"] == "esc", "[단독] 대체 조작 중 Esc → 멈춤")
    shot = out / "arcade-standalone-paused.png"
    pg.screenshot(path=str(shot))
    summary["shot_paused"] = str(shot)
    pg.keyboard.press("Escape")  # 단독 멈춤 중 Esc 는 덮개 그대로
    pg.wait_for_timeout(150)
    ok &= _check(notes, pg.evaluate(ST)["phase"] == "paused", "[단독] 멈춤 중 Esc → 덮개 그대로(단독은 부모 없음)")
    pg.click("#scrPause", position={"x": 60, "y": 60})
    ok &= _check(notes, _phase_wait(pg, "play"), "[단독] 덮개 클릭 → play")
    # blur → 멈춤 + 키 비우기
    pg.keyboard.down("KeyD")
    pg.wait_for_timeout(60)
    pg.evaluate("() => window.dispatchEvent(new Event('blur'))")
    pg.keyboard.up("KeyD")
    v = pg.evaluate(ST)
    ok &= _check(notes, v["phase"] == "paused" and v["pauseWhy"] == "blur", f"[단독] 창 blur → 멈춤({v['phase']}, {v['pauseWhy']})")
    pg.click("#btnResume")
    ok &= _check(notes, _phase_wait(pg, "play") and pg.evaluate("() => document.activeElement.id") == "gl", "[단독] 「계속하기」 클릭 → play · 초점 캔버스")
    # simulateLockLost → 멈춤, 그 뒤 멈춤 중 Space → no-zoom.js 가 「계속하기」 누름(대체 조작이라 바로 이어 감)
    pg.evaluate("() => __fps.simulateLockLost()")
    ok &= _check(notes, pg.evaluate(ST)["phase"] == "paused", "[단독] simulateLockLost → 멈춤")
    pg.wait_for_timeout(450)
    pg.keyboard.press("Space")
    ok &= _check(notes, _phase_wait(pg, "play", 1500), "[단독] 멈춤 중 Space → no-zoom.js 가 「계속하기」를 눌러 play")
    ok &= _check(notes, pg.evaluate("() => window.__fps.events().filter(e => e.type === 'hk').length") == 0 and not pg.evaluate("() => window.__hkSeen.length"),
                 "[단독] 단독이라 hk 신호 0")
    ok &= _check(notes, not s.errors and not s.external and not s.missing,
                 f"[단독] 오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
    return ok


def cmd_arcade(args):
    if not getattr(args, "frame", False):
        print("arcade(점수 신호 · tainted 포함)는 S9 에서 더한다 — 지금은 --frame 만")
        return finish("arcade", False, {"error": "--frame 만 있음"}, [])
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {}
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            ok &= _standalone(s, out, notes, summary)

            # ── 가짜 부모 창 안(hk-embed.js 와 같은 sandbox · allow) ──
            pg = s.page()
            pg.goto(HOST + PARENT_PATH, wait_until="load")
            fr = pg.query_selector("#f").content_frame()
            fl = pg.frame_locator("#f")
            r_ok = False
            try:
                fr.wait_for_function("() => !!(window.__fps && window.__fps.ready)", timeout=5000)
                r_ok = bool(fr.evaluate("() => window.__fps.ready"))
            except Exception as e:  # noqa: BLE001
                notes.append((False, "[창] ready 대기 실패 " + str(e)[:160]))
            ok &= _check(notes, r_ok, "[창] 창 안 본체 ready(?hk=1&dev=1)")
            pg.wait_for_timeout(300)
            got = lambda: pg.evaluate("() => window.__got.slice()")  # noqa: E731
            sent = lambda: pg.evaluate("() => window.__sent.slice()")  # noqa: E731
            g = got()
            inhk = fr.evaluate("() => document.documentElement.classList.contains('in-hk') && __fps.state().inHk")
            ok &= _check(notes, g == ["hk:ready"] and inhk, f"[창] hk:ready 1번 → 부모 hk:hello → html.in-hk ({g}, in-hk {inhk})")

            fl.locator("#btnSortie").click()
            ok &= _check(notes, _phase_wait(fr, "play"), "[창] 「출격 준비」 클릭 → play")
            pg.wait_for_timeout(350)
            pg.keyboard.press("Space")
            pg.wait_for_timeout(200)
            v = fr.evaluate(ST)
            ok &= _check(notes, v["phase"] == "play" and v["ui"]["sortieCount"] == 1 and v["fallback"] and fr.evaluate("() => document.activeElement.id") == "gl",
                         f"[창] 출격 직후 Space → play 그대로 · 출격 1번 · 초점 캔버스 · 대체 조작 {v['fallback']}")
            y0 = v["yaw"]
            pg.mouse.move(600, 380); pg.mouse.down(); pg.mouse.move(760, 380, steps=10); pg.mouse.up()
            pg.wait_for_timeout(100)
            y1 = fr.evaluate(ST)["yaw"]
            ok &= _check(notes, y1 - y0 > 10, f"[창] 창 안에서도 끌어서 시점 돎(yaw +{y1 - y0:.1f}°)")
            ok &= _check(notes, got() == ["hk:ready"], f"[창] 놀이 시작까지 점수 신호 · 멈춤 신호 없음({got()})")

            # 1) 잠금 풀림 → 멈춤 + hk:paused 1번, 400ms 안 Esc 는 무시
            mark = len(got())
            fr.evaluate("() => __fps.simulateLockLost()")
            pg.keyboard.press("Escape")  # 풀린 직후 같은 Esc(무시돼야 함)
            pg.wait_for_timeout(300)
            v = fr.evaluate(ST)
            ok &= _check(notes, v["phase"] == "paused" and got()[mark:] == ["hk:paused"],
                         f"[창] simulateLockLost → paused + hk:paused 1번 · 400ms 안 Esc 무시({got()[mark:]})")
            # 2) 멈춤 중 Esc → hk:esc → 부모 togglePause → hk:resume → 「클릭하면 이어서」 + hk:paused 다시
            pg.wait_for_timeout(200)
            mark = len(got()); smark = len(sent())
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(300)
            v = fr.evaluate("() => ({st: __fps.state(), clickOn: getComputedStyle(document.querySelector('#scrPause .pz-click')).display, txt: document.querySelector('#scrPause .pz-click').textContent})")
            ok &= _check(notes, got()[mark:] == ["hk:esc", "hk:paused"] and sent()[smark:] == ["hk:resume"] and v["st"]["phase"] == "paused" and v["st"]["ui"]["pauseMode"] == "click" and v["clickOn"] != "none",
                         f"[창] 멈춤 중 Esc → hk:esc → 부모 hk:resume → 덮개 「{v['txt']}」 + hk:paused 재송신({got()[mark:]}, 부모 보냄 {sent()[smark:]})")
            shot = out / "arcade-frame-click-to-resume.png"
            pg.screenshot(path=str(shot))
            summary["shot_frame"] = str(shot)
            # 3) 덮개 클릭 → play + hk:resumed
            mark = len(got())
            fl.locator("#scrPause").click(position={"x": 80, "y": 80})
            ok &= _check(notes, _phase_wait(fr, "play"), "[창] 덮개 클릭 → play")
            pg.wait_for_timeout(150)
            ok &= _check(notes, got()[mark:] == ["hk:resumed"] and not pg.evaluate("() => window.__parentPaused()"),
                         f"[창] → hk:resumed · 부모 멈춤 표시 꺼짐({got()[mark:]})")
            # 4) 부모 hk:pause → paused + hk:paused, hk:resume → 「클릭하면 이어서」 + hk:paused 재송신, 덮개 클릭 → play + hk:resumed
            mark = len(got())
            pg.evaluate("() => document.getElementById('bPause').click()")
            ok &= _check(notes, _phase_wait(fr, "paused") and fr.evaluate(ST)["pauseWhy"] == "parent", "[창] 부모 hk:pause → paused")
            pg.wait_for_timeout(150)
            pg.evaluate("() => document.getElementById('bResume').click()")
            pg.wait_for_timeout(200)
            v = fr.evaluate(ST)
            ok &= _check(notes, v["phase"] == "paused" and v["ui"]["pauseMode"] == "click" and got()[mark:] == ["hk:paused", "hk:paused"],
                         f"[창] 부모 hk:resume → 멈춤 그대로 · 「클릭하면 이어서」 · hk:paused 재송신({got()[mark:]})")
            mark = len(got())
            fl.locator("#btnResume").click()
            ok &= _check(notes, _phase_wait(fr, "play"), "[창] 「계속하기」 클릭 → play")
            pg.wait_for_timeout(150)
            ok &= _check(notes, got()[mark:] == ["hk:resumed"], f"[창] → hk:resumed({got()[mark:]})")
            # 5) 멈춤 중 Space → no-zoom.js 가 「계속하기」를 누름(헤드리스는 대체 조작이라 바로 이어 감)
            mark = len(got())
            pg.evaluate("() => document.getElementById('bPause').click()")
            _phase_wait(fr, "paused")
            pg.wait_for_timeout(150)
            pg.keyboard.press("Space")
            ok &= _check(notes, _phase_wait(fr, "play"), "[창] 멈춤 중 Space → 「계속하기」 → play")
            pg.wait_for_timeout(150)
            ok &= _check(notes, got()[mark:] == ["hk:paused", "hk:resumed"], f"[창] 신호 hk:paused → hk:resumed({got()[mark:]})")
            # 6) 창 blur → 멈춤 + hk:paused
            mark = len(got())
            fr.evaluate("() => window.dispatchEvent(new Event('blur'))")
            pg.wait_for_timeout(150)
            ok &= _check(notes, fr.evaluate(ST)["phase"] == "paused" and got()[mark:] == ["hk:paused"], f"[창] 창 blur → 멈춤 + hk:paused({got()[mark:]})")
            fl.locator("#scrPause").click(position={"x": 80, "y": 80})
            _phase_wait(fr, "play")
            pg.wait_for_timeout(150)
            # 7) 출처 검사 — 부모가 아닌 곳(자기 자신)이 보낸 hk:restart 는 무시
            fr.evaluate("() => window.postMessage({type: 'hk:restart'}, '*')")
            pg.wait_for_timeout(150)
            ok &= _check(notes, fr.evaluate(ST)["phase"] == "play", "[창] 부모가 아닌 창이 보낸 hk:restart 무시(출처 · 보낸 창 검사)")
            # 8) 부모 hk:restart → 타이틀
            pg.evaluate("() => document.getElementById('bRestart').click()")
            ok &= _check(notes, _phase_wait(fr, "title"), "[창] 부모 hk:restart → 타이틀(S9 부터 임무 고르기)")
            v = fr.evaluate("() => ({pz: getComputedStyle(document.getElementById('scrPause')).display, t: getComputedStyle(document.getElementById('scrTitle')).display})")
            ok &= _check(notes, v["pz"] == "none" and v["t"] != "none", f"[창] 덮개 숨김(display {v['pz']}) · 타이틀 보임")

            # 전체 순서 · 본체 기록과 부모 받은 것 일치 · 점수 신호 없음
            g = got()
            expect = ["hk:ready", "hk:paused", "hk:esc", "hk:paused", "hk:resumed", "hk:paused", "hk:paused", "hk:resumed",
                      "hk:paused", "hk:resumed", "hk:paused", "hk:resumed"]
            ok &= _check(notes, g == expect, f"[창] 신호 순서 {g}")
            body_hk = fr.evaluate("() => __fps.events().filter(e => e.type === 'hk').map(e => e.payload.type)")
            ok &= _check(notes, body_hk == g, "[창] 본체 사건 기록('hk')과 부모가 받은 것 일치")
            ok &= _check(notes, not any(x in ("hk:start", "hk:live", "hk:score") for x in g), "[창] 점수 신호(hk:start · live · score) 없음 — S9")
            summary["signals"] = g
            ok &= _check(notes, not s.errors and not s.external and not s.missing,
                         f"[창] 오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
        finally:
            s.close()
    return finish("arcade", ok, summary, notes)



# ───────────────────────────── move --basic ─────────────────────────────

# 페이지 안 도우미 — 시험 손잡이로 표식에 놓고 입력을 넣은 채 sim 을 0.1초씩 돌리며 위치 · 박힘을 모은다(그리기 없이, 결정적)
MOVE_JS = r"""(() => {
  const F = window.__fps;
  const settle = () => F.step(0.4);
  window.__mv = {
    put(mark, yaw) { F.clearInput(); F.teleportTo(mark); if (yaw !== undefined && yaw !== null) F.look(yaw, 0); settle(); return F.state(); },
    run(input, sec, every) {
      const dt = every || 0.1, out = [];
      F.setInput(input);
      const n = Math.round(sec / dt);
      let maxPen = 0;
      for (let k = 0; k < n; k++) {
        F.step(dt);
        const s = F.state(); const pen = F.pen();
        if (pen > maxPen) maxPen = pen;
        out.push({ pos: s.pos, vel: s.vel, ground: s.onGround, stance: s.stance, pen });
      }
      F.clearInput();
      return { samples: out, maxPen, end: F.state() };
    },
    hspeed(s) { return Math.hypot(s.vel[0], s.vel[2]); },
  };
  return true;
})()"""


def cmd_move(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {}
    R = 0.35
    TOL = 0.03
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL, wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            ok &= _check(notes, r_ok, "__fps.ready")
            w = pg.evaluate("() => __fps.world()")
            zs = (w.get("zones") or {}).get("t0") or {}
            summary["zone_t0"] = zs
            ok &= _check(notes, w["ready"] and w["tris"] > 100 and "player" in w["systems"] and w["spawn"] == "t0.spawn",
                         f"시험 구역 t0 충돌 자료 준비(삼각형 {w['tris']} · 동적 {w['dyn']} · sim 체계 {w['systems']})")
            ok &= _check(notes, zs.get("ms", 999) <= 50,
                         f"구역 만들기 {zs.get('ms')}ms ≤ 50ms(원시 {zs.get('prims')} · 그림 삼각형 {zs.get('visTris')} · 메시 {zs.get('meshes')} · 인스턴스 {zs.get('inst')})")
            ok &= _check(notes, zs.get("inst", 0) >= 7, f"같은 모양 7개 이상 인스턴싱(상자 {zs.get('inst')}개) — 충돌은 펼쳐서 넣음")
            # 맵 자료 확인
            v = pg.evaluate("""() => ({ good: __fps.validateZone(),
                bad: __fps.validateZone({ id: 'bad', size: [20, 20], pieces: [['nope', 0, 0, 0, 0, {}], ['wall', 40, 0, 0, 0, {}],
                  ['door', 0, 0, 0, 0, {id: 'x'}], ['door', 2, 0, 0, 0, {id: 'x'}], ['wall', 'a', 0, 0]],
                  marks: { far: [0, 0, 99] }, markList: [['far', 0, 0, 0]] }) })""")
            ok &= _check(notes, v["good"] == [] and len(v["bad"]) >= 5,
                         f"FG.map.validate: t0 오류 0 · 틀린 자료 오류 {len(v['bad'])}개 {v['bad']}")
            nav = pg.evaluate("() => ({ wall: __fps.navAt(-12.7, 7), open: __fps.navAt(0, 10), ramp: __fps.navAt(6, 8), roof: __fps.navAt(0, -11) })")
            ok &= _check(notes, nav["wall"]["blocked"] and not nav["open"]["blocked"] and 0.5 < nav["ramp"]["h"] < 1.5 and not nav["ramp"]["blocked"] and not nav["roof"]["blocked"],
                         f"길찾기 격자 칠하기: 벽 막힘 · 빈 곳 열림 · 경사판 높이 {nav['ramp']['h']} · 통로 천장 밑 열림")

            # 1) 실제 키 — 출격 → W 1초(시점 0 = -Z 앞)
            pg.click("#btnSortie")
            ok &= _check(notes, _phase_wait(pg, "play"), "「출격 준비」 → play")
            pg.wait_for_timeout(300)
            st0 = pg.evaluate(ST)
            ok &= _check(notes, st0["pos"] and abs(st0["pos"][0]) < 0.05 and abs(st0["pos"][2] - 14) < 0.05 and abs(st0["pos"][1]) < 0.05 and st0["onGround"],
                         f"출격 위치 = t0.spawn (0, 0, 14) · 바닥 위({st0['pos']}, onGround {st0['onGround']})")
            pg.keyboard.down("KeyW")
            pg.wait_for_timeout(1000)
            pg.keyboard.up("KeyW")
            pg.wait_for_timeout(250)
            st1 = pg.evaluate(ST)
            dz = st0["pos"][2] - st1["pos"][2]
            ok &= _check(notes, 2.5 < dz < 6.0 and abs(st1["pos"][0]) < 0.1, f"[실제 키] W 1초 → 앞(-Z)으로 {dz:.2f}m")
            shot = out / "move-play.png"
            pg.screenshot(path=str(shot))
            perf = pg.evaluate("() => __fps.perf()")
            summary["shot_play"] = str(shot)
            summary["play_calls"] = perf["calls"]
            ok &= _check(notes, 0 < perf["calls"] <= 40, f"놀이 화면 그리기 호출 {perf['calls']} ≤ 40 · 삼각형 {perf['tris']} · 프레임 중앙값 {perf['ftMed']}ms")

            # 이후는 고리를 붙잡고 sim 만(결정적). S4 부터 무기 이동 배율이 있어 이동 시험은 맨손(배율 1)으로 잰다
            pg.evaluate("() => { __fps.pauseLoop(); __fps.setLoadout({primary: null, secondary: null}); }")
            pg.evaluate(MOVE_JS)

            def put(mark, yaw=None):
                return pg.evaluate("([m, y]) => __mv.put(m, y)", [mark, yaw])

            def run(inp, sec, every=0.1):
                return pg.evaluate("([i, s, e]) => __mv.run(i, s, e)", [inp, sec, every])

            def press(name, settle=0.1):
                pg.evaluate("([n, t]) => { __fps.press(n); __fps.step(t); }", [name, settle])
                return pg.evaluate(ST)

            # 2) 앞 2초 → z 증가(표식 run 은 +Z 를 봄)
            a = put("t0.run")
            r = run({"moveZ": 1}, 2.0)
            e = r["end"]
            dz = e["pos"][2] - a["pos"][2]
            ok &= _check(notes, dz > 7.0 and abs(e["pos"][0] - a["pos"][0]) < 0.05 and abs(e["pos"][1]) < 0.02 and e["onGround"],
                         f"앞 2초 → z +{dz:.2f}m(걷기 4.5m/s · 가속 포함) · 높이 {e['pos'][1]} · 바닥 위")
            summary["walk2s_dz"] = round(dz, 3)

            # 3) 속도 — 걷기 · 달리기 · 앉기 · 엎드리기
            sp = {}
            put("t0.run"); r = run({"moveZ": 1}, 1.0); sp["walk"] = pg.evaluate("(s) => __mv.hspeed(s)", r["end"])
            put("t0.run"); r = run({"moveZ": 1, "sprint": True}, 1.0); sp["sprint"] = pg.evaluate("(s) => __mv.hspeed(s)", r["end"]); sp["sprintState"] = r["samples"][3]["stance"] + "/" + str(pg.evaluate(ST)["sprint"])
            put("t0.run"); st = press("crouch"); c_ok = st["stance"] == "crouch"; r = run({"moveZ": 1}, 1.0); sp["crouch"] = pg.evaluate("(s) => __mv.hspeed(s)", r["end"])
            put("t0.run"); press("crouch"); st = press("prone"); p_ok = st["stance"] == "prone"; r = run({"moveZ": 1}, 1.0); sp["prone"] = pg.evaluate("(s) => __mv.hspeed(s)", r["end"])
            press("prone")  # 일으켜 둠
            summary["speeds"] = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in sp.items()}
            ok &= _check(notes, abs(sp["walk"] - 4.5) < 0.05 and abs(sp["sprint"] - 6.75) < 0.05 and abs(sp["crouch"] - 2.7) < 0.05 and abs(sp["prone"] - 1.125) < 0.05 and c_ok and p_ok,
                         f"속도: 걷기 {sp['walk']:.2f} · 달리기(Shift) {sp['sprint']:.2f} · 앉기(C) {sp['crouch']:.2f} · 엎드리기(Z) {sp['prone']:.2f} m/s (기준 4.5 · 6.75 · 2.7 · 1.125)")
            # C 길게 → 엎드리기, Space → 일어서기
            put("t0.run")
            pg.evaluate("() => { __fps.setInput({crouch: true}); __fps.step(0.6); __fps.setInput({crouch: null}); __fps.step(0.1); }")
            st = pg.evaluate(ST)
            st2 = press("jump"); st3 = press("jump")
            ok &= _check(notes, st["stance"] == "prone" and st2["stance"] == "crouch" and st3["stance"] == "stand",
                         f"C 길게(0.4초) → 엎드리기({st['stance']}) · Space → 앉기({st2['stance']}) → 서기({st3['stance']})")

            # 4) 벽 · 모서리 · 좁은 통로 · 60° 모서리 — 3초 밀기
            def wall_case(label, mark, inp, sec, cond_fn, desc_fn):
                a = put(mark)
                r = run(inp, sec)
                e = r["end"]
                start_w = [a["pos"][0], 0.9, a["pos"][2]]
                end_w = [e["pos"][0], 0.9, e["pos"][2]]
                los = pg.evaluate("([a, b]) => __fps.los(a, b)", [start_w, end_w])
                c = cond_fn(e, r) and r["maxPen"] <= TOL and los
                return _check(notes, c, f"{label}: {desc_fn(e, r)} · 최대 박힘 {r['maxPen']}m · 지나온 길에 벽 없음 {los}")

            wn = -19.6 + R
            ok &= wall_case("북쪽 벽으로 3초(걷기)", "t0.wallN", {"moveZ": 1}, 3.0, lambda e, r: e["pos"][2] >= wn - TOL and abs(e["pos"][0] + 8) < 0.05,
                            lambda e, r: f"z {e['pos'][2]} ≥ {wn - TOL:.2f}")
            ok &= wall_case("북쪽 벽으로 3초(달리기 + 비스듬히)", "t0.wallN", {"moveZ": 1, "moveX": 0.5, "sprint": True}, 3.0,
                            lambda e, r: e["pos"][2] >= wn - TOL and e["pos"][0] > -8 + 2, lambda e, r: f"z {e['pos'][2]} · 벽 따라 미끄러짐 x {e['pos'][0]}")
            ce = 19.6 - R
            ok &= wall_case("북동 모서리로 3초(달리기)", "t0.cornerNE", {"moveZ": 1, "sprint": True}, 3.0,
                            lambda e, r: e["pos"][0] <= ce + TOL and e["pos"][2] >= -ce - TOL, lambda e, r: f"x {e['pos'][0]} ≤ {ce:.2f} · z {e['pos'][2]} ≥ {-ce:.2f}")
            for mx in (0.6, -0.6):
                a = put("t0.corridor")
                r = run({"moveZ": 1, "moveX": mx}, 3.0)
                inside = [x for x in r["samples"] if 4.4 <= x["pos"][2] <= 9.6]
                xs = [x["pos"][0] for x in inside]
                lo, hi = -12.5 + R - TOL, -11.5 - R + TOL
                c = len(inside) >= 5 and all(lo <= x <= hi for x in xs) and r["maxPen"] <= TOL
                ok &= _check(notes, c, f"좁은 통로(폭 1.0m) 비스듬히 3초(옆 {mx}): 통로 안 표본 {len(inside)}개 x {min(xs) if xs else None}~{max(xs) if xs else None} ⊂ [{lo:.2f}, {hi:.2f}] · 끝 z {r['end']['pos'][2]} · 최대 박힘 {r['maxPen']}m")
            ok &= wall_case("60° 좁은 모서리로 3초(달리기)", "t0.vee", {"moveZ": 1, "sprint": True}, 3.0,
                            lambda e, r: e["pos"][2] >= 3.0 - TOL and abs(e["pos"][0] - 12) < 0.1, lambda e, r: f"끝 ({e['pos'][0]}, {e['pos'][2]}) — 꼭짓점 안쪽 한계 z 3.0")
            ok &= wall_case("낮은 벽 0.9m 앞 2초(넘기는 S3)", "t0.lowWall", {"moveZ": 1}, 2.0,
                            lambda e, r: e["pos"][2] >= -4 + 0.15 + R - TOL and e["pos"][1] < 0.05, lambda e, r: f"z {e['pos'][2]} · 높이 {e['pos'][1]}(올라타지 않음)")
            ok &= wall_case("높은 벽 1.6m 앞 2초", "t0.highWall", {"moveZ": 1}, 2.0,
                            lambda e, r: e["pos"][2] >= -4 + 0.15 + R - TOL and e["pos"][1] < 0.05, lambda e, r: f"z {e['pos'][2]}")

            # 5) 경사판 · 계단 — 2초 걸어 1.5m 단 위로
            for mark, label in (("t0.ramp", "경사판"), ("t0.stairs", "계단(충돌은 경사판)")):
                put(mark)
                r = run({"moveZ": 1}, 2.0, 0.05)
                ys = [x["pos"][1] for x in r["samples"]]
                mono = all(ys[k + 1] >= ys[k] - 0.01 for k in range(len(ys) - 1))
                e = r["end"]
                c = e["pos"][1] >= 1.45 and e["onGround"] and mono and r["maxPen"] <= TOL and e["pos"][2] < 7
                ok &= _check(notes, c, f"{label} 2초: 높이 0 → {e['pos'][1]}m · z {e['pos'][2]} · 오르는 동안 높이가 줄지 않음 {mono} · 바닥 위 {e['onGround']} · 최대 박힘 {r['maxPen']}m")
            # 내리막: 단 위에서 뒤로 걸어 내려오기 — 바닥에 붙어 내려옴(공중 단계 적음)
            put("t0.ramp"); run({"moveZ": 1}, 2.0)
            pg.evaluate("() => { __fps.turn(180, 0); __fps.step(0.5); }")   # 오르던 관성이 멎은 뒤
            r = run({"moveZ": 1}, 2.0, 1 / 60)
            air = sum(1 for x in r["samples"] if not x["ground"])
            e = r["end"]
            ok &= _check(notes, e["pos"][1] < 0.05 and air <= 3, f"경사판 내려오기: 끝 높이 {e['pos'][1]} · 바닥에서 뜬 단계 {air}/{len(r['samples'])}(내리막 붙기)")

            # 6) 천장 낮은 통로 — 서서는 못 들어감, 앉아서 들어가 일어서기 거부
            a = put("t0.tunnel")
            r = run({"moveZ": 1}, 2.0)
            e = r["end"]
            ok &= _check(notes, e["pos"][2] >= -8 + R - TOL and r["maxPen"] <= TOL, f"천장 낮은 통로(1.3m): 서서는 입구에서 멈춤 z {e['pos'][2]} ≥ {-8 + R - TOL:.2f}")
            st = press("crouch")
            r = run({"moveZ": 1}, 1.2)
            e = r["end"]
            b0 = e["blocked"]
            st1 = press("crouch")
            st2 = press("jump")
            st3 = press("prone")
            st4 = press("prone")
            ev = pg.evaluate("() => __fps.events().filter(x => x.type === 'stanceBlocked').length")
            c = st["stance"] == "crouch" and e["pos"][2] <= -9.4 and st1["stance"] == "crouch" and st2["stance"] == "crouch" and st3["stance"] == "prone" and st4["stance"] == "crouch" and st4["blocked"] >= b0 + 3 and ev >= 3
            ok &= _check(notes, c, f"앉아서 통로 안(z {e['pos'][2]}) → C(서기) 거부 {st1['stance']} · Space 거부 {st2['stance']} · Z 엎드리기 {st3['stance']} · Z(서기 막힘 → 앉기) {st4['stance']} · 거절 {st4['blocked'] - b0}번 · stanceBlocked 사건 {ev}")
            r = run({"moveZ": -1}, 2.5)
            st5 = press("crouch")
            ok &= _check(notes, r["end"]["pos"][2] > -7.6 and st5["stance"] == "stand", f"통로 밖으로 나와(z {r['end']['pos'][2]}) C → 서기 {st5['stance']}")

            # 7) 점프 높이
            a = put("t0.jump")
            y0 = a["pos"][1]
            pg.evaluate("() => __fps.press('jump')")
            r = run({}, 1.0, 1 / 60)
            ys = [x["pos"][1] for x in r["samples"]]
            rise = max(ys) - y0
            ok &= _check(notes, 0.4 <= rise <= 0.6 and r["end"]["onGround"] and abs(r["end"]["pos"][1] - y0) < 0.02,
                         f"점프 높이 {rise:.3f}m(0.4~0.6) · 다시 바닥 {r['end']['onGround']}")
            summary["jump_m"] = round(rise, 3)
            # 경사판 위에서 미끄러지지 않음
            put("t0.ramp"); run({"moveZ": 1}, 0.8)
            pg.evaluate("() => __fps.step(0.6)")   # 손 뗀 뒤 감속(0.2초)까지 끝나고
            m0 = pg.evaluate(ST)
            r = run({}, 2.0)
            slip = abs(r["end"]["pos"][2] - m0["pos"][2])
            ok &= _check(notes, m0["pos"][1] > 0.3 and slip < 0.05 and r["end"]["onGround"], f"경사판 중간(높이 {m0['pos'][1]})에 서 있기 2초 → 미끄러짐 {slip:.3f}m")

            # 8) 문 — 닫힘은 막고, 열면 지나감
            put("t0.door")
            r = run({"moveZ": 1}, 2.0)
            z_closed = r["end"]["pos"][2]
            ok &= _check(notes, z_closed >= -8 + 0.06 + R - TOL and r["maxPen"] <= TOL, f"닫힌 문 앞 2초 → z {z_closed} (문 면 -7.94)")
            pg.evaluate("() => __fps.door('d1', true)")
            r = run({"moveZ": 1}, 2.0)
            ok &= _check(notes, r["end"]["pos"][2] < -9.5 and r["maxPen"] <= TOL, f"문 열고 2초 → z {r['end']['pos'][2]}(문을 지나감)")
            pg.evaluate("() => { __fps.resumeLoop(); }")
            pg.wait_for_timeout(700)   # 문 그림 0.6초 열림
            pg.evaluate("() => { __fps.pauseLoop(); __fps.teleport(15.9, 0, -3.5, 0); __fps.step(0.1); }")
            pg.wait_for_timeout(150)
            shot = out / "move-door.png"
            pg.screenshot(path=str(shot))
            summary["shot_door"] = str(shot)
            pg.evaluate("() => __fps.door('d1', false)")

            # 9) 결정성 — 같은 입력 두 번 → 같은 자리
            seq = """() => { __mv.put('t0.run'); __fps.setInput({moveZ: 1, moveX: 0.3, sprint: true}); __fps.step(0.5);
                __fps.press('jump'); __fps.step(0.7); __fps.turn(37, 0); __fps.setInput({sprint: null, moveX: -1}); __fps.step(1.1);
                __fps.press('crouch'); __fps.step(0.6); __fps.clearInput(); return __fps.state(); }"""
            d1 = pg.evaluate(seq)
            d2 = pg.evaluate(seq)
            ok &= _check(notes, d1["pos"] == d2["pos"] and d1["vel"] == d2["vel"] and d1["stance"] == d2["stance"],
                         f"결정성: 같은 입력 두 번 → 같은 자리 {d1['pos']} / {d2['pos']}")

            # S3 — 넘기 · 오르기 · 슬라이딩 · 전술 달리기 · 기대기 · 착지(--basic 이 아니면)
            if not getattr(args, "basic", False):
                ok &= _move_s3(pg, out, notes, summary)

            # 10) 둘러본 화면 — 단 위에서
            pg.evaluate("() => { __fps.clearInput(); __fps.teleport(6, 1.5, 4, -140); __fps.look(-140, -12); __fps.step(0.2); __fps.resumeLoop(); }")
            pg.wait_for_timeout(400)
            shot = out / "move-overview.png"
            pg.screenshot(path=str(shot))
            spread = image_spread(shot)
            ok &= _check(notes, spread is None or spread > 4, f"둘러본 화면 스크린샷 {shot} (밝기 퍼짐 {spread})")
            summary["shot_overview"] = str(shot)
            ok &= _check(notes, not s.errors and not s.external and not s.missing,
                         f"오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
        finally:
            s.close()
    return finish("move", ok, summary, notes)


# ───────────────────────────── move(S3) — 넘기 · 오르기 · 슬라이딩 · 전술 달리기 · 기대기 · 착지 ─────────────────────────────

# 페이지 안 도우미 — 사건 읽기 · 원 그리며 달리기(전술 달리기 시험: 40m 구역 안에서 3초 넘게 달리려고 반지름 r 원을 돈다)
MOVE3_JS = r"""(() => {
  const F = window.__fps;
  window.__m3 = {
    mark() { const e = F.events(); return e.length ? e[e.length - 1].i + 1 : 0; },
    ev(since, types) { return F.events(since).filter((e) => types.indexOf(e.type) >= 0).map((e) => ({ type: e.type, t: +e.t.toFixed(4), p: e.payload })); },
    circle(sec, r, every) {
      const out = [], n = Math.round(sec * 60), ev = every || 6;
      for (let k = 0; k < n; k++) {
        const s = F.state();
        const hs = Math.hypot(s.vel[0], s.vel[2]);
        F.turn(-(hs / r) * (180 / Math.PI) / 60, 0);
        F.step(1 / 60);
        if (k % ev === ev - 1) { const e = F.state(); out.push({ t: e.time, hs: Math.hypot(e.vel[0], e.vel[2]), sprint: e.sprint, pos: e.pos, cool: e.tac.cool }); }
      }
      return out;
    },
    // 1/60 씩 돌리며 표본(자세 · 속도 · 높이)
    trace(sec) {
      const out = [];
      for (let k = 0; k < Math.round(sec * 60); k++) {
        F.step(1 / 60);
        const s = F.state();
        out.push({ t: s.time, pos: s.pos, hs: Math.hypot(s.vel[0], s.vel[2]), vy: s.vel[1], stance: s.stance, ground: s.onGround, sprint: s.sprint, pen: F.pen() });
      }
      return out;
    },
  };
  return true;
})()"""


def _move_s3(pg, out, notes, summary):
    ok = True
    R = 0.35
    TOL = 0.03
    pg.evaluate("() => { __fps.pauseLoop(); __fps.setLoadout({primary: null, secondary: null}); }")   # 맨손(무기 이동 배율 1)
    pg.evaluate(MOVE_JS)
    pg.evaluate(MOVE3_JS)

    def mark():
        return pg.evaluate("() => __m3.mark()")

    def ev(since, types):
        return pg.evaluate("([i, t]) => __m3.ev(i, t)", [since, types])

    def js(code):
        return pg.evaluate(code)

    def trace(sec):
        return pg.evaluate("(s) => __m3.trace(s)", sec)

    def at(x, z, yaw=0, settle=0.3):
        # 서 있는 자세로(앞 시험이 앉기 · 엎드리기로 끝났으면 일으킴) 놓고 잠깐 기다림
        js(f"""() => {{ __fps.clearInput(); __fps.teleport({x}, 0, {z}, {yaw}); __fps.step(0.05);
            for (let k = 0; k < 3 && __fps.state().stance !== 'stand'; k++) {{ __fps.press(__fps.state().stance === 'prone' ? 'prone' : 'crouch'); __fps.step(0.05); }}
            __fps.step({settle}); }}""")

    s3 = {}

    # ── 1) 넘기 — 낮은 벽 0.9m(넘을 수 있음 표시, 두께 0.3) ──
    at(0, -3.0)
    probe = js("() => __fps.vaultProbe()")
    i0 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.press('jump'); }")
    tr = trace(1.0)
    e = ev(i0, ["vault", "vaultEnd", "jump"])
    v = [x for x in e if x["type"] == "vault"]
    ve = [x for x in e if x["type"] == "vaultEnd"]
    end = tr[-1]
    dur = (ve[0]["t"] - v[0]["t"]) if v and ve else None
    maxy = max(x["pos"][1] for x in tr)
    maxpen = max(x["pen"] for x in tr)
    c = (probe and probe["kind"] == "vault" and probe["over"] and v and abs(v[0]["p"]["h"] - 0.9) < 0.02 and v[0]["p"]["over"]
         and dur is not None and abs(dur - 0.4) < 0.04 and not any(x["type"] == "jump" for x in e)
         and end["pos"][2] < -4.15 - R and end["pos"][1] < 0.03 and end["ground"] and end["stance"] == "stand" and maxy > 0.9 and maxpen <= TOL)
    ok &= _check(notes, c, f"넘기: 낮은 벽 0.9m — 미리 보기 {probe} · 사건 {[x['type'] for x in e]} · 걸린 시간 {dur}s(0.4) · 가장 높이 {maxy:.2f}m · "
                           f"끝 z {end['pos'][2]}(벽 뒷면 -4.15 너머) 높이 {end['pos'][1]} · {end['stance']} · 최대 박힘 {maxpen}m")
    s3["vault"] = {"h": v[0]["p"]["h"] if v else None, "dur": dur, "end": end["pos"]}

    # ── 2) 높은 벽 1.6m(표시 없음 · 너무 높음) — 넘기 실패, 그냥 점프 ──
    at(-7, -3.0)
    probe = js("() => __fps.vaultProbe()")
    i0 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.press('jump'); }")
    tr = trace(1.2)
    e = ev(i0, ["vault", "jump"])
    end = tr[-1]
    c = (probe is None and not any(x["type"] == "vault" for x in e) and any(x["type"] == "jump" for x in e)
         and end["pos"][2] >= -4 + 0.15 + R - TOL and end["pos"][1] < 0.03 and max(x["pen"] for x in tr) <= TOL)
    ok &= _check(notes, c, f"높은 벽 1.6m: 미리 보기 {probe} · 사건 {[x['type'] for x in e]}(넘기 없음 · 점프만) · 끝 z {end['pos'][2]} 높이 {end['pos'][1]}")

    # ── 3) 오르기 — 가슴 높이 1.2m(두께 0.6) ──
    at(7, -2.9)
    probe = js("() => __fps.vaultProbe()")
    i0 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.press('jump'); }")
    tr = trace(0.75)
    js("() => __fps.clearInput()")
    tr += trace(0.4)
    e = ev(i0, ["vault", "vaultEnd", "jump"])
    v = [x for x in e if x["type"] == "vault"]
    ve = [x for x in e if x["type"] == "vaultEnd"]
    end = tr[-1]
    dur = (ve[0]["t"] - v[0]["t"]) if v and ve else None
    maxpen = max(x["pen"] for x in tr)
    c = (probe and probe["kind"] == "mantle" and v and v[0]["p"]["kind"] == "mantle" and abs(v[0]["p"]["h"] - 1.2) < 0.02
         and dur is not None and abs(dur - 0.7) < 0.04 and abs(end["pos"][1] - 1.2) < 0.03 and end["ground"] and end["stance"] == "stand"
         and -4.3 <= end["pos"][2] <= -3.7 and maxpen <= TOL)
    ok &= _check(notes, c, f"오르기: 가슴 높이 1.2m — 미리 보기 {probe} · 걸린 시간 {dur}s(0.7) · 끝 높이 {end['pos'][1]}(윗면 1.2) z {end['pos'][2]} · {end['stance']} · 바닥 {end['ground']} · 최대 박힘 {maxpen}m")
    s3["mantle"] = {"h": v[0]["p"]["h"] if v else None, "dur": dur, "end": end["pos"]}
    js("() => { __fps.resumeLoop(); __fps.look(180, -18); }")
    pg.wait_for_timeout(350)
    shot = out / "move-mantle.png"
    pg.screenshot(path=str(shot))
    summary["shot_mantle"] = str(shot)
    js("() => __fps.pauseLoop()")

    # ── 4) 넘기 취소 — 넘어가기 전에 이동 키를 떼면 제자리 ──
    at(0, -3.0)
    i0 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.press('jump'); __fps.step(0.1); __fps.setInput({moveZ: 0}); }")
    tr = trace(0.4)
    e = ev(i0, ["vault", "vaultCancel", "vaultEnd"])
    end = tr[-1]
    c = ([x["type"] for x in e] == ["vault", "vaultCancel"] and abs(end["pos"][2] + 3.0) < 0.05 and end["pos"][1] < 0.03 and end["stance"] == "stand")
    ok &= _check(notes, c, f"넘기 중 이동 키 떼기 → 취소 {[x['type'] for x in e]} · 제자리 z {end['pos'][2]} 높이 {end['pos'][1]}")
    # 이동 키 없이 Space → 그냥 점프
    at(0, -3.0)
    i0 = mark()
    js("() => __fps.press('jump')")
    trace(0.6)
    e = ev(i0, ["vault", "jump"])
    ok &= _check(notes, [x["type"] for x in e] == ["jump"], f"이동 키 없이 Space(낮은 벽 앞) → 점프만 {[x['type'] for x in e]}")

    # ── 5) 슬라이딩 — 달리는 중 C: 0.7초 · 거리 3~5m · 끝에 앉기 ──
    js("() => { __mv.put('t0.run'); __fps.setInput({moveZ: 1, sprint: true}); __fps.step(0.6); }")
    st = js(ST)
    hs0 = (st["vel"][0] ** 2 + st["vel"][2] ** 2) ** 0.5
    i0 = mark()
    js("() => { __fps.setInput({sprint: null}); __fps.press('crouch'); }")
    tr = trace(1.0)
    e = ev(i0, ["slide", "slideEnd", "stance"])
    sl = [x for x in e if x["type"] == "slide"]
    se = [x for x in e if x["type"] == "slideEnd"]
    first = tr[0]
    after = [x for x in tr if x["stance"] != "slide"]
    sdur = (se[0]["t"] - sl[0]["t"]) if sl and se else None
    sdist = se[0]["p"]["dist"] if se else None
    maxpen = max(x["pen"] for x in tr)
    c = (st["sprint"] == "run" and abs(hs0 - 6.75) < 0.05 and sl and abs(first["hs"] - 9.0) < 0.15 and se and se[0]["p"]["why"] == "time"
         and 3.0 <= sdist <= 5.0 and abs(sdur - 0.7) < 0.04 and after and after[0]["stance"] == "crouch" and tr[-1]["stance"] == "crouch" and maxpen <= TOL)
    ok &= _check(notes, c, f"슬라이딩: 달리기 {hs0:.2f}m/s → C → 시작 {first['hs']:.2f}m/s(9.0) · 걸린 시간 {sdur}s(0.7) · 거리 {sdist}m(3~5) · 끝 자세 {after[0]['stance'] if after else None} · 최대 박힘 {maxpen}m")
    s3["slide"] = {"v0": round(first["hs"], 3), "dist": sdist, "dur": sdur}
    # 연속 사용 대기 1초 — 바로 다시 달려 C 는 그냥 앉기
    i1 = mark()
    js("() => { __fps.setInput({moveZ: 1, sprint: true}); __fps.step(0.2); __fps.setInput({sprint: null}); __fps.press('crouch'); __fps.step(0.1); }")
    st1 = js(ST)
    e1 = ev(i1, ["slide"])
    # 1초 넘게 지난 뒤에는 다시 됨
    i2 = mark()
    js("() => { __mv.put('t0.run'); __fps.setInput({moveZ: 1, sprint: true}); __fps.step(0.6); __fps.setInput({sprint: null}); __fps.press('crouch'); __fps.step(0.1); }")
    st2 = js(ST)
    e2 = ev(i2, ["slide"])
    ok &= _check(notes, not e1 and st1["stance"] == "crouch" and e2 and st2["stance"] == "slide",
                 f"슬라이딩 대기 1초: 끝난 직후 달려 C → {st1['stance']}(슬라이딩 {len(e1)}번) · 1초 뒤 → {st2['stance']}(슬라이딩 {len(e2)}번)")
    # 점프로 취소
    i3 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.step(0.15); __fps.press('jump'); __fps.step(2 / 60); }")
    st3 = js(ST)
    e3 = ev(i3, ["slideEnd", "jump"])
    ok &= _check(notes, st3["stance"] == "stand" and st3["vel"][1] > 2 and [x["type"] for x in e3] == ["slideEnd", "jump"] and e3[0]["p"]["why"] == "jump",
                 f"슬라이딩 중 Space → 일어나 점프(자세 {st3['stance']} · 위 속도 {st3['vel'][1]} · 사건 {[(x['type'], (x['p'] or {}).get('why')) for x in e3]})")
    js("() => { __fps.clearInput(); __fps.step(1.0); }")
    # 뒤로 가며 C → 슬라이딩 없음(앉기)
    i4 = mark()
    js("() => { __mv.put('t0.run'); __fps.setInput({moveZ: -1, sprint: true}); __fps.step(0.5); __fps.press('crouch'); __fps.step(0.1); __fps.clearInput(); }")
    e4 = ev(i4, ["slide"])
    ok &= _check(notes, not e4 and js(ST)["stance"] == "crouch", f"뒤로 가며 Shift + C → 슬라이딩 없음({len(e4)}) · 앉기")
    # 넘기 직후 C → 바로 슬라이딩(달리지 않아도)
    at(0, -3.0)
    i5 = mark()
    js("() => { __fps.setInput({moveZ: 1}); __fps.press('jump'); __fps.step(0.15); __fps.press('crouch'); __fps.step(0.5); }")
    e5 = ev(i5, ["vault", "vaultEnd", "slide"])
    st5 = js(ST)
    js("() => { __fps.clearInput(); __fps.step(1.0); }")
    ok &= _check(notes, [x["type"] for x in e5] == ["vault", "vaultEnd", "slide"] and e5[2]["p"]["fromVault"] and st5["stance"] == "slide",
                 f"넘는 중 C → 넘자마자 슬라이딩 {[x['type'] for x in e5]} · 자세 {st5['stance']}")

    # ── 6) 전술 달리기 — ×1.8 이 3초 뒤 ×1.5, 대기 6초 ──
    at(4, 3, 0)
    js("() => __fps.setInput({moveZ: 1, sprint: true})")
    a = pg.evaluate("() => __m3.circle(1.0, 4)")
    i6 = mark()
    js("() => __fps.press('tacSprint')")
    b = pg.evaluate("() => __m3.circle(3.6, 4)")
    e6 = ev(i6, ["tacSprint", "tacSprintTired"])
    t_on = e6[0]["t"] if e6 else 0
    run_hs = a[-1]["hs"]
    tac_s = [x for x in b if 0.4 <= x["t"] - t_on <= 2.9]
    late = [x for x in b if x["t"] - t_on >= 3.4]
    t_off = [x["t"] for x in e6 if x["type"] == "tacSprint" and not x["p"]["on"]]
    tac_hs = [x["hs"] for x in tac_s]
    late_hs = [x["hs"] for x in late]
    c = (abs(run_hs - 6.75) < 0.3 and e6 and e6[0]["p"]["on"] and tac_s and all(x["sprint"] == "tac" for x in tac_s) and all(abs(h - 8.1) < 0.3 for h in tac_hs)
         and t_off and abs(t_off[0] - t_on - 3.0) < 0.04 and late and all(x["sprint"] == "run" for x in late) and all(abs(h - 6.75) < 0.3 for h in late_hs))
    ok &= _check(notes, c, f"전술 달리기: 달리기 {run_hs:.2f} → Shift 두 번 → {min(tac_hs) if tac_hs else 0:.2f}~{max(tac_hs) if tac_hs else 0:.2f}m/s(8.1) · "
                           f"{round(t_off[0] - t_on, 3) if t_off else None}초 뒤 일반 달리기 {min(late_hs) if late_hs else 0:.2f}~{max(late_hs) if late_hs else 0:.2f}m/s(6.75)")
    s3["tac"] = {"run": round(run_hs, 3), "tac": [round(min(tac_hs), 3), round(max(tac_hs), 3)] if tac_hs else None,
                 "after": [round(min(late_hs), 3), round(max(late_hs), 3)] if late_hs else None, "dur": round(t_off[0] - t_on, 3) if t_off else None}
    i7 = mark()
    js("() => { __fps.press('tacSprint'); __fps.step(1 / 60); }")
    st7 = js(ST)
    e7 = ev(i7, ["tacSprint", "tacSprintTired"])
    pg.evaluate("() => __m3.circle(4.8, 4)")
    i8 = mark()
    js("() => { __fps.press('tacSprint'); __fps.step(1 / 60); }")
    st8 = js(ST)
    e8 = ev(i8, ["tacSprint", "tacSprintTired"])
    allpos = [x["pos"] for x in a + b]
    rmax = max(((p[0]) ** 2 + (p[2] - 3) ** 2) ** 0.5 for p in allpos)
    ok &= _check(notes, st7["sprint"] == "run" and [x["type"] for x in e7] == ["tacSprintTired"] and st8["sprint"] == "run" and [x["type"] for x in e8] == ["tacSprintTired"],
                 f"전술 달리기 대기: 끝난 직후 Shift 두 번 → {st7['sprint']}(대기 {st7['tac']['cool']}초) · 5.4초 뒤 → {st8['sprint']}(대기 {st8['tac']['cool']}초)")
    pg.evaluate("() => { __fps.setInput({moveZ: 1, sprint: true}); __m3.circle(0.8, 4); }")
    i9 = mark()
    js("() => { __fps.press('tacSprint'); __fps.step(1 / 60); }")
    st9 = js(ST)
    e9 = ev(i9, ["tacSprint", "tacSprintTired"])
    js("() => { __fps.clearInput(); __fps.step(0.5); }")
    ok &= _check(notes, st9["sprint"] == "tac" and e9 and e9[0]["type"] == "tacSprint", f"전술 달리기 6초 뒤 다시 됨 → {st9['sprint']} (원 반지름 최대 {rmax:.2f}m — 벽에 안 닿음)")

    # ── 7) 착지 감속 · 연속 점프 감속 · 착지 화면 눌림 ──
    js("() => { __mv.put('t0.run'); __fps.setInput({moveZ: 1}); __fps.step(0.5); __fps.press('jump'); }")
    i10 = mark()
    tr = trace(0.8)
    js("() => __fps.clearInput()")
    e10 = ev(i10, ["land"])
    cam = js("() => __fps.camfx()")
    land_t = e10[0]["t"] if e10 else None
    post = [x["hs"] for x in tr if land_t is not None and 0 < x["t"] - land_t <= 0.2]
    rec = [x["hs"] for x in tr if land_t is not None and x["t"] - land_t >= 0.33]
    c = e10 and post and min(post) < 4.5 * 0.85 and rec and abs(rec[-1] - 4.5) < 0.05 and cam["landOff"] < -0.02
    ok &= _check(notes, c, f"착지 감속: 걷다 점프 → 착지 직후 최저 {round(min(post), 2) if post else None}m/s(< 3.83) → {rec[-1] if rec else 0:.2f}m/s 회복 · 화면 눌림 {cam['landOff']}m")
    js("() => { __mv.put('t0.jump'); __fps.press('jump'); }")
    tr1 = trace(0.4)
    js("() => __fps.press('jump')")
    i11 = mark()
    tr2 = trace(0.6)
    e11 = ev(i11, ["jump"])
    y0 = 0.0
    r1 = max(x["pos"][1] for x in tr1) - y0
    r2 = max(x["pos"][1] for x in tr2) - y0
    c = e11 and e11[0]["p"]["chain"] == 1 and 0.3 < r2 < r1 - 0.08 and 0.45 < r1 < 0.55
    ok &= _check(notes, c, f"연속 점프 감속: 첫 점프 {r1:.3f}m → 착지 바로 다시 {r2:.3f}m(연속 {e11[0]['p'] if e11 else None})")
    s3["jump_chain"] = [round(r1, 3), round(r2, 3)]
    js("() => __fps.step(1.0)")

    # ── 8) 기대기 — 기본 끔, 설정 켜면 Q/E(섬광 4), 옆이 막히면 줄임 ──
    c0 = js("() => __fps.setControls({})")
    at(0, 8)
    js("() => { __fps.setInput({leanR: true}); __fps.step(0.5); }")
    l0 = js(ST)["lean"]
    js("() => { __fps.clearInput(); __fps.step(0.3); }")
    c1 = js("() => __fps.setControls({lean: true})")
    js("() => __fps.resumeLoop()")
    pg.keyboard.down("KeyE")
    pg.wait_for_timeout(450)
    lr = js(ST)["lean"]
    pg.keyboard.up("KeyE")
    pg.keyboard.down("KeyQ")
    pg.wait_for_timeout(600)
    lq = js(ST)["lean"]
    shot = out / "move-lean.png"
    pg.screenshot(path=str(shot))
    summary["shot_lean"] = str(shot)
    pg.keyboard.up("KeyQ")
    js("() => __fps.pauseLoop()")
    at(19.2, 0, 0)
    js("() => { __fps.setInput({leanR: true}); __fps.step(0.5); }")
    lw = js(ST)["lean"]
    js("() => { __fps.clearInput(); __fps.step(0.4); }")
    c2 = js("() => __fps.setControls({lean: false})")
    js("() => { __fps.setInput({leanL: true}); __fps.step(0.5); }")
    l3 = js(ST)["lean"]
    js("() => { __fps.clearInput(); __fps.step(0.2); }")
    c = (c0["leanR"] is None and c0["flash"] == "KeyQ" and l0["off"] == 0 and c1["leanR"] == "KeyE" and c1["leanL"] == "KeyQ" and c1["flash"] == "Digit4"
         and abs(lr["off"] - 0.4) < 0.02 and abs(lq["off"] + 0.4) < 0.02 and 0 < lw["off"] < 0.3 and c2["flash"] == "KeyQ" and l3["off"] == 0)
    ok &= _check(notes, c, f"기대기: 기본 끔(키 {c0['leanR']} · 섬광 {c0['flash']} · 손잡이로 눌러도 {l0['off']}) → 켜면 Q/E(섬광 {c1['flash']}) · "
                           f"[실제 키] E {lr['off']}m · Q {lq['off']}m · 오른쪽 벽 0.4m 옆 {lw['off']}m(줄임) · 다시 끄면 {l3['off']}")

    # ── 9) [실제 키] 달리는 중 Shift 두 번 → 전술 달리기, 흔들림이 커짐 ──
    js("() => { __fps.clearInput(); __fps.teleport(0, 0, 14, 0); __fps.step(0.2); __fps.resumeLoop(); }")
    pg.keyboard.down("KeyW")
    pg.wait_for_timeout(250)
    pg.keyboard.press("ShiftLeft")
    pg.wait_for_timeout(350)
    a1 = js("() => ({ s: __fps.state().sprint, fx: __fps.camfx() })")
    pg.keyboard.down("ShiftLeft")
    pg.wait_for_timeout(60)
    pg.keyboard.up("ShiftLeft")
    pg.wait_for_timeout(80)
    pg.keyboard.down("ShiftLeft")
    pg.wait_for_timeout(60)
    pg.keyboard.up("ShiftLeft")
    pg.wait_for_timeout(450)
    a2 = js("() => ({ s: __fps.state().sprint, fx: __fps.camfx() })")
    shot = out / "move-tac.png"
    pg.screenshot(path=str(shot))
    summary["shot_tac"] = str(shot)
    pg.keyboard.up("KeyW")
    pg.wait_for_timeout(200)
    js("() => __fps.pauseLoop()")
    ok &= _check(notes, a1["s"] == "run" and a2["s"] == "tac" and a2["fx"]["amp"] > a1["fx"]["amp"] + 0.008,
                 f"[실제 키] W + Shift → {a1['s']}(흔들림 {a1['fx']['amp']}) · Shift 두 번 → {a2['s']}(흔들림 {a2['fx']['amp']})")

    # ── 10) 결정성 — S3 동작을 섞어 두 번 ──
    seq = """() => { __mv.put('t0.run'); __fps.setInput({moveZ: 1, sprint: true}); __fps.step(0.6); __fps.press('tacSprint'); __fps.step(0.5);
        __fps.setInput({sprint: null}); __fps.press('crouch'); __fps.step(0.9); __fps.clearInput(); __fps.press('crouch'); __fps.step(0.1);
        __fps.teleport(7, 0, -2.9, 0); __fps.step(0.2); __fps.setInput({moveZ: 1}); __fps.press('jump'); __fps.step(0.75);
        __fps.clearInput(); __fps.step(0.3); return __fps.state(); }"""
    d1 = js(seq)
    d2 = js(seq)
    ok &= _check(notes, d1["pos"] == d2["pos"] and d1["vel"] == d2["vel"] and d1["stance"] == d2["stance"] and d1["tac"] == d2["tac"] and abs(d1["pos"][1] - 1.2) < 0.03,
                 f"결정성(전술 달리기 · 슬라이딩 · 오르기 — 끝은 가슴 높이 벽 위): {d1['pos']} / {d2['pos']}")
    summary["s3"] = s3
    return ok


# ───────────────────────────── shoot --core ─────────────────────────────

SHOOT_JS = r"""(() => {
  const F = window.__fps;
  const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const mark = () => { const e = F.events(); return e.length ? e[e.length - 1].i + 1 : 0; };
  const ev = (since, types) => F.events(since).filter((e) => types.indexOf(e.type) >= 0).map((e) => ({ type: e.type, t: +e.t.toFixed(4), p: e.payload }));
  const ang = (a, b) => { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; const la = Math.hypot(a[0], a[1], a[2]), lb = Math.hypot(b[0], b[1], b[2]);
    return Math.acos(Math.max(-1, Math.min(1, d / (la * lb)))) * 180 / Math.PI; };
  window.__sh = {
    raf, mark, ev, ang,
    reset(w1, w2, hp) {
      F.clearInput();
      F.setLoadout({ primary: w1 === undefined ? 'nuwool' : w1, secondary: w2 === undefined ? 'sondeung' : w2 });
      F.resetTargets(hp ? { hp } : undefined);
      F.teleportTo('t0.range');
      F.step(0.5);
      return F.weapon();
    },
    // 한 단계씩 돌리며 발사 n 번 — 발사 직후 그림을 그려 카메라 방향을 읽고, 다음 탄 방향과 비교(보이는 것 = 판정)
    async burst(n, maxSec) {
      const out = [];
      let last = mark();
      F.setInput({ fire: true });
      const limit = Math.round((maxSec || 4) * 60);
      for (let k = 0; k < limit && out.length < n; k++) {
        F.step(1 / 60);
        const e = ev(last, ['shot']);
        last = mark();
        if (e.length) {
          await raf();
          const c = F.camDir();
          const st = F.state();
          out.push({ t: e[0].t, dir: e[0].p.dir, aim: e[0].p.aim, recoil: e[0].p.recoil, kick: e[0].p.kick, sway: e[0].p.sway, camAfter: c.dir, recAfter: st.recoil });
        }
      }
      F.setInput({ fire: null });
      return out;
    },
    stepUntil(types, maxSec, since) {
      const s0 = since === undefined ? mark() : since;
      for (let k = 0; k < Math.round(maxSec * 60); k++) { F.step(1 / 60); const e = ev(s0, types); if (e.length) return e; }
      return [];
    },
  };
  return true;
})()"""


def cmd_shoot(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {}
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL, wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            ok &= _check(notes, r_ok, "__fps.ready")
            pg.click("#btnSortie")
            ok &= _check(notes, _phase_wait(pg, "play"), "「출격 준비」 → play")
            pg.wait_for_timeout(300)
            J = lambda code, arg=None: pg.evaluate(code, arg) if arg is not None else pg.evaluate(code)  # noqa: E731
            defs = J("() => __fps.weaponDefs()")
            ids = J("() => FG.cfg.WEAPON_ORDER")
            st = J(ST)
            tg = J("() => __fps.targets()")
            ok &= _check(notes, len(defs) == 6 and ids == ["nuwool", "mulsu", "neoreok", "meondeung", "sondeung", "cheondung"]
                         and all(12 <= len(defs[k]["pattern"]) <= 20 for k in ids),
                         f"무기 6종 {[defs[k]['name'] for k in ids]} · 반동 배열 {[len(defs[k]['pattern']) for k in ids]}개(12~20)")
            ok &= _check(notes, st["weapon"]["id"] == "nuwool" and st["weapon"]["slots"][1]["id"] == "sondeung" and st["weapon"]["mag"] == 30,
                         f"기본 장비 너울 + 손등불 · 탄 {st['weapon']['mag']}/{st['weapon']['reserve']}")
            ok &= _check(notes, len(tg) == 3 and [t["armored"] for t in tg] == [False, False, True],
                         f"시험 구역 과녁 3개(판정 몸 — 셋째는 방탄) {[(t['id'], t['pos']) for t in tg]}")
            # 실제 마우스 — 잠금이 안 되는 헤드리스는 대체 조작: 짧은 클릭 = 한 발
            J("() => { __fps.aimAt('tg1'); }")
            m0 = J("() => { const e = __fps.events(); return e.length ? e[e.length - 1].i + 1 : 0; }")
            pg.mouse.click(640, 360)
            pg.wait_for_timeout(250)
            e = J("(m) => __fps.events(m).filter(x => x.type === 'shot' || x.type === 'hit').map(x => [x.type, x.payload.targetId || x.payload.wpn])", m0)
            ok &= _check(notes, ["shot", "nuwool"] in e, f"[실제 마우스] 화면 짧은 클릭 → 발사 {e}")
            pg.screenshot(path=str(out / "shoot-hip.png"))
            summary["shot_hip"] = str(out / "shoot-hip.png")

            # 이후는 고리를 붙잡고 sim 만
            J("() => __fps.pauseLoop()")
            J(SHOOT_JS)

            # 1) aimAt + 발사 → hit · 탄창 감소 · HUD 꺾쇠 · 소리
            J("() => __sh.reset()")
            J("() => __fps.aimAt('tg1')")
            r = pg.evaluate("""async () => { const m = __sh.mark(); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(0.05);
                await __sh.raf(); return { e: __sh.ev(m, ['shot', 'hit', 'impact']), w: __fps.weapon(), hud: __fps.hud(), au: __fps.audio() }; }""")
            types = [x["type"] for x in r["e"]]
            hit = next((x["p"] for x in r["e"] if x["type"] == "hit"), None)
            ok &= _check(notes, types[:2] == ["shot", "hit"] and hit and hit["targetId"] == "tg1" and hit["byPlayer"] and hit["part"] == "torso"
                         and abs(hit["dmg"] - 28) < 1e-6 and r["w"]["mag"] == 29,
                         f"aimAt(tg1) + 발사 → 사건 {types} · {hit and (hit['part'], hit['dmg'])} · 탄창 30 → {r['w']['mag']}")
            ok &= _check(notes, r["hud"]["hm"]["cls"] == "on k-hit" and r["hud"]["hm"]["corners"] == 4 and r["hud"]["ammo"]["mag"] == "29" and r["hud"]["ammo"]["name"] == "너울",
                         f"HUD 맞힘 꺾쇠 4개 {r['hud']['hm']} · 탄약 「{r['hud']['ammo']['name']} {r['hud']['ammo']['mag']} {r['hud']['ammo']['reserve']}」")
            ok &= _check(notes, r["au"]["unlocked"] and r["au"]["comp"] and r["au"]["played"].get("shot_nuwool", 0) >= 1 and r["au"]["played"].get("hm_hit", 0) >= 1,
                         f"소리: 출격 클릭에서 켜짐({r['au']['ctx']}) · 압축기 · 버스 {r['au']['buses']} · 총성 · 맞힘 「톡」 {r['au']['played']}")

            # 2) 반동 배열 · 보이는 것 = 판정 · 0.2초 복귀(조준 중 — 흔들림 거의 0)
            J("() => __sh.reset('nuwool', 'sondeung', 1e6)")
            base = J("() => { __fps.aimAt('tg1', 'torso', -0.12); __fps.setInput({ads: true}); __fps.step(0.4); return __fps.state(); }")
            m = J("() => __sh.mark()")
            b = pg.evaluate("() => __sh.burst(10, 3)")
            pat = defs["nuwool"]["pattern"]
            KV = 0.45 * defs["nuwool"]["recoil"][0]
            exp_cum, cum, worst, worst_cam, hiprec = [], 0.0, 0.0, 0.0, []
            for k, x in enumerate(b):
                exp_cum.append(cum)
                worst = max(worst, abs(x["recoil"][0] - cum))
                cum += pat[k][0] * KV
            for k in range(len(b) - 1):
                worst_cam = max(worst_cam, pg.evaluate("([a, c]) => __sh.ang(a, c)", [b[k + 1]["dir"], b[k]["camAfter"]]))
            hits = J("(m) => __sh.ev(m, ['hit']).map(x => [x.p.part, x.p.pos[1]])", m)
            ok &= _check(notes, len(b) == 10 and worst < 0.002,
                         f"연사 10발: 탄마다 카메라 반동 pitch = 배열 누적(최대 오차 {worst:.4f}°) — {[x['recoil'][0] for x in b]}")
            ok &= _check(notes, len(b) == 10 and worst_cam < 0.05,
                         f"보이는 것 = 판정: 쏜 뒤 그린 카메라 방향과 다음 탄 방향 차 최대 {worst_cam:.4f}° (흔들림 {base['sway']['amp']}°)")
            ys = [h[1] for h in hits]
            ok &= _check(notes, len(hits) >= 6 and ys[-1] - ys[0] > 0.4 and hits[0][0] == "torso" and "head" in [h[0] for h in hits],
                         f"반동만큼 올라간 곳에 맞음(10m 과녁): 부위 {[h[0] for h in hits]} · 맞은 높이 {[round(y, 2) for y in ys]}")
            dt = pg.evaluate("""() => { const t0 = __fps.state().time; const out = [];
                for (let k = 0; k < 15; k++) { __fps.step(1/60); const s = __fps.state(); out.push([+(s.time - t0).toFixed(4), s.recoil.pitch]); } return out; }""")
            p0 = b[-1]["recAfter"]["pitch"]
            mid = next((v for t, v in dt if abs(t - 0.1) < 0.009), None)
            zero_t = next((t for t, v in dt if v == 0), None)
            ok &= _check(notes, p0 > 3 and mid is not None and 0 < mid < p0 and zero_t is not None and zero_t <= 0.2 + 1e-3,
                         f"손 떼면 복귀: {p0:.3f}° → 0.1초 {mid}° → 0 까지 {zero_t}초(≤ 0.2)")
            fov_ads = J("() => __fps.camDir().fov")
            J("() => { __fps.setInput({ads: null}); __fps.step(0.5); }")
            pg.evaluate("() => __sh.raf()")
            fov_hip = J("() => __fps.camDir().fov")
            exp_fov = 2 * __import__("math").degrees(__import__("math").atan(__import__("math").tan(__import__("math").radians(37.5)) / 1.1))
            ok &= _check(notes, abs(fov_ads - exp_fov) < 0.05 and abs(fov_hip - 75) < 1e-3, f"조준 중 시야각 {fov_ads}°(기대 {exp_fov:.2f}) → 떼면 {fov_hip}°")

            # 3) 전술 재장전 < 빈 탄창 재장전 · 약실 +1 · 자동 재장전
            J("() => __sh.reset('nuwool', 'sondeung', 1e6)")
            J("() => { __fps.aimAt([0, 1.5, -19.6]); __fps.fireFor(0.25); __fps.step(0.2); }")
            m = J("() => __sh.mark()")
            J("() => __fps.press('reload')")
            e = J("(m) => __sh.stepUntil(['reloadEnd'], 4, m)", m)
            ev1 = J("(m) => __sh.ev(m, ['reload', 'reloadStep', 'reloadEnd'])", m)
            tac = next((x["p"] for x in ev1 if x["type"] == "reloadEnd"), None)
            J("() => { __fps.setInput({fire: true}); for (let k = 0; k < 600 && __fps.weapon().mag > 0; k++) __fps.step(1/60); __fps.setInput({fire: null}); }")
            m = J("() => __sh.mark()")
            J("(m) => __sh.stepUntil(['reloadEnd'], 4, m)", m)
            ev2 = J("(m) => __sh.ev(m, ['reload', 'reloadStep', 'reloadEnd'])", m)
            emp = next((x["p"] for x in ev2 if x["type"] == "reloadEnd"), None)
            rel2 = next((x["p"] for x in ev2 if x["type"] == "reload"), None)
            w = J("() => __fps.weapon()")
            ok &= _check(notes, tac and emp and tac["kind"] == "tac" and emp["kind"] == "empty" and abs(tac["t"] - 1.8) < 0.02 and abs(emp["t"] - 2.4) < 0.02
                         and tac["t"] < emp["t"] and tac["mag"] == 31 and emp["mag"] == 30 and rel2 and rel2["why"] == "auto",
                         f"전술 재장전 {tac and tac['t']}초(탄창 {tac and tac['mag']} = 30 + 약실 1) < 빈 탄창 {emp and emp['t']}초(탄창 {emp and emp['mag']}) · 빈 탄창은 자동({rel2 and rel2['why']}) · 예비 {w['reserve']}")
            steps = [x["p"]["step"] for x in ev2 if x["type"] == "reloadStep"]
            ok &= _check(notes, steps == ["out", "in", "rack"], f"빈 탄창 재장전 단계 {steps}(빼기 · 넣기 · 당기기 — 소리)")
            # 달리기로 취소 · 달리기 → 사격 0.2초
            r = pg.evaluate("""() => { __sh.reset('nuwool', 'sondeung', 1e6); __fps.aimAt([0, 1.5, -19.6]); __fps.fireFor(0.3); __fps.press('reload'); __fps.step(0.5);
                const m = __sh.mark(); const mag = __fps.weapon().mag; __fps.setInput({moveZ: 1, sprint: true}); __fps.step(0.3);
                const c = __sh.ev(m, ['reloadCancel']); const w = __fps.weapon(); const sp = __fps.state().sprint;
                const m2 = __sh.mark(); __fps.setInput({sprint: null, fire: true});
                let tOff = null; for (let k = 0; k < 60; k++) { __fps.step(1/60); const s = __fps.state(); if (tOff === null && s.sprint === 'off') tOff = s.time - 1/60; if (__sh.ev(m2, ['shot']).length) break; }
                __fps.clearInput(); const sh = __sh.ev(m2, ['shot']);
                return { c, mag, magAfter: w.mag, state: w.state, sp, tOff, shotT: sh.length ? sh[0].t : null }; }""")
            gap = (r["shotT"] - r["tOff"]) if r["shotT"] is not None and r["tOff"] is not None else None
            ok &= _check(notes, r["c"] and r["c"][0]["p"]["why"] == "sprint" and r["magAfter"] == r["mag"] and r["state"] == "idle" and r["sp"] == "run",
                         f"재장전 중 달리기 → 취소({r['c'] and r['c'][0]['p']['why']}) · 탄창 그대로 {r['mag']} → {r['magAfter']}")
            ok &= _check(notes, gap is not None and abs(gap - 0.2) < 0.02, f"달리기 멈춘 뒤 첫 발까지 {gap and round(gap, 3)}초(0.2)")

            # 4) 산탄 8줄기(고정 무늬 + 작은 회전) · 펌프 간격
            r = pg.evaluate("""() => { __sh.reset('neoreok', 'sondeung', 1e6); __fps.aimAt([0, 1.5, -19.6]); const m = __sh.mark();
                __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); const s1 = __fps.lastShot(); const e1 = __sh.ev(m, ['impact']);
                __fps.step(0.9); const m2 = __sh.mark(); for (let k = 0; k < 66; k++) { __fps.press('fire'); __fps.step(1/60); }
                const sh = __sh.ev(m2, ['shot']); const s2 = __fps.lastShot(); return { s1, e1, sh, s2, m2t: __sh.ev(m2, ['shot']) }; }""")
            s1, s2 = r["s1"], r["s2"]
            ang = [pg.evaluate("([a, c]) => __sh.ang(a, c)", [s1["rays"][0], q]) for q in s1["rays"]]
            ang2 = [pg.evaluate("([a, c]) => __sh.ang(a, c)", [s2["rays"][0], q]) for q in s2["rays"]] if s2 else []
            sp = defs["neoreok"]["spread"][0]
            pat_ok = len(ang) == 8 and ang[0] < 1e-3 and all(abs(a - sp) < 0.02 for a in ang[1::2]) and all(abs(a - sp * 0.55) < 0.02 for a in ang[2::2])
            same = len(ang2) == 8 and all(abs(a - b2) < 0.02 for a, b2 in zip(ang, ang2))
            shots = r["m2t"]
            pump_gap = shots[1]["t"] - shots[0]["t"] if len(shots) >= 2 else None
            ok &= _check(notes, s1["pellets"] == 8 and len(r["e1"]) == 8 and pat_ok and same and s1["rot"] != s2["rot"],
                         f"산탄 8줄기: 맞은 곳 {len(r['e1'])}개 · 가운데에서 각도 {[round(a, 2) for a in ang]}°(고정 무늬) · 회전 {s1['rot']}° → {s2['rot']}°")
            ok &= _check(notes, pump_gap is not None and 60 / 70 - 1e-6 <= pump_gap < 60 / 70 + 1 / 60 + 1e-6, f"펌프: 매 단계 눌러도 간격 {pump_gap and round(pump_gap, 3)}초(70발/분 = 0.857)")

            # 5) 무기 6종 모두 쏨 · 소리 · 1인칭 모델
            res6 = {}
            for wid in ids:
                r = pg.evaluate("""async (w) => { __sh.reset(w, 'sondeung', 1e6); __fps.aimAt('tg1'); const m = __sh.mark(); const m0 = __fps.weapon().mag;
                    __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(w === 'cheondung' ? 0.4 : 0.1); await __sh.raf();
                    const e = __sh.ev(m, ['shot', 'hit', 'explode']); return { types: e.map(x => x.type), hit: e.filter(x => x.type === 'hit').map(x => [x.p.kind, x.p.dmg]),
                      m0, m1: __fps.weapon().mag, vm: __fps.vm() }; }""", wid)
                res6[wid] = r
            pg.evaluate("() => __sh.raf()")
            au = J("() => __fps.audio()")
            good = all(r["types"] and r["types"][0] == "shot" and r["m1"] == r["m0"] - 1 and "hit" in r["types"] and r["vm"]["model"] == w2 for w2, r in res6.items())
            ok &= _check(notes, good and "explode" in res6["cheondung"]["types"] and res6["cheondung"]["hit"][0][0] == "explosion",
                         "무기 6종 발사 → shot · hit(탄창 -1) · 1인칭 모델: " + " · ".join(f"{defs[k]['name']} {res6[k]['types'][:3]}" for k in ids))
            ok &= _check(notes, all(au["played"].get("shot_" + k, 0) >= 1 for k in ids), f"총성 6종 {[(k, au['played'].get('shot_' + k, 0)) for k in ids]}")

            # 6) 피해 — 거리 감쇠 · 부위 배율 · 방탄 · 처치 · 다시 일어섬
            r = pg.evaluate("""() => { __sh.reset('nuwool', 'sondeung', 1e6); const out = {};
                const one = (t, part) => { __fps.aimAt(t, part); __fps.setInput({ads: true}); __fps.step(0.4); const m = __sh.mark();
                  __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(0.4); const h = __sh.ev(m, ['hit']); return h.length ? h[0].p : null; };
                out.torso = one('tg1', 'torso'); out.head = one('tg1', 'head'); out.legs = one('tg1', 'legs'); out.armor = one('tg3', 'torso'); out.armorHead = one('tg3', 'head');
                out.far = one('tg2', 'torso');
                __fps.setInput({ads: null}); return out; }""")
            dist2 = ((3.2) ** 2 + 20 ** 2 + (1.62 - 1.15) ** 2) ** 0.5
            ok &= _check(notes, r["torso"] and abs(r["torso"]["dmg"] - 28) < 1e-6 and abs(r["head"]["dmg"] - 50.4) < 1e-6 and abs(r["legs"]["dmg"] - 22.4) < 1e-6,
                         f"부위 배율(너울 10m): 몸통 {r['torso'] and r['torso']['dmg']} · 머리 {r['head'] and r['head']['dmg']}(×1.8) · 다리 {r['legs'] and r['legs']['dmg']}(×0.8)")
            ok &= _check(notes, r["armor"] and r["armor"]["armored"] and abs(r["armor"]["dmg"] - 9.8) < 1e-6 and r["armorHead"] and not r["armorHead"]["armored"]
                         and abs(r["armorHead"]["dmg"] - 50.4) < 1e-6 and r["far"] and abs(r["far"]["dmg"] - 28) < 1e-6,
                         f"방탄 과녁(28m) 몸통 {r['armor'] and r['armor']['dmg']}(×0.35) · 머리 {r['armorHead'] and r['armorHead']['dmg']}(방탄 없음) · 20m 몸통 {r['far'] and r['far']['dmg']}(감쇠 전)")
            fo = J("""() => { const d = FG.cfg.WEAPONS.nuwool; return [FG.combat.falloff(d, 10), FG.combat.falloff(d, 45), FG.combat.falloff(d, 80), FG.combat.falloff(FG.cfg.WEAPONS.mulsu, 21)]; }""")
            ok &= _check(notes, fo == [28, 24, 20, 19], f"거리 감쇠(최대 → 최소 사이 직선): 너울 10m {fo[0]} · 45m {fo[1]} · 80m {fo[2]} / 물수제비 21m {fo[3]}")
            r = pg.evaluate("""async () => { __sh.reset('nuwool', 'sondeung'); const m = __sh.mark();
                const one = (part) => { __fps.aimAt('tg1', part); __fps.setInput({ads: true}); __fps.step(0.4); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); };
                one('head'); __fps.step(0.4); one('head'); __fps.step(0.05); await __sh.raf(); const hud = __fps.hud();
                const down = __sh.ev(m, ['targetDown']); const tg = __fps.targets()[0];
                const up = __sh.stepUntil(['targetUp'], 4, m); __fps.setInput({ads: null});
                return { hits: __sh.ev(m, ['hit']).map(x => [x.p.part, x.p.dmg, x.p.killed]), hud, down, tgDown: tg.down, up: up.length ? up[0].t - down[0].t : null }; }""")
            ok &= _check(notes, len(r["hits"]) == 2 and r["hits"][1][2] and r["down"] and r["tgDown"] and r["hud"]["hm"]["cls"] == "on k-kill" and r["up"] is not None and abs(r["up"] - 3.0) < 0.05,
                         f"머리 2발 → 처치 {r['hits']} · 굵은 주황 꺾쇠 {r['hud']['hm']['cls']} · 넘어짐 → {r['up'] and round(r['up'], 3)}초 뒤 일어섬")
            # HUD 맞힘 표시 종류(머리 = 꺾쇠 + 노랑 점, 방탄 = 파란 마름모) — X 모양 없음
            r = pg.evaluate("""async () => { __sh.reset('nuwool', 'sondeung', 1e6); const out = {};
                for (const [t, p] of [['tg1', 'head'], ['tg3', 'torso']]) { __fps.aimAt(t, p); __fps.setInput({ads: true}); __fps.step(0.4); __fps.setInput({fire: true}); __fps.step(1/60);
                  __fps.setInput({fire: null}); await __sh.raf(); const h = document.getElementById('hm');
                  const vis = [...h.children].filter(c => getComputedStyle(c).display !== 'none').map(c => c.className);
                  out[t + p] = { cls: h.className, vis, dotColor: getComputedStyle(h.querySelector('.dot')).backgroundColor, dia: getComputedStyle(h.querySelector('.dia')).borderTopColor };
                  __fps.step(0.6); await __sh.raf(); }
                __fps.setInput({ads: null}); return out; }""")
            hh, aa = r["tg1head"], r["tg3torso"]
            ok &= _check(notes, hh["cls"] == "on k-head" and "dot" in hh["vis"] and "dia" not in hh["vis"] and aa["cls"] == "on k-armor" and "dia" in aa["vis"],
                         f"맞힘 표시 모양: 머리 {hh['vis']}(노랑 점 {hh['dotColor']}) · 방탄 {aa['vis']}(마름모 {aa['dia']})")
            # 교체 0.45 / 권총 0.3 · 휠
            r = pg.evaluate("""() => { __sh.reset('nuwool', 'sondeung'); const m = __sh.mark(); __fps.press('weapon2'); __sh.stepUntil(['switchEnd'], 2, m);
                const a = __sh.ev(m, ['switch', 'switchEnd']); const w1 = __fps.weapon().id; const m2 = __sh.mark(); __fps.press('weapon1'); __sh.stepUntil(['switchEnd'], 2, m2);
                const b = __sh.ev(m2, ['switch', 'switchEnd']); const m3 = __sh.mark(); __fps.setInput({wheel: 1}); __fps.step(1/60); __fps.setInput({wheel: null}); __sh.stepUntil(['switchEnd'], 2, m3);
                return { a, b, w1, w2: __fps.weapon().id, wheel: __sh.ev(m3, ['switchEnd']) }; }""")
            ta = r["a"][1]["t"] - r["a"][0]["t"] if len(r["a"]) == 2 else None
            tb = r["b"][1]["t"] - r["b"][0]["t"] if len(r["b"]) == 2 else None
            ok &= _check(notes, r["w1"] == "sondeung" and ta is not None and abs(ta - 0.3) < 0.02 and tb is not None and abs(tb - 0.45) < 0.02
                         and r["wheel"] and r["w2"] == "sondeung",
                         f"교체: → 손등불 {ta and round(ta, 3)}초(0.3) · → 너울 {tb and round(tb, 3)}초(0.45) · 휠 → {r['w2']}")
            # 고배율 조준경(먼등불) — 시야각 · 원형 덮개 · 총 숨김 · 십자선 숨김
            r = pg.evaluate("""async () => { __sh.reset('meondeung', 'sondeung'); __fps.aimAt('tg3'); __fps.setInput({ads: true}); __fps.step(0.6); await __sh.raf();
                return { fov: __fps.camDir().fov, hud: __fps.hud(), vm: __fps.vm() }; }""")
            pg.screenshot(path=str(out / "shoot-scope.png"))
            ok &= _check(notes, abs(r["fov"] - 34.0) < 0.2 and r["hud"]["scope"] and r["vm"]["hidden"] and r["hud"]["xh"]["opacity"] == 0,
                         f"먼등불 조준: 시야각 {r['fov']}°(×2.5) · 원형 덮개 {r['hud']['scope']} · 총 숨김 {r['vm']['hidden']} · 십자선 투명 {r['hud']['xh']['opacity']}")
            r = pg.evaluate("""async () => { __sh.reset('nuwool', 'sondeung'); __fps.aimAt('tg2'); __fps.setInput({ads: true}); __fps.step(0.5); await __sh.raf();
                const a = __fps.hud(); __fps.setInput({ads: null}); __fps.step(0.5); await __sh.raf(); const h = __fps.hud();
                __fps.setInput({moveZ: 1}); __fps.step(0.8); await __sh.raf(); const mv = __fps.hud(); __fps.clearInput(); return { a, h, mv }; }""")
            ok &= _check(notes, r["a"]["xh"]["opacity"] == 0 and r["h"]["xh"]["opacity"] == 1 and r["mv"]["xh"]["gap"] > r["h"]["xh"]["gap"] + 2,
                         f"십자선: 조준 중 숨김({r['a']['xh']['opacity']}) · 허리 {r['h']['xh']['gap']}px → 걸으며 {r['mv']['xh']['gap']}px(흔들림만큼 벌어짐)")
            J("() => { __sh.reset('nuwool', 'sondeung'); __fps.aimAt('tg2'); __fps.setInput({ads: true}); __fps.step(0.5); }")
            pg.evaluate("() => __sh.raf()")
            pg.screenshot(path=str(out / "shoot-ads.png"))
            J("() => __fps.clearInput()")
            # 결정성 — 같은 입력 두 번 같은 결과
            det = pg.evaluate("""() => { const run = () => { __sh.reset('mulsu', 'sondeung', 1e6); __fps.aimAt('tg2'); __fps.setInput({moveX: 1}); const m = __sh.mark();
                __fps.fireFor(1.2); __fps.clearInput(); return __sh.ev(m, ['shot', 'hit']).map(x => x.type === 'hit' ? [x.p.part, x.p.pos] : x.p.dir); };
                return [JSON.stringify(run()), JSON.stringify(run())]; }""")
            ok &= _check(notes, det[0] == det[1] and len(det[0]) > 100, f"결정성(옆으로 걸으며 연사 — 흔들림 · 반동 · 맞은 곳) 두 번 같음({len(det[0])}자)")

            # 7) 실시간 연사 중 그리기 호출
            J("() => { __sh.reset('nuwool', 'sondeung', 1e6); __fps.infiniteAmmo(true); __fps.aimAt('tg2'); __fps.resumeLoop(); }")
            pg.wait_for_timeout(500)
            J("() => { __fps.perfReset(); __fps.setInput({fire: true}); }")
            pg.wait_for_timeout(2000)
            pg.screenshot(path=str(out / "shoot-fire.png"))
            p = J("() => __fps.perf()")
            J("() => { __fps.clearInput(); __fps.infiniteAmmo(false); }")
            n_shots = J("() => __fps.weapon().shots")
            ok &= _check(notes, 0 < p["callsMax"] <= 60, f"실시간 연사 2초: 그리기 호출 최대 {p['callsMax']} ≤ 60 · 삼각형 {p['trisMax']} · 무기 sim {p['ms']['shots']}ms/프레임 · 누적 발사 {n_shots}")
            summary.update({"shots": {"hip": str(out / "shoot-hip.png"), "ads": str(out / "shoot-ads.png"), "scope": str(out / "shoot-scope.png"), "fire": str(out / "shoot-fire.png")},
                            "fire_calls": p["callsMax"], "fire_tris": p["trisMax"]})
            if not args.core:   # S5 — 장비 · 효과 · 훈련장(고리를 다시 붙잡고 sim 만)
                J("() => __fps.pauseLoop()")
                ok &= _shoot_s5(pg, s, J, out, notes, summary, defs)
            ok &= _check(notes, not s.errors and not s.external and not s.missing,
                         f"오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
            if not args.core:   # S5 검증 뒤 고친 것(다시 시작 · 구역 바꾸기 · 넘기 · 반동 상한) — 새 화면에서
                ok &= _shoot_regress(s, notes, summary)
        finally:
            s.close()
    return finish("shoot", ok, summary, notes)


def _shoot_regress(s, notes, summary):
    """S5 검증에서 나온 문제의 되풀이 막기 — 구역을 번갈아 다시 시작해도 그림 자원이 쌓이지 않음 · 같은 구역 다시 시작 때 과녁 · 무기 · 던진 것 초기화 ·
    hk:restart 때 던진 것 치움 · 시험 구역 자기 폭발로 멈추지 않음 · 위 끝에서 쏴도 반동이 아래로 안 감 · 훈련장 상자는 넘어감(속도 이어짐)."""
    ok = True
    G = "() => FG.gfx.renderer.info.memory.geometries"
    def fresh():
        pg = s.page([HK_SPY])
        pg.goto(HOST + BODY_URL, wait_until="load")
        wait_ready(pg, 5000)
        return pg
    pg = fresh()
    geo = [pg.evaluate(G)]
    for i in range(8):
        pg.click("#btnSortie" if i % 2 == 0 else "#btnRange")
        _phase_wait(pg, "play")
        pg.evaluate("() => __fps.simulateHk('hk:restart')")
        geo.append(pg.evaluate(G))
    ok &= _check(notes, geo[-1] == geo[-3] == geo[-5] and geo[-2] == geo[-4] == geo[-6],
                 f"시험 구역 · 훈련장을 번갈아 다시 시작 8번 — geometries {geo}(번갈아 같은 값, 쌓이지 않음)")
    # 같은 구역 다시 시작 — 과녁 체력 · 무기 동작 · 던진 것
    pg.click("#btnSortie"); _phase_wait(pg, "play")
    pg.evaluate("""() => { __fps.pauseLoop(); FG.combat.targets[0].hp = 60; __fps.setInput({fire: true}); __fps.step(0.3); __fps.setInput({fire: null}); __fps.step(0.2);
        __fps.press('reload'); __fps.step(0.1); }""")
    a = pg.evaluate("() => ({ w: FG.weapons.state, hp: FG.combat.targets[0].hp })")
    pg.evaluate("() => __fps.spawnProjectile('grenade', [0, 1, 0], [0, 4, -4], 3)")
    np0 = pg.evaluate("() => __fps.projectiles().length")
    pg.evaluate("() => __fps.simulateHk('hk:restart')")
    np1 = pg.evaluate("() => ({ n: __fps.projectiles().length, ph: FG.game.phase, taint: FG.arcade.tainted })")
    pg.evaluate("() => __fps.spawnProjectile('grenade', [0, 1, 0], [0, 4, -4], 3)")   # 타이틀에서 남은 것이 있어도 출격이 치움
    pg.click("#btnSortie"); _phase_wait(pg, "play")
    b = pg.evaluate("() => { __fps.pauseLoop(); return { w: FG.weapons.state, hp: FG.combat.targets[0].hp, np: __fps.projectiles().length, mag: __fps.weapon().mag }; }")
    ok &= _check(notes, a["hp"] == 60 and a["w"] == "reload" and b["hp"] == 100 and b["w"] == "idle" and b["np"] == 0 and np0 >= 1 and np1["n"] == 0 and np1["ph"] == "title" and not np1["taint"],
                 f"같은 구역 다시 시작: 과녁 체력 {a['hp']} → {b['hp']} · 무기 {a['w']} → 첫 단계 전 {b['w']} · 던진 것 {np0} → hk:restart {np1['n']} → 출격 {b['np']} · 타이틀에서 시험 표시 {np1['taint']}")
    # 시험 구역 자기 폭발 · 위 끝 반동
    c = pg.evaluate("""() => { const e = __fps.state().pos; __fps.explodeAt([e[0], e[1] + 0.3, e[2] - 0.5], 'rocket'); __fps.step(0.1);
        const hp = FG.player.hp, alive = FG.player.alive; __fps.setHp(100); __fps.look(0, 89); __fps.step(0.6); const n0 = __fps.weapon().shots;
        __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null});
        return { hp, alive, shot: __fps.weapon().shots - n0, rp: FG.weapons.recoil.pitch * 180 / Math.PI }; }""")
    ok &= _check(notes, c["alive"] and c["hp"] >= 1 and c["shot"] == 1 and c["rp"] >= 0,
                 f"시험 구역 t0 발밑 천둥통 → 쓰러지지 않음(체력 {c['hp']} · S7 쓰러짐 단계 전까지 safe) · 89° 보고 한 발 → 반동 {c['rp']:.3f}° ≥ 0")
    # 훈련장 넘기 상자 — 넘어가고 속도가 이어짐
    pg = fresh()
    pg.click("#btnRange"); _phase_wait(pg, "play")
    v = pg.evaluate("""() => { __fps.pauseLoop(); __fps.teleportTo('tr.vault'); __fps.look(0, 0); __fps.step(0.3); const pr = __fps.vaultProbe();
        __fps.setInput({moveZ: 1}); __fps.step(0.3); __fps.press('jump'); let end = null;
        for (let k = 0; k < 60; k++) { __fps.step(1/60); const s = __fps.state(); if (!end && s.stance === 'stand' && k > 3) end = +Math.hypot(s.vel[0], s.vel[2]).toFixed(2); }
        __fps.clearInput(); const ev = __fps.events().filter(e => e.type === 'vaultEnd').slice(-1)[0];
        return { pr, end, over: ev ? ev.payload.over : null, y: __fps.state().pos[1] }; }""")
    ok &= _check(notes, v["pr"] and v["pr"]["over"] and v["over"] and v["end"] and v["end"] >= 4.0 and abs(v["y"] - 3) < 0.05,
                 f"훈련장 낮은 상자 넘기: 미리 보기 {v['pr']} · 넘기 끝 over {v['over']} · 끝난 순간 수평 속도 {v['end']}m/s(걷기 이상 이어짐) · 갑판 높이 {v['y']}")
    ok &= _check(notes, not s.errors and not s.external and not s.missing, f"(새 화면) 오류 0 {s.errors[:4]}")
    summary["regress"] = {"geometries": geo, "restart": b, "vault": v}
    return ok


# ───────────────────────────── shoot(S5 — 장비 · 효과 · 훈련장) ─────────────────────────────

def _hue_ok(rgb):
    """붉은 입자 금지 — 채도가 있는 색은 색상각 28°~ 200°(노랑 · 주황 · 물빛)만, 채도 낮은 회색 · 갈색은 통과."""
    r, g, b = rgb
    mx, mn = max(rgb), min(rgb)
    if mx <= 0:
        return True, 0, 0
    sat = (mx - mn) / mx
    if mx == mn:
        hue = 0.0
    elif mx == r:
        hue = (60 * ((g - b) / (mx - mn)) + 360) % 360
    elif mx == g:
        hue = 60 * ((b - r) / (mx - mn)) + 120
    else:
        hue = 60 * ((r - g) / (mx - mn)) + 240
    return (sat < 0.3) or (28 <= hue <= 200), round(hue, 1), round(sat, 2)


def _shoot_s5(pg, s, J, out, notes, summary, defs):
    ok = True
    s5 = {}
    # A) 부착물 9종 · 칸 제한
    att = J("() => __fps.attachDefs()")
    n9 = sum(len([k for k in att[c] if isinstance(att[c][k], dict)]) for c in ("optic", "muzzle", "mag"))
    ok &= _check(notes, n9 == 9 and all(att[c][k].get("pro") and att[c][k].get("con") for c in ("optic", "muzzle", "mag") for k in att[c]),
                 f"부착물 9종(칸마다 장점 1 + 단점 1): {[(c, [att[c][k]['name'] for k in att[c]]) for c in ('optic', 'muzzle', 'mag')]}")
    r = pg.evaluate("""() => { const o = {};
        __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { mag: 'gotgan' } } }); __sh.reset !== undefined; o.big = __fps.weapon();
        __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { mag: 'multtae' } } }); o.fast = __fps.weapon();
        __fps.setLoadout({ primary: 'neoreok', secondary: 'sondeung', attach: { primary: { optic: 'banditbul', mag: 'gotgan' } } }); o.sg = __fps.weapon();
        __fps.setLoadout({ primary: 'cheondung', secondary: 'sondeung', attach: { primary: { optic: 'maenun', muzzle: 'sombang', mag: 'gotgan' } } }); o.rk = __fps.weapon();
        return o; }""")
    big, fast, sg, rk = r["big"], r["fast"], r["sg"], r["rk"]
    ok &= _check(notes, big["cap"] == 45 and big["mag"] == 45 and abs(big["mods"]["reload"][0] - 2.2) < 1e-6 and abs(big["mods"]["reload"][1] - 2.8) < 1e-6 and abs(big["mods"]["ads"] - 0.28) < 1e-6,
                 f"큰 탄창 「곳간」: 탄창 30 → {big['cap']}(+50%) · 재장전 {big['mods']['reload']}(+0.4) · 조준 {big['mods']['ads']}초(+0.03)")
    ok &= _check(notes, fast["cap"] == 24 and abs(fast["mods"]["reload"][0] - 1.35) < 1e-6 and abs(fast["mods"]["reload"][1] - 1.8) < 1e-6,
                 f"빠른 탄창 「물때」: 탄창 {fast['cap']}(−20%) · 재장전 {fast['mods']['reload']}(×0.75)")
    ok &= _check(notes, sg["att"]["optic"] == "iron" and sg["att"]["mag"] == "gotgan" and sg["cap"] == 9 and rk["att"] == {"optic": "iron", "muzzle": "none", "mag": "std"} and rk["cap"] == 1,
                 f"칸 제한: 산탄총 조준경 칸 없음 {sg['att']}(탄창 6 → {sg['cap']}) · 발사기 부착물 없음 {rk['att']}")
    # 큰 탄창 실제 반영 — 쏘고 전술 재장전 → 45 + 약실 1, 시간 2.2초, HUD 탄약
    r = pg.evaluate("""async () => { __fps.clearInput(); __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { mag: 'gotgan' } } });
        __fps.resetTargets({hp: 1e6}); __fps.teleportTo('t0.range'); __fps.step(0.3); __fps.aimAt([0, 1.5, -19.6]); __fps.fireFor(0.3); __fps.step(0.2);
        const m = __sh.mark(); __fps.press('reload'); __sh.stepUntil(['reloadEnd'], 4, m); await __sh.raf();
        return { e: __sh.ev(m, ['reloadEnd']), w: __fps.weapon(), hud: __fps.hud() }; }""")
    re_ = r["e"][0]["p"] if r["e"] else None
    ok &= _check(notes, re_ and re_["kind"] == "tac" and re_["mag"] == 46 and abs(re_["t"] - 2.2) < 0.02 and r["hud"]["ammo"]["mag"] == "46",
                 f"큰 탄창 반영: 전술 재장전 {re_ and re_['t']}초 → 탄창 {re_ and re_['mag']}(45 + 약실 1) · HUD 「{r['hud']['ammo']['mag']} {r['hud']['ammo']['reserve']}」")
    # 소음기 — shot.silenced · 경계 반경 12 · 총구 화염 숨김 · 소리 · 감쇠 −15%
    r = pg.evaluate("""async () => { __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { muzzle: 'sombang' } } });
        __fps.teleportTo('t0.range'); __fps.step(0.3); __fps.aimAt('tg2'); const m = __sh.mark(); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null});
        await __sh.raf(); const vm = __fps.vm(); const sh = __sh.ev(m, ['shot'])[0].p; __fps.step(0.3);
        const d = FG.cfg.WEAPONS.nuwool;
        return { sh, vm, au: __fps.audio(), f: [FG.combat.falloff(d, 28, 0.85), FG.combat.falloff(d, 28, 1), FG.combat.falloff(d, 51, 0.85)] }; }""")
    ok &= _check(notes, r["sh"]["silenced"] and r["sh"]["noise"] == 12 and not r["vm"]["flash"] and "sup" in r["vm"]["att"] and r["au"]["played"].get("shot_sil", 0) >= 1
                 and r["f"][1] == 28 and r["f"][0] < 28 and r["f"][2] == 20,
                 f"소음기 「솜방망이」: silenced · 경계 반경 {r['sh']['noise']}m(40 → 12) · 총구 화염 {r['vm']['flash']} · 모델 {r['vm']['att']} · 소리 shot_sil · 28m 피해 {r['f'][1]} → {round(r['f'][0], 2)}(감쇠 거리 −15%)")
    # 반동 억제기 — 수직 킥 ×0.8 · 조준 +0.04
    r = pg.evaluate("""() => { const k = (att) => { __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: att } }); __fps.teleportTo('t0.range'); __fps.step(0.3);
        __fps.aimAt([0, 1.5, -19.6]); const m = __sh.mark(); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(0.4); return [__sh.ev(m, ['shot'])[0].p.kick, __fps.weapon().mods.ads]; };
        return { base: k({}), dat: k({ muzzle: 'dat' }) }; }""")
    ok &= _check(notes, abs(r["dat"][0][0] - r["base"][0][0] * 0.8) < 1e-3 and abs(r["dat"][1] - 0.29) < 1e-6,
                 f"반동 억제기 「닻」: 첫 탄 수직 킥 {r['base'][0][0]}° → {r['dat'][0][0]}°(×0.8) · 조준 {r['dat'][1]}초(+0.04)")
    # 조준경 — 반딧불 ×1.4(가운데 청록 점) · 매눈 ×2.5(원형 덮개 · 조준 중 이동 −15%)
    r = pg.evaluate("""async () => { const o = {};
        for (const op of ['banditbul', 'maenun']) { __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { optic: op } } }); __fps.teleportTo('t0.range');
          __fps.aimAt('tg2'); __fps.setInput({ads: true}); __fps.step(0.6); await __sh.raf(); o[op] = { fov: __fps.camDir().fov, hud: __fps.hud(), vm: __fps.vm(), w: __fps.weapon(), mm: FG.weapons.moveMul() };
          if (op === 'banditbul') { await __sh.raf(); o.shot = true; } __fps.setInput({ads: null}); __fps.step(0.5); }
        return o; }""")
    pg.screenshot(path=str(out / "shoot-dot.png")) if False else None
    import math
    fov14 = 2 * math.degrees(math.atan(math.tan(math.radians(37.5)) / 1.4))
    fov25 = 2 * math.degrees(math.atan(math.tan(math.radians(37.5)) / 2.5))
    b, mn = r["banditbul"], r["maenun"]
    ok &= _check(notes, abs(b["fov"] - fov14) < 0.05 and b["hud"]["dot"] and "dot" in b["vm"]["att"] and b["vm"]["sightY"] > 0.1 and abs(b["w"]["mods"]["ads"] - 0.28) < 1e-6,
                 f"점 조준경 「반딧불」: 조준 시야각 {b['fov']}°(×1.4 = {fov14:.2f}) · 가운데 청록 점 {b['hud']['dot']} · 모델 {b['vm']['att']} · 조준선 높이 {b['vm']['sightY']} · 조준 {b['w']['mods']['ads']}초")
    ok &= _check(notes, abs(mn["fov"] - fov25) < 0.05 and mn["hud"]["scope"] and mn["vm"]["hidden"] and abs(mn["mm"] - 0.95 * 0.6 * 0.85) < 1e-3 and abs(mn["w"]["mods"]["ads"] - 0.33) < 1e-6,
                 f"배율 조준경 「매눈」: 시야각 {mn['fov']}°(×2.5) · 원형 덮개 {mn['hud']['scope']} · 총 숨김 {mn['vm']['hidden']} · 조준 중 이동 배율 {round(mn['mm'], 4)}(0.95 × 0.6 × 0.85) · 조준 {mn['w']['mods']['ads']}초")
    J("() => { __fps.setInput({ads: true}); }")
    pg.evaluate("""async () => { __fps.setLoadout({ primary: 'nuwool', secondary: 'sondeung', attach: { primary: { optic: 'banditbul', muzzle: 'dat', mag: 'gotgan' } } });
        __fps.teleportTo('t0.range'); __fps.aimAt('tg2'); __fps.setInput({ads: true}); __fps.step(0.6); await __sh.raf(); await __sh.raf(); }""")
    pg.screenshot(path=str(out / "shoot-dot.png"))
    J("() => { __fps.clearInput(); }")

    # B) 근접 V — 1.5m 안 1회 무력화(방탄 2회) · 밖이면 헛침 · 재장전 취소
    r = pg.evaluate("""() => { __fps.clearInput(); __fps.setLoadout({}); __fps.resetTargets(); const o = {};
        const at = (id, d) => { const t = __fps.targets().find(x => x.id === id); __fps.teleport(t.pos[0], t.pos[1], t.pos[2] + d, 0); __fps.look(0, -5); __fps.step(0.1); };
        at('tg1', 1.3); let m = __sh.mark(); __fps.press('melee'); __fps.step(0.7); o.near = __sh.ev(m, ['melee', 'meleeHit', 'meleeMiss', 'hit', 'targetDown']);
        __fps.resetTargets(); at('tg1', 1.95); m = __sh.mark(); __fps.press('melee'); __fps.step(0.7); o.far = __sh.ev(m, ['meleeHit', 'meleeMiss', 'hit']);
        at('tg3', 1.3); m = __sh.mark(); __fps.press('melee'); __fps.step(0.7); __fps.press('melee'); __fps.step(0.7); o.arm = __sh.ev(m, ['meleeHit', 'hit']);
        __fps.resetTargets(); at('tg1', 6); __fps.aimAt([0, 1.5, -19.6]); __fps.fireFor(0.3); __fps.step(0.2); __fps.press('reload'); __fps.step(0.4);
        m = __sh.mark(); const mag = __fps.weapon().mag; __fps.press('melee'); __fps.step(0.1); o.cancel = __sh.ev(m, ['reloadCancel', 'melee']); o.st = __fps.weapon().state; o.mag = [mag, __fps.weapon().mag];
        let t0 = null, t1 = null; for (let k = 0; k < 60; k++) { const w = __fps.weapon(); if (w.state === 'melee' && t0 === null) t0 = __fps.state().time; if (t0 !== null && w.state !== 'melee') { t1 = __fps.state().time; break; } __fps.step(1/60); }
        o.dur = t0 !== null && t1 !== null ? t1 - t0 + 0.1 : null; return o; }""")
    near_hit = [x for x in r["near"] if x["type"] == "hit"]
    ok &= _check(notes, any(x["type"] == "meleeHit" for x in r["near"]) and near_hit and near_hit[0]["p"]["kind"] == "melee" and near_hit[0]["p"]["killed"]
                 and any(x["type"] == "targetDown" for x in r["near"]),
                 f"근접 V: 1.3m 과녁 → {[x['type'] for x in r['near']]} · 한 번에 무력화({near_hit and near_hit[0]['p']['dmg']})")
    ok &= _check(notes, [x["type"] for x in r["far"]] == ["meleeMiss"], f"근접 1.95m(1.5m 밖) → {[x['type'] for x in r['far']]}")
    arm = [x["p"] for x in r["arm"] if x["type"] == "hit"]
    ok &= _check(notes, len(arm) == 2 and not arm[0]["killed"] and arm[1]["killed"], f"방탄 과녁 근접 2회 무력화 {[(a['dmg'], a['killed']) for a in arm]}")
    ok &= _check(notes, r["cancel"] and r["cancel"][0]["type"] == "reloadCancel" and r["cancel"][0]["p"]["why"] == "melee" and r["st"] == "melee" and r["dur"] and abs(r["dur"] - 0.6) < 0.04,
                 f"재장전 중 V → 재장전 취소({r['cancel'] and r['cancel'][0]['p']['why']}) · 근접 경직 {r['dur'] and round(r['dur'], 3)}초(0.6)")

    # C) 벽 앞 총 거두기 — 총구 앞 0.6m 안이 벽이면 못 쏨 · 총이 올라감
    r = pg.evaluate("""async () => { __fps.clearInput(); __fps.setLoadout({}); __fps.teleport(-8, 0, -18.95, 0); __fps.look(0, 0); __fps.step(0.3);
        const m = __sh.mark(); __fps.setInput({fire: true, ads: true}); __fps.step(0.3); __fps.setInput({fire: null, ads: null}); await __sh.raf(); await __sh.raf();
        const a = { w: __fps.weapon(), shots: __sh.ev(m, ['shot']).length, ev: __sh.ev(m, ['blocked']), vm: __fps.vm(), st: __fps.state().gunBlocked };
        __fps.teleport(-8, 0, -17.6, 0); __fps.step(0.2); const m2 = __sh.mark(); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(0.1);
        a.after = { shots: __sh.ev(m2, ['shot']).length, blocked: __fps.weapon().blocked };
        __fps.teleport(-8, 0, -18.95, 0); __fps.look(0, -80); __fps.step(0.2); a.floor = __fps.weapon().blocked; return a; }""")
    ok &= _check(notes, r["st"] and r["shots"] == 0 and r["w"]["adsT"] == 0 and r["vm"]["blockK"] > 0.5 and r["after"]["shots"] == 1 and not r["after"]["blocked"] and not r["floor"],
                 f"벽 앞 총 거두기: 벽까지 0.6m → 막힘 {r['st']} · 발사 {r['shots']}발 · 조준 {r['w']['adsT']} · 총 올림 {r['vm']['blockK']} / 물러서면 발사 {r['after']['shots']}발 / 바닥을 보면 안 막힘({r['floor']})")

    # D) 발사기 — 날아가는 탄(70m/s) → 맞은 곳 폭발
    r = pg.evaluate("""() => { __fps.clearInput(); __fps.setLoadout({ primary: 'cheondung', secondary: 'sondeung' }); __fps.resetTargets({hp: 1e6}); __fps.teleportTo('t0.range'); __fps.step(0.5);
        const a = __fps.aimAt('tg2'); const m = __sh.mark(); __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null});
        const fly = __fps.projectiles(); __sh.stepUntil(['explode'], 2, m); return { a, fly, e: __sh.ev(m, ['shot', 'projSpawn', 'rocketHit', 'explode', 'hit']) }; }""")
    sp = next((x for x in r["e"] if x["type"] == "projSpawn"), None)
    rh = next((x for x in r["e"] if x["type"] == "rocketHit"), None)
    hx = next((x["p"] for x in r["e"] if x["type"] == "hit"), None)
    tt = (rh["t"] - sp["t"]) if sp and rh else None
    ok &= _check(notes, r["fly"] and r["fly"][0]["kind"] == "rocket" and rh and rh["p"]["target"] == "tg2" and hx and hx["kind"] == "explosion" and tt is not None and abs(tt - r["a"]["dist"] / 70) < 0.05,
                 f"발사기 「천둥통」: 날아가는 탄 {r['fly'] and r['fly'][0]['kind']} → {r['a']['dist']}m 를 {tt and round(tt, 3)}초(70m/s) 뒤 과녁에 맞아 폭발 · 피해 {hx and (hx['kind'], hx['dmg'])}")

    # E) 기대기 켬 → 섬광 키 4(실제 키보드) · G(실제 키보드)
    keys = J("() => __fps.setControls({ lean: true })")
    pg.evaluate("""() => { __fps.clearInput(); __fps.setLoadout({}); __fps.teleportTo('t0.range'); __fps.look(0, 10); __fps.step(0.3); window.__m5 = __sh.mark(); __fps.resumeLoop(); }""")
    pg.keyboard.down("Digit4"); pg.wait_for_timeout(250); pg.keyboard.up("Digit4"); pg.wait_for_timeout(500)
    pg.keyboard.down("KeyG"); pg.wait_for_timeout(250); pg.keyboard.up("KeyG"); pg.wait_for_timeout(400)
    r = pg.evaluate("() => { __fps.pauseLoop(); return __sh.ev(window.__m5, ['cook', 'throw']).map(x => [x.type, x.p.kind]); }")
    keys2 = J("() => __fps.setControls({ lean: false })")
    ok &= _check(notes, keys["flash"] == "Digit4" and keys["leanL"] == "KeyQ" and ["cook", "flash"] in r and ["throw", "flash"] in r and ["throw", "grenade"] in r and keys2["flash"] == "KeyQ",
                 f"기대기 켬 → 섬광 키 {keys['flash']}(기대기 {keys['leanL']}/{keys['leanR']}) · 실제 키 4 · G → {r} · 끄면 섬광 {keys2['flash']}")
    pg.evaluate("() => { __sh.stepUntil(['explode'], 4); __sh.stepUntil(['explode'], 4); __fps.step(0.5); }")

    # F) 훈련장 구역 — 관통(나무 판자 · 얇은 철판 뚫림 ×0.5 · 콘크리트 막힘)
    z = J("() => __fps.loadZone('tr')")
    tg = J("() => __fps.targets().map(t => t.id)")
    ok &= _check(notes, z == ["tr"] and tg == ["tgWood", "tgConc", "tgSteel", "tgOpen", "tgCover", "buoy1", "buoy2", "buoy3"], f"훈련장 구역 tr · 과녁 {tg}")
    r = pg.evaluate("""() => { __fps.clearInput(); __fps.setLoadout({}); __fps.resetTargets({hp: 1e6}); __fps.teleportTo('tr.range'); __fps.step(0.3); const o = {};
        for (const id of ['tgWood', 'tgConc', 'tgSteel']) { __fps.aimAt(id); __fps.setInput({ads: true}); __fps.step(0.4); __fps.aimAt(id); const m = __sh.mark();
          __fps.setInput({fire: true}); __fps.step(1/60); __fps.setInput({fire: null}); __fps.step(0.3); o[id] = __sh.ev(m, ['impact', 'hit']).map(x => x.type === 'hit' ? ['hit', x.p.targetId, x.p.dmg, x.p.pen] : ['impact', x.p.mat, x.p.kind, x.p.pen, x.p.thick || null]); }
        __fps.setInput({ads: null}); return o; }""")
    w, c, st = r["tgWood"], r["tgConc"], r["tgSteel"]
    ok &= _check(notes, w[0][:4] == ["impact", "wood", "bullet", True] and w[1][:3] == ["impact", "wood", "exit"] and w[-1][:2] == ["hit", "tgWood"] and abs(w[-1][2] - 14) < 1e-6 and w[-1][3] == 1,
                 f"나무 판자 관통: {w} → 피해 28 × 0.5 = {w[-1][2] if w and w[-1][0] == 'hit' else None}")
    ok &= _check(notes, c == [["impact", "concrete", "bullet", False, None]], f"콘크리트 막힘: {c}(과녁 피해 없음)")
    ok &= _check(notes, st and st[-1][:2] == ["hit", "tgSteel"] and abs(st[-1][2] - 14) < 1e-6, f"얇은 철판 관통: {st}")

    # G) 수류탄 — 반경 5m 안 과녁 피해 · 엄폐(콘크리트 벽) 뒤 무피해 · 반경 밖 무피해
    r = pg.evaluate("""() => { __fps.resetTargets(); const o = {};
        let m = __sh.mark(); __fps.explodeAt([12, 0.8, -22], 'grenade'); __fps.step(1/60); o.inR = __sh.ev(m, ['hit']).map(x => [x.p.targetId, x.p.dmg, x.p.kind]);
        __fps.resetTargets(); m = __sh.mark(); __fps.explodeAt([12, 0.8, -27.2], 'grenade'); __fps.step(1/60); o.outR = __sh.ev(m, ['hit']).map(x => [x.p.targetId, x.p.dmg]);
        o.dOut = Math.min(...__fps.targets().map(t => Math.hypot(t.parts.torso[0] - 12, t.parts.torso[1] - 0.8, t.parts.torso[2] + 27.2)));
        o.dOpen = Math.hypot(10 - 12, 1.75 - 0.8); o.dCover = Math.hypot(14.4 - 12, 1.75 - 0.8);
        o.los = [__fps.los([12, 0.8, -22], [10, 1.75, -22]), __fps.los([12, 0.8, -22], [14.4, 1.75, -22])];
        return o; }""")
    ids = [x[0] for x in r["inR"]]
    exp = 150 + (20 - 150) * min(1, r["dOpen"] / 5)
    ok &= _check(notes, ids == ["tgOpen"] and abs(r["inR"][0][1] - exp) < 0.05 and r["los"] == [True, False] and r["dCover"] < 5,
                 f"수류탄 반경 5m: 드러난 과녁({r['dOpen']:.2f}m) 피해 {r['inR']} · 벽 뒤 과녁({r['dCover']:.2f}m, 시야 {r['los'][1]}) 무피해")
    ok &= _check(notes, r["outR"] == [] and 5 < r["dOut"] < 6, f"반경 밖(가장 가까운 과녁 {r['dOut']:.2f}m) 무피해 {r['outR']}")
    # 실제로 던지기 — 쿠킹 0.5초 → 퓨즈 3초(쥔 시간 포함) · 궤적 점 30개 · 첫 닿는 곳 ≈ 궤적 끝 · 튕김
    r = pg.evaluate("""async () => { __fps.clearInput(); __fps.resetTargets(); __fps.teleportTo('tr.range'); __fps.aimAt([12, 0.8, -22]); __fps.turn(0, 12); __fps.step(0.3);
        const g0 = __fps.state().gear.grenade; const m = __sh.mark(); __fps.setInput({grenade: true}); __fps.step(0.5); await __sh.raf(); const fx = __fps.fx(); const hud = __fps.hud();
        __fps.setInput({grenade: null}); __fps.step(1/60); const g1 = __fps.state().gear.grenade; const ex = __sh.stepUntil(['explode'], 4, m);
        return { fx, hud, g0, g1, e: __sh.ev(m, ['cook', 'throw', 'projSpawn', 'bounce', 'projRest', 'explode', 'hit']) }; }""")
    ev = {x["type"]: x for x in reversed(r["e"])}
    cook, thr, bnc, ex = ev.get("cook"), ev.get("throw"), next((x for x in r["e"] if x["type"] == "bounce"), None), ev.get("explode")
    fuse_t = (ex["t"] - cook["t"]) if cook and ex else None
    arc_d = None
    if bnc and r["fx"]["arcEnd"]:
        a2, b2 = bnc["p"]["pos"], r["fx"]["arcEnd"]
        arc_d = math.dist(a2, b2)
    ok &= _check(notes, cook and thr and abs(thr["p"]["cooked"] - 0.5) < 0.03 and fuse_t is not None and abs(fuse_t - 3.0) < 0.03 and ex["p"]["kind"] == "grenade" and ex["p"]["by"] == "player",
                 f"수류탄 G 길게(쿠킹 {thr and thr['p']['cooked']}초) → 쥔 때부터 {fuse_t and round(fuse_t, 3)}초에 폭발(퓨즈 3초)")
    ok &= _check(notes, 10 <= r["fx"]["arc"] <= 30 and arc_d is not None and arc_d < 0.6 and r["hud"]["fuse"] and r["g1"] == r["g0"],
                 f"궤적 점 {r['fx']['arc']}개(≤ 30) · 첫 닿는 곳과 궤적 끝 차 {arc_d and round(arc_d, 3)}m · 남은 퓨즈 표시 「{r['hud']['fuse']}」 · 훈련장이라 개수 그대로 {r['g0']} → {r['g1']}")
    # 손에서 터짐(퓨즈 다 될 때까지 쥠) — 훈련장은 쓰러지지 않음(체력 1 남김)
    r = pg.evaluate("""() => { __fps.clearInput(); __fps.teleportTo('tr.range'); __fps.step(0.2); const m = __sh.mark(); __fps.setInput({grenade: true}); __fps.step(3.2); __fps.setInput({grenade: null}); __fps.step(0.1);
        return { e: __sh.ev(m, ['throw', 'explode', 'playerHurt']), hp: __fps.state().hp }; }""")
    thr = next((x["p"] for x in r["e"] if x["type"] == "throw"), None)
    hurt = next((x["p"] for x in r["e"] if x["type"] == "playerHurt"), None)
    ok &= _check(notes, thr and thr["fuse"] == 0 and hurt and r["hp"] >= 1 and any(x["type"] == "explode" for x in r["e"]),
                 f"너무 오래 쥠 → 손에서 터짐(퓨즈 {thr and thr['fuse']}) · 플레이어 피해 {hurt and hurt['dmg']} · 훈련장이라 체력 {r['hp']} 남음")
    J("() => { __fps.setHp(100); __fps.step(0.1); }")

    # H) 섬광 — 반경 8m · 시야 트인 과녁 멍함 · 플레이어 흰빛(동작 줄이기면 회색 · 짧게)
    r = pg.evaluate("""async () => { __fps.resetTargets(); const o = {};
        let m = __sh.mark(); __fps.explodeAt([12, 0.8, -22], 'flash'); __fps.step(1/60); o.a = __sh.ev(m, ['stun', 'flashed']).map(x => [x.type, x.p.id || null, x.p.dur]);
        __fps.resetTargets(); const fp = [12, 0.8, -26];
        m = __sh.mark(); __fps.explodeAt(fp, 'flash'); __fps.step(1/60); o.b = __sh.ev(m, ['stun']).map(x => x.p.id);
        o.d = __fps.targets().map(t => [t.id, +Math.hypot(t.parts.head[0] - fp[0], t.parts.head[1] - fp[1], t.parts.head[2] - fp[2]).toFixed(2), __fps.los(fp, t.parts.head)]);
        o.exp = o.d.filter(x => x[1] <= 8 && x[2]).map(x => x[0]);
        __fps.teleportTo('tr.range'); __fps.look(0, 0); __fps.step(0.2); const e = __fps.state().eye;
        m = __sh.mark(); __fps.explodeAt([e[0], e[1] - 0.4, e[2] - 3], 'flash'); __fps.step(1/60); await __sh.raf(); o.me = __sh.ev(m, ['flashed']).map(x => x.p); o.hud = __fps.hud();
        o.tgs = __fps.targets().length;
        FG.cfg.CAMFX.REDUCE = true; __fps.step(1.6); await __sh.raf(); m = __sh.mark(); __fps.explodeAt([e[0], e[1] - 0.4, e[2] - 3], 'flash'); __fps.step(1/60); await __sh.raf();
        o.red = __fps.hud(); FG.cfg.CAMFX.REDUCE = false; __fps.step(1.6); await __sh.raf();
        return o; }""")
    stun_ids = [x[1] for x in r["a"] if x[0] == "stun"]
    out8 = [x for x in r["d"] if 8 < x[1] <= 10]
    ok &= _check(notes, stun_ids == ["tgOpen"] and not any(x[0] == "flashed" for x in r["a"]) and sorted(r["b"]) == sorted(r["exp"]) and len(r["b"]) >= 1 and out8,
                 f"섬광 반경 8m: 부잔교 가운데 → 멍함 {stun_ids}(벽 뒤 과녁 빠짐 · 18m 밖 플레이어 흰빛 없음) / 물 위에서 → {r['b']}(8m 안 · 시야 트인 것 {r['exp']}, 8m 밖 {out8})")
    me = r["me"][0] if r["me"] else None
    ok &= _check(notes, me and abs(me["dur"] - 1.5 * me["amount"]) < 0.01 and me["amount"] > 0.7 and r["hud"]["flash"]["on"] and r["hud"]["flash"]["opacity"] > 0.5 and not r["hud"]["flash"]["grey"],
                 f"플레이어 앞 3m 섬광 → 흰빛 {me and me['dur']}초(최대 1.5) · 덮개 {r['hud']['flash']}")
    ok &= _check(notes, r["red"]["flash"]["grey"] and 0 < r["red"]["flash"]["t"] <= 0.8 + 1e-6,
                 f"동작 줄이기 → 회색 · 짧게 {r['red']['flash']}")
    pg.screenshot(path=str(out / "shoot-range.png")) if False else None

    # I) 효과 — 붉은 입자 없음 · 탄흔 · 예광 · 탄피 · 점광 · 폭발 빛 · 화면 흔들림
    r = pg.evaluate("""async () => { __fps.clearInput(); __fps.setLoadout({}); __fps.resetTargets({hp: 1e6}); __fps.teleportTo('tr.range'); __fps.aimAt('tgWood'); __fps.step(0.2);
        __fps.setInput({fire: true}); __fps.step(1/60); await __sh.raf(); const a = __fps.fx(); __fps.step(0.1); __fps.setInput({fire: null});
        __fps.explodeAt([12, 0.8, -22], 'grenade'); __fps.step(1/60); await __sh.raf(); const b = __fps.fx(); const cam = FG.camfx.state(); const sh = FG.camfx.shakeA; return { a, b, sh }; }""")
    pg.screenshot(path=str(out / "shoot-fx.png"))
    bad = []
    for col in r["b"]["colors"]:
        rgb = [float(x) for x in col.split(",")]
        good, hue, sat = _hue_ok(rgb)
        if not good:
            bad.append((col, hue, sat))
    ok &= _check(notes, r["a"]["tracers"] >= 1 and r["a"]["shells"] >= 1 and r["a"]["lights"] >= 1 and r["b"]["decals"] >= 3 and r["b"]["particles"] > 50 and r["b"]["blasts"] >= 1 and r["sh"] > 0,
                 f"효과: 예광 {r['a']['tracers']} · 탄피 {r['a']['shells']} · 총구 점광 {r['a']['lights']}/{r['a']['lightPool']} · 탄흔 {r['b']['decals']} · 입자 {r['b']['particles']} · 폭발 빛 {r['b']['blasts']} · 흔들림 {round(r['sh'], 3)}")
    ok &= _check(notes, not bad and len(r["b"]["colors"]) >= 5, f"붉은 입자 없음 — 쓴 색 {len(r['b']['colors'])}가지 모두 노랑 · 주황 · 회색 · 갈색 · 물빛 {bad}")
    s5["fx"] = r["b"]
    # 첫 폭발 끊김 없음 — 셰이더 프로그램 수가 폭발 전후 같음(미리 만들어 둠)은 새 페이지에서 따로 잼(아래)
    ok &= _check(notes, not s.errors and not s.external and not s.missing,
                 f"(첫 화면) 오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")

    # J) 새 화면 — 타이틀에서 「훈련장」 실제 클릭 → 과제 6개를 __fps 입력만으로
    pg = s.page([HK_SPY])
    pg.goto(HOST + BODY_URL, wait_until="load")
    r_ok, _ = wait_ready(pg, 5000)
    prog0 = pg.evaluate("() => __fps.perf().programs")
    pg.click("#btnRange")
    ok &= _check(notes, r_ok and _phase_wait(pg, "play"), "타이틀 「훈련장」 실제 클릭 → play")
    pg.wait_for_timeout(400)
    pg.evaluate(SHOOT_JS)
    st = pg.evaluate(ST)
    hud0 = pg.evaluate("() => __fps.hud()")
    ok &= _check(notes, st["zones"] == ["tr"] and st["drill"]["active"] and hud0["drill"]["on"] and hud0["drill"]["items"] == 6 and hud0["drill"]["display"] == "block",
                 f"훈련장: 구역 {st['zones']} · 과제 표 {hud0['drill']['items']}칸 「{hud0['drill']['text'][:40]}…」")
    # 첫 폭발 · 첫 총구 점광 — 셰이더 다시 만들기 없음
    pg.evaluate("() => { __fps.pauseLoop(); const e = __fps.state().eye; __fps.explodeAt([e[0] + 3, e[1] - 2, e[2] - 9], 'grenade'); __fps.explodeAt([e[0] - 3, e[1] - 2, e[2] - 9], 'flash'); __fps.step(1/60); }")
    pg.evaluate("() => __sh.raf()"); pg.evaluate("() => __sh.raf()")
    prog1 = pg.evaluate("() => __fps.perf().programs")
    ok &= _check(notes, prog1 == prog0 and prog0 > 0, f"셰이더 미리 만들기: 첫 폭발 · 섬광 · 입자 그린 뒤 프로그램 수 {prog0} → {prog1}(새로 안 만듦 — 첫 폭발 끊김 없음)")
    drill = pg.evaluate("""async () => {
        const F = __fps; F.clearInput(); F.setHp(100); const m0 = __sh.mark(); const log = [];
        const stepUntil = (fn, sec) => { for (let k = 0; k < Math.round(sec * 60); k++) { F.step(1/60); if (fn()) return true; } return false; };
        const done = (id) => !!F.drill().done[id];
        // ① 둘러보기 · 걷기
        F.teleportTo('tr.spawn'); for (let k = 0; k < 4; k++) { F.turn(35, 0); F.step(0.05); } F.turn(-140, 0);
        F.setInput({moveZ: 1}); stepUntil(() => done('look'), 3); F.setInput({moveZ: null}); F.step(0.2); log.push(['look', done('look'), F.drill().progress]);
        // ② 허리 사격 · 조준 사격
        F.teleportTo('tr.range'); F.step(0.3);
        for (let k = 0; k < 8 && !F.drill().progress.hip; k++) { F.aimAt('buoy1'); F.setInput({fire: true}); F.step(1/60); F.setInput({fire: null}); F.step(0.3); }
        F.setInput({ads: true}); F.step(0.5);
        for (let k = 0; k < 8 && !F.drill().progress.ads; k++) { F.aimAt('buoy1'); F.setInput({fire: true}); F.step(1/60); F.setInput({fire: null}); F.step(0.3); }
        F.setInput({ads: null}); F.step(0.4); log.push(['aim', done('aim')]);
        // ③ 재장전 두 가지(전술 → 빈 탄창 자동)
        F.press('reload'); stepUntil(() => F.drill().progress.tac, 3);
        F.aimAt([0, 1, -40]); F.setInput({fire: true}); stepUntil(() => F.weapon().mag === 0, 6); F.setInput({fire: null}); stepUntil(() => done('reload'), 4); log.push(['reload', done('reload')]);
        // ④ 넘기 · 앉기 · 슬라이딩
        F.teleportTo('tr.vault'); F.look(0, 0); F.step(0.2); F.setInput({moveZ: 1}); F.press('jump');
        stepUntil(() => F.drill().progress.vault, 1.5); F.setInput({moveZ: null}); F.step(1.0);
        F.press('crouch'); F.step(0.3); F.press('crouch'); F.step(0.4);
        F.teleportTo('tr.slide'); F.look(0, 0); F.step(0.2); F.setInput({moveZ: 1, sprint: true}); F.step(0.6); F.press('crouch'); stepUntil(() => F.drill().progress.slide, 1);
        F.setInput({moveZ: null, sprint: null}); F.step(1.2); log.push(['move', done('move'), F.drill().progress]);
        // ⑤ 수류탄
        F.teleportTo('tr.range'); F.aimAt([12, 0.8, -22]); F.turn(0, 12); F.step(0.2); F.setInput({grenade: true}); F.step(0.4); F.setInput({grenade: null});
        stepUntil(() => done('grenade'), 4); log.push(['grenade', done('grenade')]);
        // ⑥ 창고 안 야간투시경
        F.teleportTo('tr.store'); F.step(0.2); F.press('nvg'); stepUntil(() => done('nvg'), 1); log.push(['nvg', done('nvg')]);
        F.step(0.1); await __sh.raf();
        return { log, d: F.drill(), ev: __sh.ev(m0, ['drillTask', 'drillDone']).map(x => [x.type, x.p.id || null]), hud: F.hud(), st: F.state() }; }""")
    pg.evaluate("() => __sh.raf()")
    pg.screenshot(path=str(out / "shoot-drill.png"))
    tasks = [x[1] for x in drill["ev"] if x[0] == "drillTask"]
    ok &= _check(notes, drill["d"]["finished"] and sorted(tasks) == sorted(["look", "aim", "reload", "move", "grenade", "nvg"]) and ["drillDone", None] in drill["ev"],
                 f"훈련장 과제 6개를 __fps 입력만으로 끝냄: 순서 {tasks} · drillDone · 과정 {[(x[0], x[1]) for x in drill['log']]}")
    ok &= _check(notes, drill["hud"]["drill"]["ok"] == 6 and "훈련 완료" in drill["hud"]["drill"]["text"] and drill["st"]["nvg"],
                 f"과제 표 체크 {drill['hud']['drill']['ok']}/6 · 「{drill['hud']['drill']['text'][:24]}…」 · 야간투시경 켬 {drill['st']['nvg']}")
    # 놀이 중 화면에 「다음 · 계속하기 · 이어서」 단추 없음(no-zoom.js Space) · hk 신호 없음(훈련장 — 단독)
    nb = pg.evaluate("""() => [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && /다음|계속하기|이어서/.test(b.textContent)).map(b => b.textContent)""")
    hk = pg.evaluate("() => window.__hkSeen")
    ok &= _check(notes, nb == [] and hk == [], f"놀이 중 보이는 「다음/계속하기/이어서」 단추 {nb} · hk 신호 {hk}(훈련장은 점수 없음)")
    summary["s5"] = {"drill_log": drill["log"], "fx_colors": s5.get("fx", {}).get("colors"), "shots": {
        "dot": str(out / "shoot-dot.png"), "fx": str(out / "shoot-fx.png"), "drill": str(out / "shoot-drill.png")}}
    return ok


# ───────────────────────────── perf ─────────────────────────────

PERF_WALK_JS = r"""(() => {
  // 실시간 고리에서 시험 구역을 원 그리며 걷고 가끔 달림(그리기 부하 대표값) — 하네스 전용
  __fps.setInput({moveZ: 1});
  let k = 0;
  window.__perfWalk = setInterval(() => {
    k++;
    __fps.turn(1.1, 0);
    if (k % 180 === 0) __fps.setInput({sprint: true});
    if (k % 180 === 90) __fps.setInput({sprint: null});
  }, 16);
  return true;
})()"""


def cmd_perf(args):
    from playwright.sync_api import sync_playwright
    out = out_dir(args)
    notes = []
    ok = True
    summary = {"sec": args.sec, "mission": args.mission, "quality": args.quality}
    if args.mission not in (None, "t0"):
        print("임무 측정(--mission m1 · m4)은 임무가 생기는 S8 · S10 부터 — 지금은 시험 구역 t0 만")
        return finish("perf", False, {"error": "mission " + str(args.mission)}, [])
    if args.quality not in ("mid",):
        print("화질 단계(높음 · 낮음 · 자동)는 S14 에서 — 지금은 보통(mid)만")
        return finish("perf", False, {"error": "quality " + str(args.quality)}, [])
    with sync_playwright() as pw:
        s = Session(pw)
        try:
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL + "?dbg=1", wait_until="load")
            r_ok, _ = wait_ready(pg, 5000)
            ok &= _check(notes, r_ok, "__fps.ready")
            pg.click("#btnSortie")
            ok &= _check(notes, _phase_wait(pg, "play"), "「출격 준비」 → play")
            pg.evaluate(PERF_WALK_JS)
            if args.blast:  # S5 — 0.7초마다 앞 6m 에 수류탄 폭발(번갈아 섬광 · 발사기) — 첫 폭발도 측정 구간 안
                pg.evaluate("""() => { let k = 0; window.__perfBlast = setInterval(() => { if (!window.__blastOn) return; k++; const s = __fps.state(); const e = s.eye, y = s.yaw * Math.PI / 180;
                    const kind = k % 5 === 0 ? 'flash' : k % 3 === 0 ? 'rocket' : 'grenade';
                    __fps.explodeAt([e[0] + Math.sin(y) * 6.5, e[1] - 1.2, e[2] - Math.cos(y) * 6.5], kind); }, 700); }""")
                prog_before = pg.evaluate("() => __fps.perf().programs")
            if args.fire:   # S4 — 걸으며 연사(0.8초 쏘고 0.2초 쉼 · 탄 무한 · 재장전은 그대로)
                pg.evaluate("""() => { __fps.infiniteAmmo(true); let k = 0;
                    window.__perfFire = setInterval(() => { k++; __fps.setInput({fire: k % 5 !== 0 ? true : null}); }, 200); }""")
            pg.wait_for_timeout(3000)          # 몸풀기(셰이더 · 첫 프레임) — tdd-final §11-3 「시작 3초 뒤부터」
            pg.evaluate("() => __fps.perfReset()")
            if args.blast:
                pg.evaluate("() => { window.__blastOn = true; }")   # 첫 폭발이 측정 구간 안에 들어가게 재기 시작한 뒤에 켬
            pg.wait_for_timeout(int(args.sec * 1000))
            p = pg.evaluate("() => __fps.perf()")
            st = pg.evaluate(ST)
            dbg = pg.evaluate("() => { const d = document.getElementById('dbg'); return d ? { text: d.textContent, vis: d.offsetParent !== null || getComputedStyle(d).display !== 'none' } : null; }")
            shot = out / ("perf-blast.png" if args.blast else "perf-fire.png" if args.fire else "perf-dbg.png")
            pg.screenshot(path=str(shot))
            pg.evaluate("() => { clearInterval(window.__perfWalk); clearInterval(window.__perfFire); clearInterval(window.__perfBlast); __fps.clearInput(); }")
            if args.blast:
                bl = pg.evaluate("() => __fps.fx().stats.blasts")
                summary["blasts"] = bl
                ok &= _check(notes, bl >= args.sec / 0.7 * 0.8, f"폭발 연속 중 측정 — 폭발 {bl}번(0.7초마다 · 수류탄 · 발사기 · 섬광)")
                ok &= _check(notes, p["over33"] == 0, f"폭발 연속 중 33ms 넘는 프레임 {p['over33']}개 = 0(첫 폭발 포함 — 셰이더 미리 만들기)")
                ok &= _check(notes, p["programs"] == prog_before, f"셰이더 프로그램 수 {prog_before} → {p['programs']}(폭발 · 입자 · 점광이 새로 만들지 않음)")
            if args.fire:
                summary["shots"] = st["weapon"]["shots"]
                ok &= _check(notes, st["weapon"]["shots"] >= args.sec * 5, f"연사 중 측정 — 발사 {st['weapon']['shots']}발 · 무기 sim {p['ms']['shots']}ms/프레임")
            summary["perf"] = p
            summary["shot"] = str(shot)
            (out / ("perf-t0-blast.json" if args.blast else "perf-t0-fire.json" if args.fire else "perf-t0.json")).write_text(json.dumps(p, ensure_ascii=False, indent=1))
            ok &= _check(notes, st["phase"] == "play" and p["playFrames"] >= args.sec * 30 and p["measured"] >= args.sec * 30,
                         f"놀이 중 {p['sec']}초 측정 · 프레임 {p['measured']}개(큰 간격 {p['gaps']}개 뺌) · 지나간 길 {st['pos']}")
            lim = 60 if (args.fire or args.blast) else 40
            ok &= _check(notes, 0 < p["callsMax"] <= lim, f"그리기 호출 최대 {p['callsMax']} ≤ {lim}({'S5 폭발 중' if args.blast else 'S4 연사 중' if args.fire else 'S3'} 기준 · 보통 화질 예산 {150})")
            ok &= _check(notes, p["trisMax"] <= 150000, f"삼각형 최대 {p['trisMax']} ≤ 150,000")
            ok &= _check(notes, p["over33Pct"] <= 1.0, f"33ms 넘는 프레임 {p['over33']}개 = {p['over33Pct']}% ≤ 1%")
            notes.append((True, f"(참고 · 헤드리스 M5) 중앙값 {p['ftMed']}ms · 95번째 {p['ftP95']}ms · 최대 {p['ftMax']}ms · fps {p['fpsMed']} · sim {p['ms']['sim']}ms "
                                f"(이동 · 충돌 {p['ms']['phys']}ms) · 그리기 준비 {p['ms']['render']}ms · 힙 {p['heapMB']}MB"))
            ok &= _check(notes, p["ms"]["phys"] <= 0.8, f"이동 · 충돌 sim {p['ms']['phys']}ms/프레임 ≤ 0.8ms(tdd-final §11-1)")
            ok &= _check(notes, dbg and dbg["vis"] and "fps" in dbg["text"] and "호출" in dbg["text"], f"?dbg=1 구석 표 {dbg['text'].splitlines()[:2] if dbg else None}")
            ok &= _check(notes, not s.errors and not s.external and not s.missing,
                         f"오류 0 · 바깥 요청 0 · 없는 파일 0 {s.errors[:4]} {s.external[:3]} {s.missing[:3]}")
            # 아케이드(?hk=1)에서는 dbg 표를 띄우지 않음
            pg = s.page([HK_SPY])
            pg.goto(HOST + BODY_URL + "?hk=1&dbg=1", wait_until="load")
            pg.wait_for_function("() => window.FG && window.FG.perf && window.FG.game.phase === 'title'", timeout=5000)
            h = pg.evaluate("() => ({ dbg: !!document.getElementById('dbg'), on: FG.perf.dbgOn, fps: !!window.__fps })")
            ok &= _check(notes, not h["dbg"] and not h["on"] and not h["fps"], f"아케이드(?hk=1&dbg=1)에서는 구석 표 없음 · 시험 손잡이 없음 {h}")
        finally:
            s.close()
    return finish("perf", ok, summary, notes)


def main():
    ap = argparse.ArgumentParser(description="안개 군도 FPS 시험 하네스")
    ap.add_argument("--out", default=None, help="산출물 폴더(기본 FOGISLE_OUT 또는 /tmp/fogisle-check)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("lint", help="문법 · 금지 문자열 · 금지어 · sim 규칙 · 크기").add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("smoke", help="단독으로 열어 오류 0 · ready · r160 · 타이틀 스크린샷")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("arcade", help="--frame: 잠금 · Esc · 멈춤 · hk 신호 규약(가짜 부모 창)")
    p.add_argument("--frame", action="store_true", help="가짜 부모 창 안에서 멈춤 규약 확인(S1)")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("move", help="시험 구역 t0 이동 · 충돌 + 넘기 · 오르기 · 슬라이딩 · 전술 달리기 · 기대기(S3) / --basic: S2 항목만")
    p.add_argument("--basic", action="store_true", help="걷기 · 벽 · 경사판 · 계단 · 앉기 · 엎드리기 · 점프(S2)")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("perf", help="실시간 고리 측정(중앙값 · 95번째 · 33ms 초과 · 호출 · 삼각형 · ?dbg=1 표) — S3: 시험 구역 t0 · 보통 화질")
    p.add_argument("--sec", type=float, default=20, help="측정 시간(초, 몸풀기 3초 뒤)")
    p.add_argument("--mission", default=None, help="임무(m1 · m4 — S8 부터). 지금은 t0 만")
    p.add_argument("--quality", default="mid", help="화질(S14 부터 high · low · auto). 지금은 mid 만")
    p.add_argument("--fire", action="store_true", help="걸으며 연사(S4 — 그리기 호출 ≤ 60)")
    p.add_argument("--blast", action="store_true", help="걸으며 0.7초마다 폭발(S5 — 33ms 넘는 프레임 0 · 호출 ≤ 60 · 셰이더 새로 안 만듦)")
    p.add_argument("--out", default=argparse.SUPPRESS)
    p = sub.add_parser("shoot", help="--core: 무기 6종 · 반동 = 판정 · 재장전 · 교체 · 조준 · 산탄 · 피해 · HUD 맞힘 표시 · 소리(S4) / 없이: S4 + 장비 · 관통 · 효과 · 훈련장(S5)")
    p.add_argument("--core", action="store_true", help="S4 사격 핵심")
    p.add_argument("--out", default=argparse.SUPPRESS)
    args = ap.parse_args()
    fn = {"lint": cmd_lint, "smoke": cmd_smoke, "arcade": cmd_arcade, "move": cmd_move, "perf": cmd_perf, "shoot": cmd_shoot}[args.cmd]
    sys.exit(fn(args))


if __name__ == "__main__":
    main()
