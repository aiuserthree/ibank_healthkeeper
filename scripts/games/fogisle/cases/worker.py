"""worker — 워커 러너(app/worker.js)를 아케이드와 같은 sandbox 창 안에서 본다.
① Blob 워커(fg-shared 덩이의 글)로 돈 탐침 해시 = Node(원본) — 개발판 · 배포판. 결과의 형식 배열이 transfer 로 오고 내용이 Node 와 같다.
② 워커는 표의 사본을 따로 가진다 → 주 창에서 바꾼 수치가 일과 함께 넘어가야 한다. 동시에 맡긴 일이 서로 섞이지 않는다.
③ Worker 를 막은 흉내 넷(생성자가 던짐 · 생성자 없음 · 오류 사건 · 준비 신호가 안 옴) → 주 스레드로 떨어져 같은 해시.
④ 주 스레드 길은 조각내 돌고(MessageChannel), rAF 가 멈춰 있어도 끝난다. ⑤ 없는 함수를 맡기면 그 일만 거절된다(워커 길 · 주 스레드 길 — 러너는 산다)."""

# 「준비 신호가 안 옴」은 러너의 준비 기다림(tune 의 app.worker.readyMs — %(ready)d)만 짧게(%(short)d) 줄여 본다
BLOCKS = {
    "생성자가 던짐": "window.Worker = function () { throw new Error('시험용 막힘'); };",
    "생성자 없음": "window.Worker = undefined;",
    "오류 사건": "window.Worker = function () { this.postMessage = () => {}; this.terminate = () => {}; setTimeout(() => { if (this.onerror) this.onerror(new Event('error')); }, 0); };",
    "준비 신호가 안 옴": "window.Worker = function () { this.postMessage = () => {}; this.terminate = () => {}; }; { const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === %(ready)d ? %(short)d : ms, ...a); }",
}
NO_RAF = "window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;"
NOPE = "__fg.worker(%d, 3, 'nope').then((r) => 'ok ' + r.where, (e) => 'rejected')"


def run(h, opt):
    n, c = h.node, h.node["tune"]["app"]["selfCheck"]
    seed, steps, long, T = c["seed"], c["steps"], n["long"], h.thresholds["harness"]
    times = {"ready": n["tune"]["app"]["worker"]["readyMs"], "short": T["shortMs"]}
    for mode in ("dev", "release"):
        with h.open(mode, parent=True) as g:
            g.wait(h.READY)
            st = g.status()
            h.check(st["worker"] == "worker" and st["probe"] == n["probe"], f"[{mode}] sandbox 창 안의 Blob 워커로 돈 자가 점검 해시 = Node", [st["worker"], st["probe"], n["probe"]])
            if mode != "dev":
                continue
            r = g.js(f"__fg.worker({seed}, {steps})")
            h.check(r["where"] == "worker" and r["hash"] == n["probe"], "[dev] 워커 러너로 맡긴 일의 해시 = Node", [r["where"], r["hash"]])
            h.check(r["moved"] >= 1 and r["kind"] == "Float64Array" and r["pos"] == n["pos"], "[dev] 형식 배열이 transfer 로 오고 내용이 Node 와 한 비트도 다르지 않다", [r["moved"], r["kind"], len(r["pos"])])
            both = g.js(f"Promise.race([Promise.all([__fg.worker({seed}, {long['steps']}), __fg.worker({seed}, {steps})]), new Promise((ok) => setTimeout(() => ok([{{}}, {{}}]), {T['raceMs']}))])")
            both = [{"hash": None, **b} for b in both]
            h.check([both[0]["hash"], both[1]["hash"]] == [long["hash"], n["probe"]], "[dev] 동시에 맡긴 두 일이 제 답을 받는다", [both[0]["hash"], both[1]["hash"]])
            # 표를 바꾸면: 주 스레드의 값과 워커의 값이 같이 바뀐다(워커가 스냅숏을 받아 맞춘다). 되돌리면 돌아온다
            speed = g.js("__fg.tune('probe.speed')")
            g.js(f"__fg.tune('probe.speed', {speed * 1.5})")
            changed = g.js(f"__fg.worker({seed}, {steps})")
            h.check(changed["hash"] == g.js(f"__fg.probeHash({seed}, {steps})") and changed["hash"] != n["probe"] and changed["where"] == "worker", "[dev] 주 창에서 바꾼 수치가 워커의 표에도 들어간다", changed["hash"])
            g.js(f"__fg.tune('probe.speed', {speed})")
            h.check(g.js(f"__fg.worker({seed}, {steps})")["hash"] == n["probe"], "[dev] 되돌리면 워커의 값도 돌아온다")
            bad, after = g.js(NOPE % seed), g.js(f"__fg.worker({seed}, {steps})")
            h.check(bad == "rejected" and g.status()["error"] == "" and g.status()["phase"] == "title", "[dev] 없는 함수를 맡기면 그 일만 거절된다(워커 길 — 게임은 그대로)", bad)
            h.check(after["where"] == "worker" and after["hash"] == n["probe"], "[dev] 거절 뒤에도 워커는 살아 다음 일을 한다", [after["where"], after["hash"]])
    # 워커를 막은 흉내 → 주 스레드로. 첫 흉내는 개발판 · 배포판 둘 다, 나머지는 배포판으로
    for i, (name, script) in enumerate(BLOCKS.items()):
        for mode in (("dev", "release") if i == 0 else ("release",)):
            with h.open(mode, parent=True, init=[h.ONLY_GAME % (script % times)]) as g:
                g.wait(h.READY)
                st = g.status()
                h.check(st["worker"] == "main" and st["probe"] == n["probe"], f"[{mode}] Worker 를 막으면({name}) 주 스레드로 떨어져 같은 해시", [st["worker"], st["probe"]])
                if mode == "dev":
                    r = g.js(f"__fg.worker({seed}, {long['steps']})")
                    h.check(r["where"] == "main" and r["hash"] == long["hash"] and r["slices"] >= 2, "[dev] 주 스레드 길은 긴 일을 조각내 돈다(같은 해시)", [r["where"], r["slices"], r["hash"]])
                    h.notes["주 스레드 조각 수(긴 탐침)"] = r["slices"]
                    h.check(g.js(NOPE % seed) == "rejected" and g.status()["error"] == "", "[dev] 없는 함수를 맡기면 거절된다(주 스레드 길)")
                g.click("#fgGo")
                g.wait("__fg_status.phase === 'play' && __fg_status.step >= 5")
    with h.open("release", parent=True, init=[h.ONLY_GAME % (BLOCKS["생성자가 던짐"] + NO_RAF)]) as g:
        g.wait(h.READY)
        h.check(g.status()["worker"] == "main" and g.status()["probe"] == n["probe"], "[release] rAF 가 멈춰 있어도 주 스레드 길이 끝난다(rAF 에 묶이지 않았다)", g.status()["probe"])
        h.check(g.js("() => new Promise((done) => { requestAnimationFrame(() => done('rAF')); setTimeout(() => done('멈춤'), 300); })") == "멈춤", "[release] (시험의 전제) 그 창의 rAF 는 정말 멈춰 있었다")
        g.js("() => { window.requestAnimationFrame = window.__raf; }")
