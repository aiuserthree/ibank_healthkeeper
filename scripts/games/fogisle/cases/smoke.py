"""smoke — 묶은 파일이 혼자(부모 창 없이) 뜬다: 오류 0 · 바깥 요청 0 · three r160 · 글꼴 · no-zoom 이 첫 스크립트.
타이틀 → 출격 → 둘러보기(끌기) → 멈춤 → 이어 하기 → 그만두기 → 결과 → 타이틀을 진짜 키 · 마우스와 window.__fg_status 로 민다(배포판도 같은 길).
+ 타이틀의 준비(덜 됐을 때의 화면 · 실패 뒤 다시 돌리기) · WebGL 을 못 켤 때의 안내 · 고리 밖의 예외(판을 잇는다)와 고리 안의 예외(덮개).
타이틀 · 준비 중 · 놀이 · 멈춤 · 결과 · 오류 화면을 --out 폴더에 찍어 둔다."""
import io
from PIL import Image, ImageChops, ImageStat

NOGL = "HTMLCanvasElement.prototype.getContext = function () { return null; };"
# 가짜 워커: 준비 신호만 보내고 맡은 일은 쥐고 있는다 — 시험이 「일을 거절」(fail) · 「워커가 죽음」(die)을 골라 낸다
HELD_WORKER = """window.Worker = function () { const w = this, K = window.__held = { n: 0 };
  w.terminate = () => {}; setTimeout(() => w.onmessage({ data: { ready: true } }), 0);
  w.postMessage = (job) => { K.n += 1; K.fail = () => w.onmessage({ data: { id: job.id, ok: false, error: '시험용 준비 실패' } }); K.die = () => w.onerror(new Event('error')); }; };"""
WAITING = "() => [document.getElementById('fgGo').disabled, getComputedStyle(document.getElementById('fgWait')).visibility, document.getElementById('fgWait').textContent.trim() !== '']"
PAGE_INFO = """async () => {
  try { await document.fonts.load("800 40px Pretendard"); await document.fonts.ready; } catch (e) { window.__fontError = String(e); }
  const root = document.documentElement, show = (id) => getComputedStyle(document.getElementById(id)).display;
  let kept; try { window.__fg_status.phase = 'x'; } catch (e) { kept = 0; } try { window.__fg_status = 1; } catch (e) { kept = 0; }
  return { three: THREE.REVISION, mode: root.dataset.fgMode, build: root.dataset.fgBuild,
    firstScript: document.scripts[0].getAttribute('src'), noZoom: window.__hkNoZoom === true, logo: document.getElementById('fgLogo').textContent, title: document.title,
    font: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')), logoFont: getComputedStyle(document.getElementById('fgLogo')).fontFamily,
    globals: Object.keys(window).filter((k) => k.startsWith('__f')).sort(), statusKept: typeof window.__fg_status === 'object' && window.__fg_status.phase,
    shown: { title: show('fgTitle'), pause: show('fgPause'), result: show('fgResult'), error: show('fgError'), nogl: show('fgNoGl'), hud: show('fgHud') } };
}"""


def diff(a, b):
    """두 화면(PNG 바이트)의 화소 차 평균(0 ~ 255)"""
    ia, ib = Image.open(io.BytesIO(a)).convert("RGB"), Image.open(io.BytesIO(b)).convert("RGB")
    return sum(ImageStat.Stat(ImageChops.difference(ia, ib)).mean) / 3


def flow(h, mode):
    game, app, T = h.node["game"], h.node["tune"]["app"], h.thresholds["harness"]
    html = h.dist(mode)
    h.check(0 < html.find('<script src="/_shared/no-zoom.js"></script>') < html.find("<script id="), f"[{mode}] no-zoom.js 가 본문의 첫 스크립트")
    h.check(f'<h1 id="fgLogo">{game["title"]}</h1>' in html, f"[{mode}] 셸의 제목 글자 = shared/game.js 의 이름", game["title"])
    with h.open(mode) as g:
        g.wait(h.READY)
        info, st = g.js(PAGE_INFO), g.status()
        h.check(info["three"] == "160", f"[{mode}] THREE.REVISION === '160'", info["three"])
        h.check(info["firstScript"] == "/_shared/no-zoom.js" and info["noZoom"], f"[{mode}] no-zoom.js 가 먼저 실행됨", info["firstScript"])
        h.check("Pretendard" in info["font"] and "Pretendard" in info["logoFont"], f"[{mode}] Pretendard 글꼴이 실제로 실림", f'{info["font"]} / {info["logoFont"]}')
        h.check(info["logo"] == game["title"] and info["title"] == game["title"], f"[{mode}] 제목 = GAME.title", info["logo"])
        h.check(info["globals"] == (["__fg", "__fgShared", "__fg_status"] if mode == "dev" else ["__fgShared", "__fg_status"]), f"[{mode}] 밖으로 보이는 이름", info["globals"])
        h.check(info["statusKept"] == "title", f"[{mode}] __fg_status 는 읽기 전용", info["statusKept"])
        h.check(st["mode"] == mode == info["mode"] and st["build"] == info["build"] and len(st["build"]) == 12, f"[{mode}] 빌드 지문", st)
        h.check(st["arcade"] is False and st["tainted"] is False and st["error"] == st["stray"] == "" and st["hash"] is None and st["worker"] in ("worker", "main"), f"[{mode}] 처음 상태", st)
        h.check(isinstance(st["readySec"], (int, float)) and 0 <= st["readySec"] < T["readySecMax"], f"[{mode}] 「타이틀 → 조작 가능」 초를 잼", st["readySec"])
        h.check(g.js(WAITING)[:2] == [False, "hidden"], f"[{mode}] 준비가 끝나면 출격이 열리고 「준비 중」 글이 숨는다", g.js(WAITING))
        h.check(info["shown"] == {"title": "flex", "pause": "none", "result": "none", "error": "none", "nogl": "none", "hud": "none"}, f"[{mode}] 타이틀에서는 타이틀 덮개만 보임", info["shown"])
        g.shot(f"title-{mode}.png")
        h.notes[f"readySec[{mode}]"] = st["readySec"]

        # 출격: 단추에 남은 초점이 캔버스로 가고, 고리가 돈다. 헤드리스는 잠금을 거절하므로 「잠금 없이 놀이」(free)다
        g.js("() => { window.__keys = []; window.addEventListener('keydown', (e) => window.__keys.push([e.code, e.defaultPrevented])); }")
        g.click("#fgGo")
        g.wait("__fg_status.phase === 'play' && __fg_status.step >= 20")
        h.check(g.js("document.activeElement && document.activeElement.id") == "fgView", f"[{mode}] 출격 뒤 초점이 캔버스에")
        h.check(g.status()["lock"] == "free", f"[{mode}] 잠금이 거절되면 끌어서 둘러보기로 논다", g.status()["lock"])
        h.check(g.js("getComputedStyle(document.getElementById('fgTitle')).display") == "none" and g.js("window.HKNextKey.find()") is None, f"[{mode}] 놀이 중에는 Space 로 눌릴 글자 단추가 없다")
        g.page.keyboard.press("Space")
        g.frames(3)
        h.check(g.js("window.__keys") == [["Space", True]] and g.status()["phase"] == "play", f"[{mode}] 놀이 중 Space 는 게임이 받고 기본 동작을 막는다", g.js("window.__keys"))

        # 끌어서 둘러보기: 단추 없이 움직이면 그대로, 누른 채 끌면 화면이 돈다
        a = g.page.screenshot()
        g.page.mouse.move(640, 360); g.page.mouse.move(700, 380, steps=3)
        g.frames(3)
        still = g.page.screenshot()
        g.page.mouse.down(); g.page.mouse.move(900, 300, steps=10); g.page.mouse.up()
        g.frames(3)
        b = g.page.screenshot()
        (h.out / f"play-{mode}.png").write_bytes(b)
        h.check(diff(a, still) < T["stillDiffMax"], f"[{mode}] 단추를 안 누르고 움직이면 화면이 그대로", round(diff(a, still), 3))
        h.check(diff(a, b) > T["moveDiffMin"], f"[{mode}] 누른 채 끌면 화면이 돈다", round(diff(a, b), 3))
        if mode == "dev":
            s = g.js("__fg.state()")
            want = [-200 * app["look"]["sens"], 80 * app["look"]["sens"]]
            h.check(abs(s["yaw"] - want[0]) < 1e-9 and abs(s["pitch"] - want[1]) < 1e-9, "[dev] 끈 만큼 시점 각이 돈다(오른쪽 200px · 위 80px × 감도)", [s["yaw"], s["pitch"], want])
            g.page.keyboard.down("KeyW"); g.page.keyboard.down("KeyD"); g.page.mouse.down(button="right")
            g.frames(4)
            s = g.js("__fg.state()")
            grid = h.node["tune"]["sim"]["angleSteps"]
            h.check(s["yaw"] != round(want[0] * grid) / grid, "[dev] (시험의 전제) 날것의 시점 각은 눈금에서 끝자리가 벗어나 있다", s["yaw"])
            h.check([s["input"]["mx"], s["input"]["mz"], s["input"]["held"] & 2] == [1, 1, 2] and s["input"]["yaw"] == round(want[0] * grid) / grid, "[dev] 입력 표 — 이동 축 · 눌린 단추 · 눈금에 맞춘 시점 각", [s["input"], s["yaw"]])
            g.page.keyboard.up("KeyW"); g.page.keyboard.up("KeyD"); g.page.mouse.up(button="right")
            h.check(g.js("__fg.state().tainted") is False, "[dev] 읽기만 한 판은 「시험 판」이 아니다")

        # Esc(부모 창 없음 · 잠금 없음) → 스스로 멈춤. 멈춤 덮개의 「계속하기」는 Space 로도 눌린다(no-zoom.js)
        g.page.keyboard.press("Escape")
        g.wait("__fg_status.phase === 'pause'")
        step = g.status()["step"]
        g.frames(20)
        h.check(g.status()["step"] == step, f"[{mode}] 멈춘 동안 sim 이 흐르지 않는다")
        h.check(g.js("(window.HKNextKey.find() || {}).id") == "fgResume", f"[{mode}] 멈춤 덮개에서는 Space 가 「계속하기」를 누른다")
        g.shot(f"pause-{mode}.png")
        g.page.keyboard.press("Space")
        g.wait("__fg_status.phase === 'play'")
        g.page.keyboard.press("Escape")
        g.wait("__fg_status.phase === 'pause'")
        g.click("#fgResume")
        g.wait("__fg_status.phase === 'play'")
        h.check(g.js("document.activeElement && document.activeElement.id") == "fgView", f"[{mode}] 「계속하기」를 마우스로 눌러 이어 한 뒤 초점이 캔버스에")
        g.page.keyboard.press("Escape")
        g.wait("__fg_status.phase === 'pause'")
        g.page.keyboard.press("Escape")
        g.wait("document.documentElement.dataset.fgWait === '1'")
        g.page.mouse.click(80, 80)
        g.wait("__fg_status.phase === 'play'")

        # 그만두기 → 결과 → 타이틀 → 다시 출격(새 판은 0 단계부터). 결과 화면의 「다시 하기」는 arcade 가 본다
        h.check(g.status()["frameMs"] > 0, f"[{mode}] 프레임 시간을 잼", g.status()["frameMs"])
        g.page.keyboard.press("Escape")
        g.wait("__fg_status.phase === 'pause'")
        g.click("#fgQuit")
        g.wait("__fg_status.phase === 'result'")
        h.check(g.status()["lock"] == "off" and g.js("document.getElementById('fgScore').textContent") == "0", f"[{mode}] 결과 화면 — 판이 닫힘")
        # 덮개 뒤에서도 창 크기를 바꾸면 다시 그린다(크기가 바뀌면 그리기 버퍼가 지워진다 — 왼쪽 위 하늘 자리가 그대로여야 한다)
        a = g.shot(f"result-{mode}.png").read_bytes()
        g.page.set_viewport_size({"width": 1100, "height": 640})
        g.frames(3)
        a, b = (Image.open(io.BytesIO(x)).crop((0, 0, 40, 40)) for x in (a, g.page.screenshot()))
        d = sum(ImageStat.Stat(ImageChops.difference(a.convert("RGB"), b.convert("RGB"))).mean) / 3
        h.check(d < T["stillDiffMax"], f"[{mode}] 결과 덮개 뒤에서 창 크기를 바꿔도 장면이 다시 그려진다", round(d, 3))
        g.click("#fgMenu")
        g.wait("__fg_status.phase === 'title'")
        g.click("#fgGo")
        g.wait("__fg_status.phase === 'play'")
        h.check(g.status()["step"] < step, f"[{mode}] 다시 출격하면 새 판(단계가 처음부터)", [g.status()["step"], step])


def loop(h, mode):
    """고정 단계 고리: rAF 를 가짜 시계로 바꿔 프레임 간격을 정해 주고, 밟은 단계 수를 센다(STEP = 1/60초 · 한 프레임 5번까지 · 0.1초 넘는 간격은 버림)"""
    cfg, hz = h.node["tune"]["app"]["loop"], h.node["tune"]["sim"]["hz"]
    with h.open(mode, init=[h.FAKE_RAF]) as g:
        g.wait(h.READY)
        g.click("#fgGo")
        g.wait("__fg_status.phase === 'play'")
        tick = lambda ms: g.js("(ms) => { window.__clock.tick(ms); return window.__fg_status.step; }", ms)
        tick(1000)
        base, step_ms, got = tick(0), 1000 / hz, []
        # 한 단계 남짓 ×2 → 세 단계 남짓 → 반 단계(안 밟는다) → 여섯 단계어치(다섯만 밟고 나머지는 버린다) → 너무 긴 간격(통째로 버린다) → 남은 것 + 반 단계
        for ms in (step_ms + 0.13, step_ms + 0.13, 3 * step_ms + 0.2, 0.6 * step_ms, cfg["dropSec"] * 1000 - 0.5, cfg["dropSec"] * 1000 + 50, 0.42 * step_ms):
            got.append(tick(ms) - base)
        want = [1, 2, 5, 5, 5 + cfg["maxSteps"], 5 + cfg["maxSteps"], 6 + cfg["maxSteps"]]
        h.check(got == want, f"[{mode}] 고리 — 간격만큼 단계를 밟고, 한 프레임 {cfg['maxSteps']}번까지, {cfg['dropSec']}초 넘는 간격은 버린다", [got, want])
        if mode == "dev":
            g.page.keyboard.press("KeyR")
            a, b = g.js("() => { window.__clock.tick(17); return __fg.state().input; }"), g.js("() => { window.__clock.tick(17); return __fg.state().input; }")
            h.check([a["edge"], a["held"], b["edge"]] == [64, 0, 0], "[dev] 한 프레임 안에 눌렀다 뗀 키도 가장자리로 한 번 실린다", [a, b])
        g.js("() => { window.requestAnimationFrame = window.__clock.real; }")


def prep(h, mode):
    """타이틀의 준비: 덜 됐으면 단추가 잠기고 까닭 글이 보인다 → 실패하면 덮개 → 「다시 시작」이 준비를 다시 돌린다(막다른 길이 없다)"""
    with h.open(mode, init=[HELD_WORKER], settle=False) as g:
        g.wait("window.__held && __held.n === 1")
        g.js("() => document.getElementById('fgGo').click()")
        g.frames(2)
        st = g.status()
        h.check(g.js(WAITING) == [True, "visible", True] and st["phase"] == "title" and st["readySec"] is None, f"[{mode}] 준비가 덜 된 타이틀 — 출격이 잠기고 「준비 중」 글이 보인다", [g.js(WAITING), st["phase"]])
        g.shot(f"title-wait-{mode}.png")
        g.js("() => window.__held.fail()")
        g.wait("__fg_status.phase === 'error'")
        h.check("시험용 준비 실패" in g.status()["error"], f"[{mode}] 워커가 거절한 일 → 준비 실패 → 덮개", g.status()["error"])
        g.click("#fgRestart")
        g.wait("__held.n === 2")
        h.check(g.status()["phase"] == "title" and g.js(WAITING)[0] is True, f"[{mode}] 「다시 시작」 → 타이틀에서 준비를 다시 돌린다", g.status()["phase"])
        g.js("() => window.__held.die()")
        g.wait(h.READY)
        st = g.status()
        h.check(st["worker"] == "main" and st["probe"] == h.node["probe"] and g.js(WAITING)[0] is False, f"[{mode}] 다시 돌린 준비가 끝나면 출격이 열린다(워커가 죽어 주 스레드로 — 같은 해시)", [st["worker"], st["probe"]])
        g.click("#fgGo")
        g.wait("__fg_status.phase === 'play' && __fg_status.step >= 5")


def nogl(h, mode):
    with h.open(mode, init=[NOGL], allow=["THREE.WebGLRenderer"]) as g:
        g.wait("__fg_status.phase === 'nogl'")
        shown = g.js("['fgNoGl', 'fgTitle'].map((id) => getComputedStyle(document.getElementById(id)).display)")
        h.check(shown == ["flex", "none"] and g.status()["error"] != "", f"[{mode}] WebGL 을 못 켜면 안내만 보인다", [shown, g.status()["error"]])
        g.shot(f"nogl-{mode}.png")


def crash(h, mode):
    with h.open(mode, allow=["시험용 딴"]) as g:
        g.wait(h.READY)
        g.click("#fgGo")
        g.wait("__fg_status.phase === 'play' && __fg_status.step >= 5")
        # 고리 밖에서 난 예외 · 처리 안 한 거절(놀이와 무관한 것): 적어만 두고 판은 잇는다
        for kind, js in (("예외", "setTimeout(() => { throw new Error('시험용 딴 예외'); }, 0)"), ("거절", "Promise.reject(new Error('시험용 딴 거절'))")):
            g.js("() => { %s; }" % js)
            g.wait(f"__fg_status.stray.includes('딴 {kind}') || __fg_status.phase !== 'play'")
            step = g.status()["step"]
            g.frames(4)
            st = g.status()
            h.check(kind in st["stray"] and st["phase"] == "play" and st["error"] == "" and st["step"] > step, f"[{mode}] 고리 밖의 {kind} 하나 — 적어만 두고 판을 잇는다", st)
        g.js(h.BREAK_DRAW)
        g.wait("__fg_status.phase === 'error'")
        st = g.status()
        h.check("시험용 고장" in st["error"] and st["lock"] == "off" and "시험용 고장" in g.js("document.getElementById('fgErrorText').textContent"), f"[{mode}] 고리 안의 예외 → 멈추고 덮개", st)
        g.shot(f"error-{mode}.png")
        g.js("() => { delete THREE.Object3D.prototype.onBeforeRender; THREE.Object3D.prototype.onBeforeRender = function () {}; }")
        g.click("#fgRestart")
        g.wait("__fg_status.phase === 'title'")
        g.click("#fgGo")
        g.wait("__fg_status.phase === 'play' && __fg_status.step >= 5")


def run(h, opt):
    mode = "release" if opt.release else "dev"
    flow(h, mode)
    loop(h, mode)
    prep(h, mode)
    nogl(h, mode)
    crash(h, mode)
