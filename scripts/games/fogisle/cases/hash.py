"""hash — 「Node(원본) = 크롬(개발판) = 크롬(배포판)」. 견주는 값은 둘이다:
① 탐침 해시(shared 만으로 도는 결정성 자가 점검 — dmath 열 함수 · 난수 · 해시): Node 원본 = 기준 파일 = 크롬 주 스레드(__fgShared) = 게임이 타이틀에서 스스로 돌린 값(__fg_status.probe).
② sim 해시(봇이 입력 표를 채워 민 상태 나무 + 사건): Node 원본 = 기준 파일 = 개발판의 묶인 sim = **게임의 고리가 실제로 쓰는 나무를 개발 창구로 민 값**
   (조각을 어떻게 나눠 밀어도 같다 · 스냅숏 → 복원 왕복도 같다).
③ 배포판은 sim 을 밖에서 밀 수 없다(손잡이가 없는 것이 맞다) → 입력 없이 흐른 판을 멈추고 읽기 전용 __fg_status.hash 를 Node 의 「빈 입력 n 단계」와 견준다(두 판 모두)."""
import json

PROBE_MAIN = "([seed, steps]) => { const P = window.__fgShared['shared/probe.js']; return P.runAll(P.probeRun(seed, steps)).hash; }"


def run(h, opt):
    n, app = h.node, h.node["tune"]["app"]
    seed, steps, base = app["selfCheck"]["seed"], app["selfCheck"]["steps"], app["seed"]
    golden = json.loads((h.src / "tests" / "golden" / "sim.json").read_text(encoding="utf-8"))
    h.check(golden.get(f"shared-probe|{seed}|-|{steps}") == n["probe"], "Node(원본)의 탐침 해시 = 기준 파일", [n["probe"], golden])
    h.check(golden.get(f"probe|{base}|probeBot|{steps}") == n["sim"][str(base)], "Node(원본)의 sim 해시 = 기준 파일", [n["sim"], golden])
    h.notes["해시"] = {"probe": n["probe"], "sim": n["sim"][str(base)]}
    for mode in ("dev", "release"):
        with h.open(mode) as g:
            g.wait(h.READY)
            st = g.status()
            h.check(g.js(PROBE_MAIN, [seed, steps]) == n["probe"], f"[{mode}] 크롬 주 스레드의 탐침 해시 = Node", g.js(PROBE_MAIN, [seed, steps]))
            h.check(st["probe"] == n["probe"], f"[{mode}] 게임이 스스로 돌린 자가 점검 해시 = Node({st['worker']})", st["probe"])
            h.check(g.js(PROBE_MAIN, [seed + 1, steps]) != n["probe"], f"[{mode}] 씨앗이 다르면 해시도 다르다(견줌이 뜻이 있다)")
            if mode == "dev":
                h.check(g.js(f"__fg.probeHash({seed}, {steps})") == n["probe"] and g.js(f"__fg.simHash({base}, {steps})") == n["sim"][str(base)], "[dev] 묶인 sim · 봇을 돌린 해시 = Node", g.js(f"__fg.simHash({base}, {steps})"))
            # 게임의 고리가 스스로 민 나무: 출격해 입력 없이 흘려보내다 Esc 로 멈추고(부모 창 없음 → 스스로 멈춘다) 그 단계의 해시를 Node 와 견준다
            g.click("#fgGo")
            g.wait("__fg_status.step >= 30")
            g.page.keyboard.press("Escape")
            g.wait("__fg_status.phase === 'pause'")
            st = g.status()
            want = [h.state_hash(base, st["step"]), h.state_hash(base, st["step"] + 1)]
            h.check(st["hash"] == want[0] != want[1], f"[{mode}] 고리가 민 상태 나무의 해시 = Node(입력 없이 {st['step']}단계 · 한 단계만 달라도 다르다)", [st["hash"], want])
    # 게임의 고리가 쓰는 바로 그 나무: 시계를 세우고 봇을 건 뒤 출격 → 개발 창구로 민다. ?seed= 로 씨앗을 바꾼 판도 본다
    for s, chunks in ((base, [steps]), (h.node_extra_seed, [1, 7, 300, steps - 308])):
        with h.open("dev", query=f"seed={s}" if s != base else "") as g:
            g.wait(h.READY)
            g.js("() => { __fg.hold(); __fg.bot('probe'); }")
            g.click("#fgGo")
            g.wait("__fg_status.phase === 'play'")
            g.frames(5)
            first = g.js("__fg.state()")
            h.check(first["step"] == 0 and first["seed"] == s and first["tainted"], f"[dev] 시계를 세운 판은 고리가 밀지 않는다(씨앗 {s})", [first["step"], first["seed"]])
            for c in chunks:
                last = g.js(f"__fg.step({c})")
            h.check(last["step"] == steps and last["hash"] + ":" + last["events"] == n["sim"][str(s)], f"[dev] 고리의 나무를 {len(chunks)}조각으로 민 sim 해시 = Node(씨앗 {s})", [last["hash"] + ":" + last["events"], n["sim"][str(s)]])
            # 왕복: 지금을 찍어 두고 더 밀었다가, 복원해 같은 만큼 다시 밀면 같은 나무
            snap = g.js("__fg.snapshot()")
            a = g.js("__fg.step(240)")
            b = g.js("() => { __fg.restore(); return __fg.step(240); }")
            h.check(snap == last["hash"] and a["hash"] == b["hash"] and a["hash"] != snap and b["step"] == steps + 240, f"[dev] 스냅숏 → 복원 왕복(씨앗 {s})", [snap, a["hash"], b["hash"]])
            ev = g.js("__fg.events(400)")
            h.check([e["step"] for e in ev if e["kind"] == "restored"] == [steps], f"[dev] 복원하면 restored 사건이 한 번 나온다(씨앗 {s})", [e for e in ev if e["kind"] == "restored"])
