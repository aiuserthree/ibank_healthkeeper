"""compile — 표면 재질 한 벌(F2a). 길 둘(?q=mid 정식 · ?q=low 값싼)마다: ① 장면의 프로그램이 전부 링크됐다 ② 재질 견본 판을 세워 방식 다섯(지형 겹 · 세 방향 · 제 좌표 ·
스키닝 · 평범)이 저마다 컴파일 · 링크됐다 ③ 그 뒤의 프로그램 수가 문턱(무거운 PBR 계열 · 전체) 안이다 — 값싼 길에는 무거운 것이 없다 ④ 스위치 묶음 여덟을 켜고 꺼도
프로그램이 새로 안 생기고(번호가 그대로), 등대의 묶음을 켜면 그림은 달라진다. 그리고 배포판의 준비 길이 구운 것의 수 보고(__fg_status.world.stats) = Node."""

NODE_STATS = "import { generate } from './src/shared/gen/world.js'; import { bake } from './src/shared/bake/index.js'; const { recipe } = await import('./src/data/slice1/recipe.js'); console.log(JSON.stringify(bake(generate(recipe)).baked.stats));"
SWITCH = """() => { __fg.station('beach');
  const ids = () => __fg.gfx().programs.map((p) => p.id).join(','), before = ids(), lit = __fg.grab(640, 360).url, known = [];
  for (let g = 0; g < 8; g++) { known.push(__fg.sw(g, 1)); __fg.sw(g, 0.5); __fg.sw(g, 0); }
  const off = __fg.grab(640, 360).url; __fg.sw(0, 1); const on = __fg.grab(640, 360).url; __fg.sw(0, 0);
  return { same: ids() === before, changed: on !== off, back: __fg.grab(640, 360).url === off, lamps: lit !== off, known }; }"""


def run(h, opt):
    T = h.thresholds["gfx"]["programs"]
    for q, lean in (("mid", False), ("low", True)):
        with h.open("dev", query="q=" + q) as g:
            g.wait(h.READY)
            a = g.js("__fg.gfx()")
            h.check(a["lean"] is lean and g.status()["quality"] == q, f"[{q}] 주소의 ?q= 가 길을 정한다(값싼 길 = low)", [a["lean"], g.status()["quality"]])
            h.check(a["linked"] and a["all"] >= 4, f"[{q}] 장면의 프로그램이 전부 링크됐다", a["programs"])
            m = g.js("__fg.modes()")
            h.check(m["modes"] == {k: True for k in ("terrain", "tri", "own", "skin", "plain")}, f"[{q}] 방식 다섯이 저마다 컴파일 · 링크됐다", m["modes"])
            h.check(m["linked"] and m["heavy"] <= T["heavy"] and m["all"] <= T["all"], f"[{q}] 프로그램 수 — 무거운 PBR 계열 ≤ {T['heavy']} · 전체 ≤ {T['all']}", [m["heavy"], m["all"]])
            h.check((m["heavy"] == 0) if lean else (m["heavy"] >= 4), f"[{q}] 값싼 길에는 무거운 PBR 프로그램이 없다 · 정식 길은 PBR 이다", m["heavy"])
            g.js("__fg.swatch(false)")
            s = g.js(SWITCH)
            h.check(s["same"], f"[{q}] 스위치 묶음을 켜고 꺼도 프로그램이 새로 생기지 않는다(번호가 그대로)", s)
            h.check(s["changed"] and s["back"] and s["lamps"] and s["known"][0] and s["known"][4], f"[{q}] 등대의 묶음을 켜면 그림이 달라지고 끄면 돌아온다 · 등롱의 묶음을 끄면 그림이 달라진다(스위치가 uniform 으로 먹는다)", s)
            h.notes[f"프로그램[{q}]"] = {"heavy": m["heavy"], "all": m["all"], "장면만": [a["heavy"], a["all"]], "names": sorted(p["name"] for p in m["programs"])}
    want = h.node_json(NODE_STATS)
    for q in ("mid", "low"):
        with h.open("release", query="q=" + q) as g:
            g.wait(h.READY)
            st = g.status()
            h.check(st["world"]["stats"] == want, f"[release · {q}] 준비 길이 구운 것의 수 보고 = Node(배포판이 실제로 구운 내용)", st["world"]["stats"])
            h.check(st["art"]["missing"] == 0 and st["art"]["ok"] == st["art"]["want"] > 0, f"[release · {q}] 자산을 다 받았다", st["art"])
            g.click("#fgGo")
            g.wait("__fg_status.phase === 'play' && __fg_status.step >= 5")
