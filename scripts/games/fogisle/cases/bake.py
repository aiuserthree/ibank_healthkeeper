"""bake — 굽기(F1b). ① 굽기 해시: Node(원본) = 기준 파일(tests/golden/bake.json) = 크롬 주 스레드(개발판 · 배포판 — 묶인 shared 덩이에 Node 가 읽은 레시피를
그대로 넣는다) = 워커가 구워 넘겨준 것 = 워커를 막아 주 스레드에서 조각내 구운 것. 씨앗이 다르면 다르다. 임무 크기 시험 세계(tests/worlds/big.mjs)도 Node = 크롬 주 스레드 = 워커.
**해시는 전부 하네스가 주 창에서 받은 배열을 다시 센 값이다**(워커가 세어 보낸 값을 믿지 않는다 — 보내는 길에서 값이 바뀌면 잡힌다): 놀이의 준비 길은 해시를 세지 않는다
(__fg_status.world.hash · bake = null). 개발판은 주소 ?bakehash=1 로 준비 길에서도 세게 할 수 있고(워커가 센 값) 타이틀이 스스로 구운 것은 __fg.prepHash() 로 다시 센다.
배포판은 손잡이가 없어 타이틀이 구운 배열을 못 읽는다 → 하네스가 같은 창 안에서 제 Blob 워커(묶인 shared 덩이 그대로)로 굽고 · 주 스레드에서 조각내 구워 받은 것을 센다. ② 시간: slice1 을 워커로 「생성 → 굽기」 한 벽시계 · 그동안 주 스레드 rAF 의 최대 간격 ·
임무 크기를 주 스레드에서 CPU 4배 느리게(CDP — 워커에는 안 먹혀 주 스레드로 잰다) 「생성 + 굽기」 · 임무 크기를 워커로. ③ 준비의 진행: 워커 러너가 단계 이름을
차례대로 알려 오고(워커 길 · 주 스레드 길), 타이틀의 준비가 끝나면 <html data-fg-prep="done"> · --fg-prep = 1. ④ 뷰어: 걷기 격자 · 고리 · 엄폐 겹침 3장 +
구운 빛만 입힌 회색 2장을 --out 폴더에 bake-<세계>-….png 로 남긴다(사람 · 검수 에이전트가 직접 열어 본다) — 기계로는 빈 화면이 아닌지 · 서로 다른 그림인지만 본다."""
import hashlib, json

NODE_BAKE = r"""
import { prepSteps, STAGES } from './src/shared/bake/index.js';
import { tuneSnapshot } from './src/shared/tune/index.js';
const name = process.argv[1], { recipe } = await import('./src/data/' + name + '/recipe.js'), big = (await import('./tests/worlds/big.mjs')).recipe;
const run = (r) => { const it = prepSteps(r, true); let s = it.next(); while (!s.done) s = it.next(); return s.value; };
const a = run(recipe), other = { ...recipe, seed: recipe.seed + 1 }, b = run(other), c = run(big);
console.log(JSON.stringify({ recipe, other, big, hash: a.hash, otherHash: b.hash, bigHash: c.hash, stats: a.baked.stats, bigStats: { ...c.baked.stats, collideTris: c.world.stats.collideTris }, stages: STAGES, budget: tuneSnapshot().bake.budget }));
"""
# 받은 세계 · 구운 것을 주 창에서 센다(묶인 shared 덩이의 해시 함수 — 개발판 · 배포판 공통)
COUNT = "const S = window.__fgShared, count = (v) => ({ world: S['shared/gen/world.js'].hashWorld(v.world), bake: S['shared/bake/index.js'].hashBake(v.baked) });"
# 주 스레드에서 한 번에: ms = 「생성 + 굽기」(해시 셈은 빼고 — 놀이의 준비 길과 같다) · counted = 준비 길이 스스로 센 해시(없어야 한다)
MAIN = "(recipe) => { " + COUNT + """ const t0 = performance.now(), it = S['shared/bake/index.js'].prepSteps(recipe); let s = it.next();
  while (!s.done) s = it.next(); const ms = performance.now() - t0; return { hash: count(s.value), counted: s.value.hash, ms, stats: s.value.baked.stats }; }"""
# 하네스의 제 Blob 워커(게임의 러너를 안 거친다): 묶인 shared 덩이로 굽고 형식 배열을 넘겨받아 주 창에서 센다. flip = 받은 배열의 값 하나를 바꾸면 해시가 달라지는가
OWN = "async (recipe) => { " + COUNT + """ const text = document.getElementById('fg-shared').textContent + `
;self.onmessage = (e) => { const it = self.__fgShared['shared/bake/index.js'].prepSteps(e.data); let s = it.next(); while (!s.done) s = it.next();
  const list = [], walk = (n) => { if (!n || typeof n !== 'object') return; if (ArrayBuffer.isView(n)) { if (!list.includes(n.buffer)) list.push(n.buffer); return; } for (const k of Object.keys(n)) walk(n[k]); };
  walk(s.value); self.postMessage(s.value, list); };`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })), w = new Worker(url);
  const v = await new Promise((ok, no) => { w.onmessage = (e) => ok(e.data); w.onerror = (e) => no(new Error(e.message || 'worker')); w.postMessage(recipe); });
  w.terminate(); URL.revokeObjectURL(url);
  const hash = count(v); v.baked.nav.y[0] ^= 1; const flip = count(v).bake !== hash.bake; return { hash, counted: v.hash, flip }; }"""
# 주 스레드에서 조각내(8ms 조각을 MessageChannel 로 잇달아 — 게임의 폴백 길과 같은 꼴) 구운 것
SLICED = "async (recipe) => { " + COUNT + """ const it = S['shared/bake/index.js'].prepSteps(recipe); let slices = 0;
  const v = await new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { const t0 = performance.now(); slices++; let s = it.next();
    while (!s.done && performance.now() - t0 < 8) s = it.next(); if (s.done) { ch.port1.close(); ok(s.value); } else ch.port2.postMessage(0); }; ch.port2.postMessage(0); });
  return { hash: count(v), slices }; }"""
# 워커로 굽는 동안의 rAF 간격: 잠깐 고르게 돌린 뒤 일을 맡기고, 답이 올 때까지 가장 긴 간격을 잰다
JOB = """async (recipe) => { let gap = 0, last = performance.now(), on = true; const tick = () => { const n = performance.now(); gap = Math.max(gap, n - last); last = n; if (on) requestAnimationFrame(tick); };
  requestAnimationFrame(tick); await new Promise((ok) => setTimeout(ok, 250)); gap = 0;
  const r = await __fg.bakeJob(recipe); on = false; return { ...r, gap }; }"""
BLOCK = "window.Worker = function () { throw new Error('시험용 막힘'); };"
PREP = "[document.documentElement.dataset.fgPrep, getComputedStyle(document.documentElement).getPropertyValue('--fg-prep').trim()]"
WORLDS = ("slice1",)
# (카메라, 색, 얹을 것, 파일 꼬리표)
SHOTS = (("top", "gray", "nav", "nav-top"), ("at:6,7.5,31,-12,-24", "gray", "nav", "nav-beach"), ("at:-1,3.6,17.5,-22,-14", "gray", "nav", "nav-camp"), ("at:-13,5,24,-28,-16", "baked", "", "light-camp"), ("at:4,3.2,25,6,-7", "lamps", "", "lamps-camp"))


def squash(steps):
    """받은 단계 이름에서 잇달아 겹친 것을 하나로(흩기 줄 · 조각마다 같은 이름이 온다)"""
    return [s for i, s in enumerate(steps) if i == 0 or steps[i - 1] != s]


def run(h, opt):
    from PIL import Image, ImageStat
    T = h.thresholds["bake"]
    golden = json.loads((h.src / "tests" / "golden" / "bake.json").read_text(encoding="utf-8"))
    for name in WORLDS:
        n = h.node_json(NODE_BAKE, name)
        note = h.notes["굽기 " + name] = {"hash": n["hash"], **n["stats"]}
        h.check(golden.get(name) == n["hash"]["bake"], f"[{name}] Node(원본)의 굽기 해시 = 기준 파일", [n["hash"], golden.get(name)])
        h.check(n["otherHash"]["bake"] != n["hash"]["bake"], f"[{name}] 씨앗이 다르면 구운 것이 다르다(견줌이 뜻이 있다)")
        h.check(n["stats"]["coverHome"] >= n["budget"]["coverMin"], f"[{name}] 엄폐 점(시작 자리의 닿는 무리 안) {n['budget']['coverMin']}곳 이상", [n["stats"]["coverHome"], n["stats"]["cover"]])
        for mode in ("dev", "release"):
            with h.open(mode, parent=True, query="bakehash=1" if mode == "dev" else "") as g:
                g.wait(h.READY)
                st, sent = g.status(), [n["hash"]["world"], n["hash"]["bake"]]
                if mode == "dev":
                    # 개발판 + ?bakehash=1: 워커가 센 값(__fg_status.world) = Node, 그리고 받은 배열을 주 창에서 다시 센 값(__fg.prepHash) = Node
                    again = g.js("__fg.prepHash()")
                    h.check(st["world"] and st["world"]["where"] == "worker" and [st["world"]["hash"], st["world"]["bake"]] == sent, f"[dev] {name}: ?bakehash=1 — 타이틀의 준비(sandbox 창 안의 Blob 워커)가 센 해시 = Node", st["world"])
                    h.check(again and again["where"] == "worker" and [again["world"], again["bake"]] == sent, f"[dev] {name}: 타이틀이 스스로 구운 것을 주 창에서 다시 센 해시 = Node", again)
                else:
                    # 배포판: 준비 길은 해시를 세지 않는다. 하네스가 같은 창 안의 제 Blob 워커로 굽고 받은 배열을 주 창에서 센다
                    own = g.js(OWN, n["recipe"])
                    h.check(st["world"] and st["world"]["where"] == "worker" and st["world"]["hash"] is None and st["world"]["bake"] is None, f"[release] {name}: 타이틀의 준비는 워커에서 돌고 해시를 세지 않는다", st["world"])
                    h.check(own["hash"] == n["hash"] and own["counted"] is None, f"[release] {name}: 하네스의 Blob 워커(묶인 shared 덩이)가 구워 넘긴 것을 주 창에서 센 해시 = Node", own["hash"])
                    h.check(own["flip"], f"[release] {name}: 받은 배열의 값 하나를 바꾸면 다시 센 해시가 달라진다(견줌이 받은 것을 본다)")
                h.check(g.js(PREP) == ["done", "1"] and st["prep"] == "done", f"[{mode}] 준비가 끝나면 진행이 끝까지 찬다(data-fg-prep · --fg-prep)", [g.js(PREP), st["prep"]])
                a, b = g.js(MAIN, n["recipe"]), g.js(MAIN, n["other"])
                h.check(a["hash"] == n["hash"] and b["hash"] == n["otherHash"] and a["counted"] is None, f"[{mode}] {name}: 크롬 주 스레드의 굽기 해시 = Node(씨앗 둘 · 받은 것을 센 값 — 준비 길은 세지 않는다)", [a["hash"], b["hash"], a["counted"]])
                h.check(a["stats"] == n["stats"], f"[{mode}] {name}: 크롬이 센 걷는 칸 · 고리 · 엄폐 점 수 = Node", a["stats"])
                note[f"크롬 주 스레드 ms[{mode}]"] = round(a["ms"])
                if mode != "dev":
                    continue
                # 워커로: 해시 · 벽시계 · rAF 간격 · 진행(단계 이름이 차례대로)
                runs = [g.js(JOB, name) for _ in range(T["tries"])]
                best = min(runs, key=lambda r: r["gap"])
                h.check(all(r["where"] == "worker" and r["moved"] >= 10 and r["hash"] == n["hash"] for r in runs), f"[dev] {name}: 워커 러너로 구워 넘겨받은 것을 주 창에서 센 해시 = Node(형식 배열을 넘겨받았다)", [runs[0]["where"], runs[0]["moved"], runs[0]["hash"]])
                h.check(squash(runs[0]["steps"]) == n["stages"], f"[dev] {name}: 워커가 단계 이름을 차례대로 알려 온다(준비 띠)", squash(runs[0]["steps"]))
                h.check(runs[0]["ms"] <= T["sliceWorkerSec"] * 1000, f"[dev] {name}: 워커로 「생성 → 굽기」 벽시계 ≤ {T['sliceWorkerSec']}초(처음 맡긴 것)", round(runs[0]["ms"]))
                h.check(best["gap"] <= T["rafGapMs"], f"[dev] {name}: 워커로 굽는 동안 rAF 최대 간격 ≤ {T['rafGapMs']}ms({T['tries']}번 가운데 가장 조용한 값)", [round(r["gap"], 1) for r in runs])
                note.update({"워커 벽시계 ms": [round(r["ms"]) for r in runs], "rAF 최대 간격 ms": [round(r["gap"], 1) for r in runs]})
                # 임무 크기: 워커 벽시계 → 주 스레드 CPU 4배 느리게(처음 도는 것 — 데워지지 않은 값)
                big = g.js(JOB, n["big"])
                h.check(big["where"] == "worker" and big["hash"] == n["bigHash"], "[dev] 임무 크기 시험 세계: 워커의 굽기 해시 = Node", big["hash"])
                h.check(big["ms"] <= T["workerWallSec"] * 1000, f"[dev] 임무 크기: 워커 벽시계 ≤ {T['workerWallSec']}초", round(big["ms"]))
                cdp = g.page.context.new_cdp_session(g.page)
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
                slow = g.js(MAIN, n["big"])
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
                h.check(slow["hash"] == n["bigHash"], "[dev] 임무 크기: 크롬 주 스레드의 굽기 해시 = Node", slow["hash"])
                h.check(slow["ms"] <= T["mainCpu4xSec"] * 1000, f"[dev] 임무 크기: 주 스레드 CPU 4배 느리게 「생성 + 굽기」 ≤ {T['mainCpu4xSec']}초", round(slow["ms"]))
                h.notes["굽기 임무 크기"] = {"hash": n["bigHash"], **n["bigStats"], "워커 벽시계 ms": round(big["ms"]), "워커 rAF 간격 ms": round(big["gap"], 1), "주 스레드 CPU 4배 ms": round(slow["ms"])}
        # 워커를 막으면 주 스레드에서 조각내 굽는다 — 같은 해시(조각내 돌린 것) · 진행도 같은 차례로 온다
        for mode in ("dev", "release"):
            with h.open(mode, parent=True, query="bakehash=1" if mode == "dev" else "", init=[h.ONLY_GAME % BLOCK]) as g:
                g.wait(h.READY)
                w, sent = g.status()["world"], [n["hash"]["world"], n["hash"]["bake"]]
                h.check(w and w["where"] == "main" and w["slices"] >= 4, f"[{mode}] {name}: 워커를 막으면 타이틀의 준비가 주 스레드에서 조각내 굽는다", w)
                if mode == "dev":
                    again = g.js("__fg.prepHash()")
                    h.check([w["hash"], w["bake"]] == sent and [again["world"], again["bake"]] == sent, f"[dev] {name}: 주 스레드에서 조각내 구운 것의 해시 = Node(준비 길이 센 값 · 주 창에서 다시 센 값)", [w, again])
                else:
                    cut = g.js(SLICED, n["recipe"])
                    h.check(w["hash"] is None and cut["hash"] == n["hash"] and cut["slices"] >= 4, f"[release] {name}: 주 스레드에서 조각내 구운 것(하네스가 8ms 조각으로)의 해시 = Node", cut)
                note[f"주 스레드 조각 수[{mode}]"] = w and w["slices"]
                if mode == "dev":
                    r = g.js("__fg.bakeJob('%s')" % name)
                    h.check(r["where"] == "main" and squash(r["steps"]) == n["stages"] and r["hash"] == n["hash"], "[dev] 주 스레드 길도 단계 이름을 차례대로 알린다", [r["where"], squash(r["steps"])])
                g.click("#fgGo")
                g.wait("__fg_status.phase === 'play' && __fg_status.step >= 5")
        # 뷰어 캡처(직접 열어 볼 것)
        with h.open("dev", query=f"show=world&world={name}", viewport=tuple(h.thresholds["world"]["viewport"])) as g:
            g.wait("document.getElementById('fgViewer') !== null")
            made = g.status()["world"]
            h.check(made and made["hash"] is None and made["bake"] is None, "[dev] ?bakehash=1 이 없으면 개발판의 준비 길도 해시를 세지 않는다", made)
            seen = {}
            for cam, tint, over, tag in SHOTS:
                r = g.js(f"__fg.view('{name}', '{cam}', '{tint}', '{over}')")
                g.frames(2)
                path = g.shot(f"bake-{name}-{tag}.png")
                std = sum(ImageStat.Stat(Image.open(path).convert("L")).stddev)
                seen[tag] = hashlib.sha1(path.read_bytes()).hexdigest()
                h.check(r["tris"] > 0 and std >= T["shotStdMin"], f"[dev] 뷰어 {tag}: 그려졌다(빈 화면이 아니다)", [r["tris"], round(std, 1)])
            h.check(len(set(seen.values())) == len(SHOTS), "[dev] 뷰어의 그림들이 서로 다르다", seen)
            note["캡처"] = str(h.out)
