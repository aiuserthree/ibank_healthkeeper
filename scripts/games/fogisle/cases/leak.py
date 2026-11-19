"""leak — 자원과 자산(F2a). ① 세계를(자산까지) 지우고 다시 세우기를 다섯 번: 형상 · 무늬 · 프로그램 수가 처음과 그대로다(길 둘 다) ② 자산 폴더가 전부 404 여도 준비가 끝나고
그려진다(대체 색 — 빈 화면이 아니고 밝기가 크게 다르지 않다) ③ ?noart=1 은 그림을 아예 청하지 않는다."""
import base64, io

ART = "/assets/games/fogisle/"
GRAB = "() => { __fg.station('camp'); return __fg.grab(640, 360).url; }"


def stat(url):
    from PIL import Image, ImageStat
    s = ImageStat.Stat(Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("L"))
    return s.mean[0], s.stddev[0]


def run(h, opt):
    T = h.thresholds["gfx"]
    base = {}
    for q in ("mid", "low"):
        with h.open("dev", query="q=" + q) as g:
            g.wait(h.READY)
            rows = g.js("(n) => __fg.remake(n)", T["remakes"])
            keys = ("geometries", "textures", "programs", "heavy", "registry")
            h.check(len(rows) == T["remakes"] + 1 and all({k: r[k] for k in keys} == {k: rows[0][k] for k in keys} for r in rows), f"[{q}] 세계를 {T['remakes']}번 지우고 다시 세워도 형상 · 무늬 · 프로그램 수가 그대로", [[r[k] for k in keys[:4]] for r in rows])
            h.check(rows[0]["geometries"] > 20 and rows[0]["textures"] > 5 and rows[-1]["triangles"] > 1000, f"[{q}] (전제) 세는 것이 실제로 올라가 있다", rows[0])
            base[q] = stat(g.js(GRAB))
            h.notes[f"자원[{q}]"] = {k: rows[0][k] for k in keys}
    for q in ("mid", "low"):
        with h.open("dev", query="q=" + q, deny=[ART], allow=["Failed to load resource"]) as g:
            g.wait(h.READY)
            art, info, (mean, std) = g.status()["art"], g.js("__fg.gfx()"), stat(g.js(GRAB))
            h.check(art["ok"] == 0 and art["missing"] == art["want"] > 0, f"[{q}] 자산 폴더가 전부 404 — 하나도 못 받았다(시험의 전제)", art)
            h.check(info["linked"] and std >= T["shotStdMin"], f"[{q}] 자산이 전부 404 여도 그려진다(빈 화면이 아니다)", [info["linked"], round(std, 1)])
            h.check(abs(mean - base[q][0]) <= T["fallbackMeanDiff"], f"[{q}] 대체 색으로 그린 화면의 밝기가 크게 다르지 않다", [round(mean, 1), round(base[q][0], 1)])
            g.click("#fgGo")
            g.wait("__fg_status.phase === 'play' && __fg_status.step >= 5")
    with h.open("release", query="noart=1") as g:
        g.wait(h.READY)
        seen = g.js("performance.getEntriesByType('resource').filter((e) => e.name.includes('%s')).length" % ART)
        h.check(g.status()["art"]["ok"] == 0 and g.status()["art"]["missing"] == 0 and seen == 0, "[release] ?noart=1 — 그림을 청하지 않고 준비가 끝난다", [g.status()["art"], seen])
