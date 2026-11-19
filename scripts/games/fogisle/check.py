#!/usr/bin/python3
"""안개 군도 FPS(fogisle) — 브라우저 하네스. 헤드리스 크롬(Playwright)으로 묶은 파일을 열어 본다.

  /usr/bin/python3 check.py gate                     lint → build → simtest gate → smoke(개발판 · 배포판) · arcade · hash · worker · world · bake (4분 안)
  /usr/bin/python3 check.py full                     gate 의 것 전부 + simtest full
  /usr/bin/python3 check.py smoke [--release] | arcade | hash | worker | world | bake   하나씩(여럿을 이어 적어도 된다 — 먼저 묶기를 한 번 돌린다)
  … --out <폴더>                                      캡처 · 기록을 둘 곳(기본: 시스템 임시 폴더의 fogisle-check — 저장소 밖)

종료 코드 0 = 통과 · 1 = 실패 · 2 = 쓰는 법이 틀림. 마지막 줄은 늘 JSON 요약이다.
포트를 열지 않는다: http://hk.test/** 요청을 가로채 REPO/web 의 파일로 답하고, /games/embed/fogisle.html 만 games-src/fogisle/dist 의
개발판(기본) · 배포판으로 답한다(web/ 의 옛 파일은 읽지 않는다). /api/** 는 가짜 응답, hk.test 밖으로 가는 요청은 막고 적는다.
가짜 부모 창은 parent.html(진짜 web/_shared/hk-embed.js 를 그대로 쓴다), 문턱과 시험의 낱 숫자는 thresholds.json, 알려진 콘솔 경고는 known-warnings.json.
시험의 본문은 cases/<명령>.py 의 run(h, opt). 게임 수치는 Node 로 원본의 tune 표를 읽어 온다(여기에 숫자를 다시 적지 않는다).
"""
import sys
sys.dont_write_bytecode = True
import importlib, json, mimetypes, os, pathlib, subprocess, tempfile, time
from urllib.parse import urlsplit

HARNESS = pathlib.Path(__file__).resolve().parent
REPO = HARNESS.parents[2]
SRC = pathlib.Path(os.environ.get("FOGISLE_SRC") or REPO / "games-src" / "fogisle")     # 거울 나무(변이 시험)를 보게 할 수 있다
WEB = REPO / "web"
ORIGIN, OTHER = "http://hk.test", "http://other.test"        # OTHER = 「다른 출처의 부모 창」 시험에서만 — 가짜 부모 창과 hk-embed.js 만 답한다
GAME_PATH = "/games/embed/fogisle.html"
PARENT_PATH = "/__harness/parent.html"
FILES = {"dev": "fogisle.dev.html", "release": "fogisle.html"}
CHROME_ARGS = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
NODE = "/usr/local/bin/node" if pathlib.Path("/usr/local/bin/node").exists() else "node"
BROWSER_CMDS = ("smoke", "arcade", "hash", "worker", "world", "bake")
LATER_CMDS = ("leak", "perf", "compile", "alloc", "feel", "audio", "ui", "bench")   # 그것이 처음 필요한 단계가 만든다(build-plan 부록 A)
TYPES = {".js": "text/javascript", ".woff2": "font/woff2", ".html": "text/html; charset=utf-8", ".json": "application/json"}
THRESHOLDS = json.loads((HARNESS / "thresholds.json").read_text(encoding="utf-8"))
KNOWN = json.loads((HARNESS / "known-warnings.json").read_text(encoding="utf-8"))["known"]
T = THRESHOLDS["harness"]

# Node(원본)에서 읽어 오는 것: tune 표 · 이름 · 자가 점검 탐침의 해시와 자리 · 봇으로 민 sim 해시(씨앗마다) · 긴 탐침(조각내기 시험용)
NODE_INFO = r"""
import { probeRun, runAll } from './src/shared/probe.js';
import { makeRun, advance, runHash, probeBot } from './src/bot/run.js';
import { tuneSnapshot } from './src/shared/tune/index.js';
import { GAME } from './src/shared/game.js';
const tune = tuneSnapshot(), c = tune.app.selfCheck, [long, ...seeds] = process.argv.slice(1).map(Number), sim = {};
for (const seed of [tune.app.seed, ...seeds]) { const r = makeRun(seed, probeBot); advance(r, c.steps); sim[seed] = runHash(r); }
const p = runAll(probeRun(c.seed, c.steps));
console.log(JSON.stringify({ tune, game: GAME, probe: p.hash, pos: Array.from(p.pos), sim, long: { steps: long, hash: runAll(probeRun(c.seed, long)).hash } }));
"""
# 입력 없이(빈 입력 표로) n 단계 흐른 판의 상태 나무 해시 — 게임의 고리가 민 나무와 견준다(배포판도 __fg_status.hash 로)
NODE_STATE = "import { makeRun, advance } from './src/bot/run.js'; import { hashState } from './src/shared/state.js'; const [seed, n] = process.argv.slice(1).map(Number), r = makeRun(seed, null); advance(r, n); console.log(hashState(r.state));"
LONG_STEPS, EXTRA_SEED = T["longSteps"], T["extraSeed"]


class Game:
    """열린 화면 하나. frame = 게임 문서(가짜 부모 창 안이면 그 iframe). with 로 쓰고, 나갈 때 콘솔 · 요청 기록이 깨끗한지 본다."""

    def __init__(self, h, mode, parent, query, init, allow, viewport, settle):
        # parent: False = 혼자 · True = 아케이드처럼(Esc → hk:esc → 부모가 멈춤/이어 하기) · "raw" = 부모가 hk:esc 를 적기만 한다 · "other" = 다른 출처의 부모
        self.h, self.mode, self.allow = h, mode, tuple(allow)
        self.errors, self.warnings, self.known, self.blocked, self.missing, self.seen = [], [], 0, [], [], 0
        self.ctx = h.browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, device_scale_factor=1)
        for script in init:
            self.ctx.add_init_script(script)
        self.ctx.route("**/*", self._route)
        self.page = self.ctx.new_page()
        self.page.on("console", self._console)
        self.page.on("pageerror", lambda e: self._console(type("M", (), {"type": "error", "text": "pageerror: " + str(e)})))
        mark = {True: "", "raw": "#raw", "other": "#origin=" + ORIGIN}.get(parent, "")
        self.page.goto((OTHER if parent == "other" else ORIGIN) + (PARENT_PATH if parent else GAME_PATH) + ("?" + query if query else "") + mark)
        self.frame = self.page.main_frame
        deadline = time.time() + T["waitMs"] / 1000
        while parent and self.frame is self.page.main_frame:
            self.frame = next((f for f in self.page.frames if GAME_PATH in f.url), self.frame)
            if time.time() > deadline:
                raise RuntimeError("가짜 부모 창이 게임 창을 띄우지 못했다")
            self.page.wait_for_timeout(10)
        self.wait("window.__fg_status && __fg_status.phase !== 'boot'" + (" && (__fg_status.readySec !== null || __fg_status.phase !== 'title')" if settle else ""))

    def _route(self, route, request):
        url, path = request.url, urlsplit(request.url).path
        if not (url.startswith(ORIGIN + "/") or (url.startswith(OTHER + "/") and path in (PARENT_PATH, "/_shared/hk-embed.js"))):
            self.blocked.append(url[:200])
            return route.abort()
        if path == GAME_PATH:
            return route.fulfill(status=200, content_type=TYPES[".html"], body=(SRC / "dist" / FILES[self.mode]).read_bytes())
        if path == PARENT_PATH:
            return route.fulfill(status=200, content_type=TYPES[".html"], body=(HARNESS / "parent.html").read_bytes())
        if path.startswith("/api/"):
            return route.fulfill(status=200, content_type="application/json", body='{"data":{}}')
        if path == "/favicon.ico":
            return route.fulfill(status=204, body="")
        file = (WEB / path.lstrip("/")).resolve()
        if WEB not in file.parents or not file.is_file():
            self.missing.append(path)
            return route.fulfill(status=404, body="")
        kind = TYPES.get(file.suffix) or mimetypes.guess_type(str(file))[0] or "application/octet-stream"
        return route.fulfill(status=200, content_type=kind, body=file.read_bytes())

    def _console(self, m):
        if m.type not in ("error", "warning"):
            return
        text = m.text[:300]
        if any(k["match"] in text for k in KNOWN) or any(a in text for a in self.allow):
            self.known += 1
        else:
            (self.errors if m.type == "error" else self.warnings).append(m.type + ": " + text)

    def js(self, expr, arg=None):
        return self.frame.evaluate(expr, arg)

    def status(self):
        return self.frame.evaluate("JSON.parse(JSON.stringify(window.__fg_status))")

    def wait(self, expr, timeout=None):
        try:
            # 조건은 정해진 틈(pollMs)마다 본다 — rAF 에 묶어 보면 rAF 를 세우거나 가짜로 바꾼 시험에서 영영 안 본다(준비가 생성 · 굽기로 길어져 처음 한 번에 참이 아니다)
            self.frame.wait_for_function(expr, timeout=timeout or T["waitMs"], polling=T["pollMs"])
        except Exception as e:
            now = self.frame.evaluate("window.__fg_status ? JSON.stringify(window.__fg_status) : document.documentElement.outerHTML.slice(0, 200)")
            raise RuntimeError(f"기다리던 것이 오지 않았다: {expr[:120]} — 지금 {now} ({type(e).__name__})")

    def frames(self, n=3):
        """게임 창에서 rAF 를 n 번 보낸다(벽시계가 아니라 프레임 수로 기다린다)"""
        self.frame.evaluate("(n) => new Promise((done) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : done(0)); f(); })", n)

    def click(self, selector):
        self.frame.locator(selector).click()

    def shot(self, name):
        path = self.h.out / name
        self.page.screenshot(path=str(path))
        return path

    # ---- 가짜 부모 창 ----
    def send(self, kind):
        self.page.evaluate("(t) => window.__parent.send(t)", kind)

    def parent(self):
        return self.page.evaluate("JSON.parse(JSON.stringify(window.__parent))")

    def msgs(self, expect, label):
        """부모가 그 뒤로 새로 받은 말(hk:live 는 뺀다)이 expect 와 꼭 같은지 — 모자라면 기다리고, 넘치는지도 잠깐 더 본다"""
        deadline = time.time() + T["msgSec"]
        while True:
            got = [m["type"] for m in self.page.evaluate("window.__parent.log") if m["type"] != "hk:live"][self.seen:]
            if len(got) >= len(expect) or time.time() > deadline:
                break
            self.page.wait_for_timeout(25)
        self.frames(4)
        got = [m["type"] for m in self.page.evaluate("window.__parent.log") if m["type"] != "hk:live"][self.seen:]
        self.seen += len(got)
        self.h.check(got == list(expect), f"{label} — 부모가 받은 말", f"바란 것 {list(expect)} · 받은 것 {got}")

    def __enter__(self):
        return self

    def __exit__(self, kind, exc, tb):
        try:
            if kind is None:
                self.frames(2)
                self.h.check(not self.errors, f"[{self.mode}] 콘솔 오류 · 페이지 오류 0", "; ".join(self.errors[:4]))
                self.h.check(not self.warnings, f"[{self.mode}] 목록에 없는 콘솔 경고 0", "; ".join(self.warnings[:4]))
                self.h.check(not self.blocked, f"[{self.mode}] 바깥 요청 0", "; ".join(self.blocked[:4]))
                self.h.check(not self.missing, f"[{self.mode}] 없는 파일 요청 0", "; ".join(self.missing[:4]))
        finally:
            self.ctx.close()
        return False


class Harness:
    # 시험들이 같이 쓰는 조각(게임 창에서 도는 글)
    # 타이틀의 준비(자가 점검 → 세계 생성 → 굽기)가 다 끝났다 = 출격이 열렸다(readySec 은 그때 적힌다)
    READY = "__fg_status.phase === 'title' && __fg_status.probe !== null && __fg_status.readySec !== null"
    ONLY_GAME = "if (location.pathname.endsWith('/fogisle.html')) { %s }"
    BREAK_DRAW = "() => { THREE.Object3D.prototype.onBeforeRender = () => { throw new Error('시험용 고장'); }; }"
    FAKE_RAF = """(() => { const C = window.__clock = { q: [], t: 0, real: window.requestAnimationFrame };
      window.requestAnimationFrame = (f) => C.q.push(f); C.tick = (ms) => { C.t += ms; for (const f of C.q.splice(0)) f(C.t); }; })();"""

    def __init__(self, out):
        self.out = pathlib.Path(out)
        self.out.mkdir(parents=True, exist_ok=True)
        self.pw = self.browser = self._node = None
        self.checks, self.failed, self.notes = 0, [], {}
        self.thresholds, self.src, self.node_extra_seed = THRESHOLDS, SRC, EXTRA_SEED

    def dist(self, mode):
        return (SRC / "dist" / FILES[mode]).read_text(encoding="utf-8")

    @property
    def node(self):
        if self._node is None:
            r = subprocess.run([NODE, "--input-type=module", "-e", NODE_INFO, str(LONG_STEPS), str(EXTRA_SEED)], cwd=SRC, capture_output=True, text=True)
            if r.returncode != 0:
                raise RuntimeError("Node 로 원본을 읽지 못했다: " + r.stderr.strip()[-400:])
            self._node = json.loads(r.stdout.strip().split("\n")[-1])
        return self._node

    def start(self):
        if self.browser is None:
            from playwright.sync_api import sync_playwright
            self.pw = sync_playwright().start()
            self.browser = self.pw.chromium.launch(headless=True, args=CHROME_ARGS)

    def stop(self):
        if self.browser is not None:
            self.browser.close()
            self.pw.stop()
            self.browser = self.pw = None

    def open(self, mode="dev", parent=False, query="", init=(), allow=(), viewport=(1280, 720), settle=True):
        """settle=False = 타이틀의 준비(자가 점검 → 생성 → 굽기)가 끝나기를 기다리지 않고 돌려준다(준비 중인 화면을 볼 때)"""
        self.start()
        return Game(self, mode, parent, ("hk=1&" + query).rstrip("&") if parent and query else query, init, allow, viewport, settle)

    def node_json(self, code, *args):
        """Node 로 원본을 읽는 글 한 토막을 돌려 마지막 줄의 JSON 을 돌려준다(시험이 저마다 필요한 값을 읽어 올 때)"""
        r = subprocess.run([NODE, "--input-type=module", "-e", code, *map(str, args)], cwd=SRC, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError("Node 로 원본을 읽지 못했다: " + r.stderr.strip()[-400:])
        return json.loads(r.stdout.strip().split("\n")[-1])

    def state_hash(self, seed, steps):
        r = subprocess.run([NODE, "--input-type=module", "-e", NODE_STATE, str(seed), str(steps)], cwd=SRC, capture_output=True, text=True)
        return r.stdout.strip() or "Node 실패: " + r.stderr.strip()[-200:]

    def check(self, ok, name, detail=""):
        self.checks += 1
        if not ok:
            self.failed.append(name + (" — " + str(detail) if detail else ""))
            print("  실패  " + self.failed[-1])
        return bool(ok)


def run_node(args):
    """Node 도구 하나(lint · build · simtest) — 종료 코드 0 이고 마지막 줄 JSON 의 ok 가 참이어야 통과"""
    r = subprocess.run([NODE, *args], cwd=SRC, capture_output=True, text=True)
    lines = r.stdout.strip().split("\n")
    try:
        last = json.loads(lines[-1])
    except (ValueError, IndexError):
        last = {"ok": False, "error": "마지막 줄이 JSON 이 아니다"}
    ok = r.returncode == 0 and last.get("ok") is True
    if not ok:
        print("\n".join(lines[-25:]))
    return ok, last


def run_case(h, name, opt):
    """cases/<name>.py 의 run(h, opt) — 그 안에서 난 예외(기다림 초과 따위)도 실패 하나로 적는다"""
    before, failed_before = h.checks, len(h.failed)
    try:
        importlib.import_module("cases." + name).run(h, opt)
    except Exception as e:
        h.check(False, f"{name} 가 끝까지 돌지 못했다", f"{type(e).__name__}: {str(e)[:500]}")
    return {"checks": h.checks - before, "failed": h.failed[failed_before:]}


def expand(cmds, release):
    """명령 → 단계 목록 [(이름, 종류, 인자)]. 브라우저 명령만 주면 묶기를 먼저 한 번 돌린다(dist 가 지금 원본과 같게)."""
    steps = []
    for cmd in cmds:
        if cmd in ("gate", "full"):
            steps += [("lint", "node", ["tools/lint.mjs"]), ("build", "node", ["tools/build.mjs"]), ("simtest " + cmd, "node", ["tools/simtest.mjs", cmd])]
            steps += [("smoke", "case", {"release": False}), ("smoke --release", "case", {"release": True})]
            steps += [(name, "case", {"release": False}) for name in ("arcade", "hash", "worker", "world", "bake")]
        else:
            steps.append((cmd + (" --release" if release and cmd == "smoke" else ""), "case", {"release": release}))
    if not any(kind == "node" and name == "build" for name, kind, _ in steps):
        steps.insert(0, ("build", "node", ["tools/build.mjs"]))
    return steps


def main(argv):
    t0 = time.time()
    summary = {"ok": False, "cmd": "check " + " ".join(argv)}
    cmds, release, out, i = [], False, None, 0
    bad = None if argv else "명령이 없다"
    while i < len(argv) and not bad:
        a = argv[i]
        if a == "--release":
            release = True
        elif a == "--out" and i + 1 < len(argv):
            i += 1
            out = argv[i]
        elif a in ("gate", "full") or a in BROWSER_CMDS:
            cmds.append(a)
        else:
            bad = a + (": 아직 없는 명령이다 — 그것이 처음 필요한 단계가 만든다" if a in LATER_CMDS else ": 모르는 인자다")
        i += 1
    if bad or not cmds:
        summary["error"] = f"{bad or '명령이 없다'}. 쓸 수 있는 것: gate · full · {' · '.join(BROWSER_CMDS)} [--release] [--out <폴더>]"
        print(summary["error"])
        print(json.dumps(summary, ensure_ascii=False))
        return 2
    sys.path.insert(0, str(HARNESS))
    h = Harness(out or pathlib.Path(tempfile.gettempdir()) / "fogisle-check")
    steps, ok = [], True
    try:
        for name, kind, arg in expand(cmds, release):
            s = time.time()
            if kind == "node":
                good, last = run_node(arg)
                step = {"name": name, "ok": good, "ms": round((time.time() - s) * 1000)}
                if not good:
                    step["error"] = str(last.get("error") or last.get("problems") or "실패")[:300]
            else:
                opt = type("Opt", (), arg)
                r = run_case(h, name.split(" ")[0], opt)
                step = {"name": name, "ok": not r["failed"], "ms": round((time.time() - s) * 1000), "checks": r["checks"]}
                if r["failed"]:
                    step["failed"] = r["failed"]
            steps.append(step)
            print(f"{'통과' if step['ok'] else '실패'}  {name}  ({step['ms']}ms" + (f" · 확인 {step['checks']}개" if "checks" in step else "") + ")")
            ok = ok and step["ok"]
            if not step["ok"] and kind == "node":
                break       # 정적 검사 · 묶기 · Node 시험이 깨졌으면 브라우저는 열지 않는다(낡은 dist 를 보게 된다)
    except Exception as e:
        ok = False
        summary["error"] = f"{type(e).__name__}: {str(e)[:400]}"
        print(summary["error"])
    finally:
        h.stop()
    sec = time.time() - t0
    for cmd in ("gate", "full"):
        limit = THRESHOLDS[cmd]["maxSec"]
        if cmd in cmds and sec > limit:
            ok = False
            summary["error"] = f"{cmd} 가 {sec:.0f}초 걸렸다 — {limit}초 안이어야 한다"
            print(summary["error"])
    summary.update(ok=ok, steps=steps, ms=round(sec * 1000), out=str(h.out), notes=h.notes)
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
