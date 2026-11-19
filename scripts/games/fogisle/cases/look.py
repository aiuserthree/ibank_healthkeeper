"""look — 캡처(F2a 의 「캡처로 직접 볼 것」): 길 둘(mid 정식 · low 값싼)마다 재질 견본 판 한 장 + 책갈피 여섯 장을 --out 폴더에 찍고, 나란히 놓은 접지(책갈피 × 길 · 키 아트 곁)를 만든다.
기계로는 빈 화면이 아닌지 · 서로 다른 그림인지 · 두 길의 밝기가 비슷한지만 본다 — 채점은 사람 · 검수 에이전트가 직접 열어 보고 한다. gate 밖의 명령이다."""
import base64, hashlib, io

NODE_STATIONS = "const { recipe } = await import('./src/data/slice1/recipe.js'); console.log(JSON.stringify(Object.keys(recipe.marks.stations)));"


def run(h, opt):
    from PIL import Image, ImageStat
    T, shots, means = h.thresholds["gfx"], {}, {}

    def save(g, name, size):
        r = g.js("(s) => __fg.grab(s[0], s[1])", size)
        raw = base64.b64decode(r["url"].split(",")[1])
        (h.out / name).write_bytes(raw)
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        st = ImageStat.Stat(im.convert("L"))
        h.check(st.stddev[0] >= T["shotStdMin"] and r["triangles"] > 0, f"{name}: 그려졌다(빈 화면이 아니다)", [round(st.stddev[0], 1), r["triangles"]])
        shots[name], means[name] = hashlib.sha1(raw).hexdigest(), st.mean[0]
        return im

    ims = {}
    for q in ("mid", "low"):
        with h.open("dev", query="q=" + q) as g:
            g.wait(h.READY)
            stations = h.node_json(NODE_STATIONS)
            for st in stations:
                g.js(f"__fg.station('{st}')")
                ims[st, q] = save(g, f"station-{st}-{q}.png", T["shot"])
            g.js("__fg.swatch(true)")
            ims["swatch", q] = save(g, f"swatch-{q}.png", T["swatch"])
    h.check(len(set(shots.values())) == len(shots), "캡처가 전부 서로 다른 그림이다", len(shots))
    for st in stations:
        a, b = means[f"station-{st}-mid.png"], means[f"station-{st}-low.png"]
        h.check(abs(a - b) <= T["fallbackMeanDiff"], f"{st}: 두 길의 화면 평균 밝기가 비슷하다(값싼 길이 「다른 게임」이 아니다)", [round(a, 1), round(b, 1)])
    # 접지: 책갈피(줄) × 길(칸 — 왼쪽 정식 · 오른쪽 값싼), 그리고 키 아트 둘 곁에 해변 책갈피
    w, hh = 800, 450
    sheet = Image.new("RGB", (w * 2, hh * len(stations)))
    for i, st in enumerate(stations):
        for k, q in enumerate(("mid", "low")):
            sheet.paste(ims[st, q].resize((w, hh), Image.LANCZOS), (k * w, i * hh))
    sheet.save(h.out / "sheet-stations.jpg", quality=90)
    art = [Image.open(h.src.parents[1] / "web" / "assets" / "games" / "fogisle" / "art" / f"{n}-v1.webp").convert("RGB").resize((w, hh), Image.LANCZOS) for n in ("m1", "title")]
    side = Image.new("RGB", (w * 2, hh * 3))
    for i, im in enumerate(art + [ims["rocks", "mid"], ims["rocks", "low"], ims["beach", "mid"], ims["beach", "low"]]):
        side.paste(im.resize((w, hh), Image.LANCZOS), ((i % 2) * w, (i // 2) * hh))
    side.save(h.out / "sheet-keyart.jpg", quality=90)
    h.notes["캡처"] = {"out": str(h.out), "밝기": {k: round(v, 1) for k, v in means.items()}}
