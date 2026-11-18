"""arcade — 아케이드 약속(tdd §12-4)을 가짜 부모 창(parent.html — 진짜 hk-embed.js) 안에서 본다. 개발판 · 배포판 둘 다.
① 약속(말 하나하나 — 부모는 hk:esc 를 적기만 한다): hk:ready → hello → start(출격마다 한 번) → live → score(한 판에 한 번), hk:pause · resume · restart,
   판 중의 잠금 없는 Esc → hk:esc(판 밖에서는 올리지 않는다), 메뉴로 빠질 때 먼저 실패 점수, 멈춘 판을 닫으면 hk:resumed, 출처 · source 가 다른 말은 버림.
② 아케이드 흐름(부모가 hk:esc 로 멈춤 / 이어 하기를 정한다): 어느 길로 판을 닫고 열어도 Esc 한 번이면 멈춘다(부모의 멈춤 깃발이 게임과 어긋나지 않는다).
③ 다른 출처의 부모 창: 그쪽 말은 버리고 그쪽으로는 한 통도 가지 않는다. ④ hk:live 는 벽시계가 아니라 sim 시간으로 센다(가짜 rAF 시계).
⑤ 잠금 상태 기계의 전이 표: 헤드리스는 마우스 잠금을 거절하므로 가짜 잠금(FAKE_LOCK — 게임 창에만 심는다)과 세운 시계로 사건을 만들어 넣는다.
⑥ 고리 안의 예외 → 실패 점수 신호. ⑦(개발판) 손잡이를 쓴 「시험 판」은 판 신호를 보내지 않는다."""

FAKE_LOCK = """(() => {
  if (!location.pathname.endsWith('/fogisle.html')) return;
  const F = window.__fakeLock = { el: null, mode: 'grant', calls: [], at: 0 }, fire = () => document.dispatchEvent(new Event('pointerlockchange'));
  Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get() { return F.el; } });
  Element.prototype.requestPointerLock = function (opt) {
    const raw = !!(opt && opt.unadjustedMovement);
    F.calls.push(raw ? 'raw' : 'plain');
    if (F.mode === 'hold') return new Promise(() => {});
    if (F.mode === 'deny' || (F.mode === 'noraw' && raw)) return Promise.reject(new DOMException('시험용 거절', F.mode === 'noraw' ? 'NotSupportedError' : 'SecurityError'));
    F.el = this; Promise.resolve().then(fire);
    return Promise.resolve();
  };
  Document.prototype.exitPointerLock = function () { if (F.el) { F.el = null; fire(); } };
  F.drop = () => { F.el = null; fire(); };
  F.late = () => { F.el = document.getElementById('fgView'); fire(); };
  F.stop = () => { F.at = Math.ceil(performance.now()); performance.now = () => F.at; };
  F.go = () => { delete performance.now; };
})();"""
ESC = "window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }))"
PLAY, PAUSE, RESULT, TITLE = ("__fg_status.phase === '%s'" % p for p in ("play", "pause", "result", "title"))
LIVES = "() => [__fg_status.step, parent.__parent.log.filter((m) => m.type === 'hk:live').length]"


def promise(h, mode):
    arc, hz = h.node["tune"]["app"]["arcade"], h.node["tune"]["sim"]["hz"]
    per, tag = arc["liveSec"] * hz, f"[{mode}] 약속"
    with h.open(mode, parent="raw") as g:
        g.wait(h.READY)
        g.msgs(["hk:ready"], f"{tag}: 뜨면 hk:ready")
        h.check(g.js("document.documentElement.classList.contains('in-hk')") and g.status()["arcade"] is True, f"{tag}: hk:hello 를 받으면 in-hk")
        # 판 밖: Esc 는 부모로 올리지 않고(부모의 멈춤 깃발만 뒤집힌다), 부모가 보낸 hk:pause 에는 「안 멈췄다」고 답한다
        g.click("#fgLogo")
        g.page.keyboard.press("Escape")
        g.msgs([], f"{tag}: 판 밖(타이틀)의 Esc 는 hk:esc 를 올리지 않는다")
        g.send("hk:pause")
        g.msgs(["hk:resumed"], f"{tag}: 판 밖에서 받은 hk:pause → 멈출 것이 없다(hk:resumed 로 답한다)")
        g.click("#fgGo")
        g.wait(PLAY)
        g.msgs(["hk:start"], f"{tag}: 출격하면 hk:start 한 번")
        h.check(g.status()["lock"] == "free", f"{tag}: 헤드리스는 잠금 없이 논다", g.status()["lock"])

        # live: sim 시간으로 2초마다. 한 번의 읽기로 단계 수와 부모가 받은 수를 같이 본다(부모 쪽 도착은 한 통 늦을 수 있다)
        g.wait(f"__fg_status.step >= {2 * per + 4}", timeout=h.thresholds["harness"]["liveWaitMs"])
        seen = g.js("() => ({ step: __fg_status.step, lives: parent.__parent.log.filter((m) => m.type === 'hk:live').map((m) => m.score) })")
        due, n = seen["step"] // per, len(seen["lives"])
        h.check(n >= 2 and due - 1 <= n <= due, f"{tag}: hk:live 는 sim 2초({per}단계)마다 한 번", seen)
        h.check(all(isinstance(v, int) and 0 <= v <= arc["scoreMax"] for v in seen["lives"]), f"{tag}: live 의 점수는 0 ~ 상한의 정수", seen["lives"])

        # 출처 · source 가 다른 말(게임 창이 스스로에게 보낸 것)과 표에 없는 종류는 아무 일도 일으키지 않는다
        g.js("() => { window.postMessage({ type: 'hk:pause' }, location.origin); window.postMessage({ type: 'hk:restart' }, '*'); }")
        for kind in ("toString", "__proto__", "hk:nope"):
            g.send(kind)
        g.frames(6)
        h.check(g.status()["phase"] == "play" and g.status()["error"] == "", f"{tag}: 부모가 아닌 쪽의 말 · 모르는 종류는 버린다", g.status())

        # 잠금 없는 Esc → 스스로 멈추지 않고 hk:esc 만. 멈춤은 부모가 정한다
        g.page.keyboard.press("Escape")
        g.msgs(["hk:esc"], f"{tag}: 놀이 중 Esc → hk:esc")
        h.check(g.status()["phase"] == "play", f"{tag}: Esc 만으로는 멈추지 않는다")
        g.send("hk:pause")
        g.wait(PAUSE)
        g.msgs(["hk:paused"], f"{tag}: hk:pause → 멈춤 + hk:paused")
        before = g.js(LIVES)
        g.frames(30)
        h.check(g.js(LIVES) == before, f"{tag}: 멈춘 동안 단계도 live 도 흐르지 않는다")
        g.page.keyboard.press("Escape")
        g.msgs(["hk:esc"], f"{tag}: 멈춤 중 Esc → hk:esc")
        g.send("hk:resume")
        g.wait("document.documentElement.dataset.fgWait === '1'")
        g.msgs(["hk:paused"], f"{tag}: hk:resume → 「클릭하면 이어서」 + hk:paused 다시")
        h.check(g.status()["phase"] == "pause", f"{tag}: hk:resume 만으로는 이어 가지 않는다(사용자 동작이 필요)")
        g.page.mouse.click(90, 90)
        g.wait(PLAY)
        g.msgs(["hk:resumed"], f"{tag}: 덮개를 누르면 이어 하고 hk:resumed")

        # 그만두기 = 메뉴로 빠짐 → 실패 점수가 한 번, 그리고 멈춘 판이 닫혔으니 hk:resumed. 결과 화면의 Esc 는 올리지 않는다
        g.send("hk:pause")
        g.wait(PAUSE)
        g.click("#fgQuit")
        g.wait(RESULT)
        g.msgs(["hk:paused", "hk:score", "hk:resumed"], f"{tag}: 임무 그만두기 → hk:score 한 번 + 멈춤이 풀렸다고 알림")
        g.page.keyboard.press("Escape")
        g.msgs([], f"{tag}: 판 밖(결과)의 Esc 는 hk:esc 를 올리지 않는다")
        g.send("hk:restart")
        g.wait(TITLE)
        g.msgs([], f"{tag}: 판이 끝난 뒤의 hk:restart 는 점수를 또 보내지 않는다")
        # 둘째 판: 놀이 중에 부모의 「다시 하기」 → 게임은 먼저 실패 점수를 보낸다(진짜 부모는 그 판을 이미 닫아 받지 않는다). 셋째 판: 결과 화면의 「다시 하기」
        g.click("#fgGo")
        g.wait(PLAY)
        g.msgs(["hk:start"], f"{tag}: 둘째 판의 hk:start")
        g.page.evaluate("window.__parent.restart()")
        g.wait(TITLE)
        g.msgs(["hk:score"], f"{tag}: 놀이 중 hk:restart → 먼저 실패 점수")
        g.click("#fgGo")
        g.wait(PLAY)
        g.send("hk:pause")
        g.wait(PAUSE)
        g.click("#fgQuit")
        g.wait(RESULT)
        g.click("#fgAgain")
        g.wait(PLAY)
        g.msgs(["hk:start", "hk:paused", "hk:score", "hk:resumed", "hk:start"], f"{tag}: 셋째 판을 닫고 「다시 하기」로 넷째 판")
        p = g.parent()
        scores = [m["score"] for m in p["log"] if m["type"] == "hk:score"]
        h.check(p["starts"] == 4 and len(scores) == 3 and p["accepted"] == [scores[0], scores[2]], f"{tag}: 점수는 판마다 한 번 — 부모는 제가 닫지 않은 두 판(첫째 · 셋째)의 것만 받는다", [p["starts"], p["accepted"], scores])
        h.check(all(isinstance(v, int) and 0 <= v <= arc["scoreMax"] for v in scores) and p["dropped"] == 0, f"{tag}: 점수는 0 ~ 상한의 정수", scores)


def embed(h, mode):
    """진짜 부모의 흐름 — Esc 가 멈춤인지 이어 하기인지는 부모의 깃발이 가른다. 그 깃발이 어긋나면 판의 첫 Esc 가 삼켜진다(멈추지 않는다)"""
    tag = f"[{mode}] 흐름"
    with h.open(mode, parent=True) as g:
        def esc(want, label):
            g.page.keyboard.press("Escape")
            try:
                g.wait(want, timeout=h.thresholds["harness"]["msgSec"] * 1000)
            except Exception:
                pass
            h.check(g.js(want), f"{tag}: {label}", [g.status()["phase"], g.parent()["toggles"]])

        g.wait(h.READY)
        g.click("#fgLogo")
        esc(TITLE, "타이틀의 Esc — 아무 일도 없다")
        g.page.evaluate("window.__parent.pause()")
        g.frames(6)
        g.click("#fgGo")
        g.wait(PLAY)
        esc(PAUSE, "타이틀에서 Esc · 부모의 멈춤이 있었어도 첫 판의 Esc 한 번에 멈춘다")
        g.click("#fgQuit")
        g.wait(RESULT)
        esc(RESULT, "결과 화면의 Esc — 아무 일도 없다")
        g.click("#fgAgain")
        g.wait(PLAY)
        esc(PAUSE, "멈춘 채 그만둔 뒤 「다시 하기」로 연 판도 Esc 한 번에 멈춘다")
        esc("document.documentElement.dataset.fgWait === '1'", "멈춘 동안의 Esc → 부모가 이어 하기를 정함 → 「클릭하면 이어서」")
        g.page.mouse.click(90, 90)
        g.wait(PLAY)
        esc(PAUSE, "이어 한 뒤의 Esc 한 번에 다시 멈춘다")
        g.page.evaluate("window.__parent.restart()")
        g.wait(TITLE)
        g.click("#fgGo")
        g.wait(PLAY)
        esc(PAUSE, "멈춘 채 부모의 「다시 하기」로 닫은 뒤의 판도 Esc 한 번에 멈춘다")
        p = g.parent()
        h.check(p["toggles"] == ["pause", "pause", "resume", "pause", "pause"] and p["starts"] == 3 and len(p["accepted"]) == 1, f"{tag}: 부모가 정한 것 — 멈춤 · 멈춤 · 이어 하기 · 멈춤 · 멈춤", [p["toggles"], p["starts"], p["accepted"]])


def foreign(h, mode):
    """다른 출처의 창에 끼워졌을 때(주소에 ?hk=1 만 붙이면 누구나 끼울 수 있다): 그쪽이 보낸 말은 버리고, 그쪽으로는 아무것도 보내지 않는다"""
    with h.open(mode, parent="other", allow=["target origin provided"]) as g:
        g.wait(h.READY)
        g.click("#fgGo")
        g.wait(PLAY)
        for kind in ("hk:hello", "hk:pause", "hk:restart"):
            g.send(kind)
        g.frames(8)
        st, p = g.status(), g.parent()
        h.check(st["arcade"] and st["phase"] == "play" and not g.js("document.documentElement.classList.contains('in-hk')"), f"[{mode}] 다른 출처의 부모가 보낸 말은 버린다", st)
        h.check(p["log"] == [] and p["starts"] == 0, f"[{mode}] 다른 출처의 부모로는 한 통도 가지 않는다(받는 주소 = 제 출처)", p["log"])


def live_clock(h, mode):
    """hk:live 의 간격은 sim 시간: 프레임 간격이 길어 버려진 시간(벽시계만 흐른다)에는 보내지 않고, sim 이 2초어치 밟혔을 때 한 번 보낸다"""
    app, hz = h.node["tune"]["app"], h.node["tune"]["sim"]["hz"]
    per = app["arcade"]["liveSec"] * hz
    with h.open(mode, parent=True, init=[h.ONLY_GAME % h.FAKE_RAF]) as g:
        tick = lambda ms, n: g.js("([ms, n]) => { for (let i = 0; i < n; i++) window.__clock.tick(ms); return __fg_status.step; }", [ms, n])
        g.wait(h.READY)
        g.click("#fgGo")
        g.wait(PLAY)
        base = tick(1000, 1)
        a = [tick(app["loop"]["dropSec"] * 1000 + 50, 4 * per) - base, g.js(LIVES)[1]]
        b = [tick(1000 / hz + 0.01, per + 3) - base, g.js(LIVES)[1]]
        g.frames(0)
        h.check(a == [0, 0] and b[0] >= per and b[1] == 1, f"[{mode}] hk:live 는 벽시계가 아니라 sim 시간({per}단계)으로 센다", [a, b])
        g.js("() => { window.requestAnimationFrame = window.__clock.real; }")


def locktable(h, mode):
    lock, sens, tag = h.node["tune"]["app"]["lock"], h.node["tune"]["app"]["look"]["sens"], f"[{mode}] 잠금"
    with h.open(mode, parent="raw", init=[FAKE_LOCK]) as g:
        fake = lambda expr: g.js("() => { const F = window.__fakeLock; " + expr + " }")
        calls = lambda: g.js("window.__fakeLock.calls.length")
        unlocked = lambda label: h.check(g.js("document.pointerLockElement") is None, f"{tag}: {label}")

        def row(label, act, phase, state, msgs, flags="00"):
            """사건 하나를 넣고 → 단계 · 잠금 상태 · 깃발(wait · hint) · 부모가 받은 말을 본다"""
            act()
            try:
                g.wait(f"__fg_status.phase === '{phase}' && __fg_status.lock === '{state}' && document.documentElement.dataset.fgWait + document.documentElement.dataset.fgHint === '{flags}'", timeout=h.thresholds["harness"]["msgSec"] * 1000)
                ok = True
            except Exception:
                ok = False
            d = g.js("() => [__fg_status.phase, __fg_status.lock, document.documentElement.dataset.fgWait + document.documentElement.dataset.fgHint]")
            h.check(ok, f"{tag}: {label} → {phase} · {state} · {flags}", d)
            g.msgs(msgs, f"{tag}: {label}")

        g.wait(h.READY)
        g.msgs(["hk:ready"], f"{tag}: 뜨면 hk:ready")
        row("출격(잠금 허락)", lambda: g.click("#fgGo"), "play", "locked", ["hk:start"])
        h.check(g.js("window.__fakeLock.calls") == ["raw"] and g.js("document.pointerLockElement && document.pointerLockElement.id") == "fgView", f"{tag}: 정밀 입력 잠금을 캔버스에 먼저 청한다", g.js("window.__fakeLock.calls"))
        if mode == "dev":
            g.js("() => { document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: -50 })); }")
            s = g.js("__fg.state()")
            h.check(abs(s["yaw"] + 100 * sens) < 1e-12 and abs(s["pitch"] - 50 * sens) < 1e-12, f"{tag}: 잠긴 동안 mousemove 가 바로 시점에 더해진다", [s["yaw"], s["pitch"]])
            g.page.keyboard.down("KeyW")
            g.wait("__fg.state().input.mz === 1")
        # Esc 무시 시간의 길이는 세운 시계로 잰다(벽시계에 기대지 않는다): 풀린 그 틱 · 1ms 모자란 때는 무시, 꼭 찬 때부터 hk:esc
        ms = lock["escIgnoreMs"]
        fake("F.stop();")
        row("브라우저가 잠금을 풂 + 같은 Esc 의 keydown", lambda: fake(f"F.drop(); {ESC};"), "pause", "paused", ["hk:paused"])
        row(f"풀리고 {ms - 1}ms 째의 Esc — 아직 무시한다", lambda: fake(f"F.at += {ms - 1}; {ESC};"), "pause", "paused", [])
        row(f"풀리고 {ms}ms 째의 Esc", lambda: fake(f"F.at += 1; {ESC};"), "pause", "paused", ["hk:esc"])
        fake("F.go();")
        row("부모의 hk:resume", lambda: g.send("hk:resume"), "pause", "paused", ["hk:paused"], "10")
        n = calls()
        row("덮개를 눌렀는데 잠금이 거절됨", lambda: (fake("F.mode = 'deny';"), g.page.mouse.click(90, 90)), "pause", "paused", [], "11")
        g.page.wait_for_timeout(h.thresholds["harness"]["quietMs"])
        h.check(calls() == n + 1, f"{tag}: 거절된 뒤 타이머로 다시 청하지 않는다(안내만)", [n, calls()])
        row("다시 누르니 허락됨", lambda: (fake("F.mode = 'grant';"), g.click("#fgResume")), "play", "locked", ["hk:resumed"])
        if mode == "dev":
            g.frames(3)
            h.check(g.js("__fg.state().input.mz") == 0, f"{tag}: 멈출 때 누르고 있던 키를 비운다(W 를 아직 누르고 있어도)", g.js("__fg.state().input"))
            g.page.keyboard.up("KeyW")
        row("부모의 hk:pause", lambda: g.send("hk:pause"), "pause", "paused", ["hk:paused"])
        unlocked("hk:pause 를 받으면 잠금을 스스로 놓는다")
        row("「계속하기」", lambda: g.click("#fgResume"), "play", "locked", ["hk:resumed"])
        row("창이 초점을 잃음(blur)", lambda: g.js("() => { window.dispatchEvent(new Event('blur')); }"), "pause", "paused", ["hk:paused"])
        unlocked("초점을 잃으면 잠금을 놓는다")
        row("「계속하기」", lambda: g.click("#fgResume"), "play", "locked", ["hk:resumed"])
        hide = "() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; }"
        row("탭이 숨음", lambda: g.js(hide), "pause", "paused", ["hk:paused"])
        unlocked("탭이 숨으면 잠금을 놓는다")
        # 거절이 denyFree 번 쌓이면 다음 누름은 잠금 없이 이어 간다 → 그 뒤 캔버스를 누르면 다시 청한다(정밀 입력을 모르면 일반 잠금으로)
        fake("F.mode = 'deny';")
        for i in range(lock["denyFree"]):
            row(f"거절 {i + 1}번째", lambda: g.click("#fgResume"), "pause", "paused", [], "01")
        row("거절이 쌓인 뒤의 누름 — 잠금 없이 이어 감", lambda: g.click("#fgResume"), "play", "free", ["hk:resumed"])
        n = calls()
        row("캔버스를 누름(정밀 입력을 모르는 브라우저)", lambda: (fake("F.mode = 'noraw';"), g.page.mouse.click(640, 360)), "play", "locked", [])
        h.check(g.js("window.__fakeLock.calls.slice(%d)" % n) == ["raw", "plain"], f"{tag}: 정밀 입력이 안 되면 조용히 일반 잠금으로", g.js("window.__fakeLock.calls.slice(%d)" % n))
        row("잠긴 채 그만두기(부모가 멈춘 뒤)", lambda: (g.send("hk:pause"), g.wait(PAUSE), g.click("#fgQuit")), "result", "off", ["hk:paused", "hk:score", "hk:resumed"])
        unlocked("판이 끝나면 잠금이 없다")
        # 허락이 늦게 왔는데 그 사이에 멈췄으면 — 잠그지 않고 멈춘 채로 둔다
        row("다시 하기", lambda: g.click("#fgAgain"), "play", "locked", ["hk:start"])
        row("멈춘 뒤에 온 잠금 허락", lambda: (g.send("hk:pause"), g.wait(PAUSE), fake("F.late();")), "pause", "paused", ["hk:paused"])
        unlocked("멈춘 사이에 온 허락은 도로 놓는다")
        # 멈춘 채 「계속하기」를 눌러 요청이 가는 중에 부모의 hk:pause(나가기 확인 창) · blur 가 오면 그 요청을 거둔다 — 뒤늦은 허락이 판을 다시 돌리지 않는다
        fake("F.mode = 'hold';")
        for label, act in (("부모의 hk:pause", lambda: g.send("hk:pause")), ("blur", lambda: g.js("() => { window.dispatchEvent(new Event('blur')); }"))):
            n = calls()
            row(f"「계속하기」를 눌렀고 허락은 아직({label} 앞)", lambda: g.click("#fgResume"), "pause", "paused", [])
            row(f"요청이 가는 중의 {label} → 뒤늦은 허락", lambda: (act(), g.frames(3), fake("F.late();")), "pause", "paused", [])
            h.check(calls() == n + 1 and g.js("document.pointerLockElement") is None, f"{tag}: {label} 뒤에 온 허락은 도로 놓고 멈춘 채로 둔다", [n, calls()])


def crash_score(h, mode):
    with h.open(mode, parent=True) as g:
        g.wait(h.READY)
        g.js(h.BREAK_DRAW)
        g.click("#fgGo")
        g.wait("__fg_status.phase === 'error'")
        g.msgs(["hk:ready", "hk:start", "hk:score"], f"[{mode}] 고리 안의 예외 → 덮개 + 실패 점수 신호")


def tainted(h):
    with h.open("dev", parent="raw") as g:
        g.wait(h.READY)
        g.js("__fg.hold(false)")
        g.click("#fgGo")
        g.wait("__fg_status.phase === 'play' && __fg_status.step >= 10")
        h.check(g.status()["tainted"] and g.js("getComputedStyle(document.getElementById('fgTest')).display") == "block", "[dev] 손잡이를 쓰면 「시험 판」 표시")
        g.send("hk:pause")
        g.wait(PAUSE)
        g.click("#fgQuit")
        g.wait(RESULT)
        g.msgs(["hk:ready", "hk:paused", "hk:resumed"], "[dev] 시험 판은 hk:start · live · score 를 보내지 않는다")


def run(h, opt):
    for mode in ("dev", "release"):
        promise(h, mode)
        embed(h, mode)
        foreign(h, mode)
        live_clock(h, mode)
        locktable(h, mode)
        crash_score(h, mode)
    tainted(h)
