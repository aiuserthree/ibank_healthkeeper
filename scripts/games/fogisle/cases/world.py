"""world — 세계 생성(F1a). ① 생성 해시: Node(원본) = 기준 파일(tests/golden/world.json) = 크롬 주 스레드(개발판 · 배포판 — 묶인 shared 덩이에 Node 가 읽은
레시피를 그대로 넣는다) = 개발판에 묶인 레시피로 만든 것(__fg.gen) = 워커 러너로 만든 것(__fg.genJob — 형식 배열을 넘겨받는다). 씨앗을 바꾸면 달라진다.
② 삼각형 · 꼭짓점 · 인스턴스 수가 예산(tune 의 world.budget) 안이고 크롬이 센 수가 Node 와 같다. ③ 개발 뷰어(?show=world)가 위 · 옆 · 눈높이를 그린다 —
캡처를 --out 폴더에 world-<카메라>.png 로 남기고(사람 · 검수 에이전트가 직접 열어 본다) 빈 화면이 아닌지 · 서로 다른 그림인지만 기계로 본다."""
import hashlib, json

NODE_WORLD = r"""
import { generate, hashWorld } from './src/shared/gen/world.js';
import { tuneSnapshot } from './src/shared/tune/index.js';
const name = process.argv[1], { recipe } = await import('./src/data/' + name + '/recipe.js');
const world = generate(recipe), other = { ...recipe, seed: recipe.seed + 1 }, far = generate(other), same = hashWorld({ ...far, seed: recipe.seed }) === hashWorld(world);
console.log(JSON.stringify({ recipe, other, hash: hashWorld(world), otherHash: hashWorld(far), seedUsed: !same, stats: world.stats, budget: tuneSnapshot().world.budget }));
"""
GEN = "(recipe) => { const W = window.__fgShared['shared/gen/world.js'], w = W.generate(recipe); return { hash: W.hashWorld(w), stats: w.stats }; }"
WORLDS = ("slice1",)
SHOTS = (("top", "gray"), ("side", "gray"), ("eye", "gray"), ("side", "axis"))


def run(h, opt):
    from PIL import Image, ImageStat
    T = h.thresholds["world"]
    golden = json.loads((h.src / "tests" / "golden" / "world.json").read_text(encoding="utf-8"))
    for name in WORLDS:
        n = h.node_json(NODE_WORLD, name)
        st, budget = n["stats"], n["budget"]
        h.notes["세계 " + name] = {"hash": n["hash"], **st}
        h.check(golden.get(name) == n["hash"], f"[{name}] Node(원본)의 생성 해시 = 기준 파일", [n["hash"], golden.get(name)])
        h.check(n["seedUsed"] and n["otherHash"] != n["hash"], f"[{name}] 씨앗이 다르면 만든 것이 다르다(씨앗 칸만 다른 것이 아니다 — 견줌이 뜻이 있다)")
        over = [k for k, v in (("tris", st["drawTris"]), ("verts", st["verts"]), ("instances", st["instances"]), ("collideTris", st["collideTris"])) if v > budget[k]]
        h.check(not over and st["drawTris"] > 0 and st["instances"] > 0, f"[{name}] 삼각형 · 꼭짓점 · 인스턴스 수가 예산 안", [over, st])
        for mode in ("dev", "release"):
            with h.open(mode) as g:
                g.wait(h.READY)
                a, b = g.js(GEN, n["recipe"]), g.js(GEN, n["other"])
                h.check(a["hash"] == n["hash"] and b["hash"] == n["otherHash"], f"[{mode}] {name}: 크롬 주 스레드의 생성 해시 = Node(씨앗 둘)", [a["hash"], n["hash"], b["hash"], n["otherHash"]])
                h.check(a["stats"] == st, f"[{mode}] {name}: 크롬이 센 삼각형 · 꼭짓점 · 인스턴스 수 = Node", a["stats"])
                if mode != "dev":
                    continue
                own = g.js(f"__fg.gen('{name}')")
                h.check(own["hash"] == n["hash"], f"[dev] {name}: 개발판에 묶인 레시피로 만든 해시 = Node", own["hash"])
                job = g.js(f"__fg.genJob('{name}')")
                h.check(job["where"] == "worker" and job["moved"] >= 1 and job["hash"] == n["hash"], f"[dev] {name}: 워커 러너로 만든 세계의 해시 = Node(형식 배열을 넘겨받았다)", [job["where"], job["moved"], job["hash"]])
                h.notes["세계 " + name]["크롬 생성 ms"] = round(own["ms"], 1)
        with h.open("dev", query=f"show=world&world={name}", viewport=tuple(T["viewport"])) as g:
            g.wait("document.getElementById('fgViewer') !== null")
            seen = {}
            for cam, tint in SHOTS:
                r = g.js(f"__fg.view('{name}', '{cam}', '{tint}')")
                g.frames(2)
                path = g.shot(f"world-{name}-{cam}{'' if tint == 'gray' else '-' + tint}.png")
                std = sum(ImageStat.Stat(Image.open(path).convert("L")).stddev)
                seen[cam + tint] = hashlib.sha1(path.read_bytes()).hexdigest()
                h.check(r["tris"] > 0 and std >= T["shotStdMin"], f"[dev] 뷰어 {cam}({tint}): 세계가 그려졌다(빈 화면이 아니다)", [r["tris"], round(std, 1)])
                if cam == "top":
                    h.check(r["tris"] >= st["drawTris"], "[dev] 뷰어 top: 그린 삼각형 수 ≥ 세계의 삼각형 수(빠진 묶음이 없다)", [r["tris"], st["drawTris"]])
            h.check(len(set(seen.values())) == len(SHOTS), "[dev] 뷰어의 카메라 · 색마다 다른 그림이 나온다", seen)
            h.check(g.status()["phase"] == "title" and not g.status()["error"], "[dev] 뷰어를 띄워도 게임은 타이틀에 그대로 있다", g.status()["phase"])
            h.notes["세계 " + name]["캡처"] = str(h.out)
