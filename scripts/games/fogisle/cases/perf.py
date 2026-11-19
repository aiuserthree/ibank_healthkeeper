"""perf — 값싼 길(FG_LEAN)의 화소 기울기(F2a · 부록 D-6). 책갈피마다 그리기 버퍼를 1280×720 ~ 3840×2160 으로 바꿔 가며 프레임의 GPU 시간을 재어(시간 질의 — 프레임마다
질의 하나 + 1픽셀 읽기로 기다림) 화소 수에 대한 기울기(ms/MP)를 낸다. 문턱 = thresholds 의 perf.leanSlopeMsPerMP. 다른 작업의 GPU 부하는 값을 늘리기만 하므로
gfx.tries 번까지 다시 재어 책갈피마다 가장 낮은 기울기를 쓴다. 시간 질의가 안 되면 「n 프레임 + 1픽셀」 벽시계의 기울기로 본다. 정식 길은 한 번 재어 적기만 한다. gate 밖의 명령이다."""
import os


def run(h, opt):
    T, limit = h.thresholds["gfx"], h.thresholds["perf"]["leanSlopeMsPerMP"]
    best, wall, tries = {}, {}, []
    with h.open("dev", query="q=low") as g:
        g.wait(h.READY)
        for n in range(T["tries"]):
            r = g.js("() => __fg.bench()")
            key = "slopeGpu" if r["timer"] else "slopeWall"
            for st, v in r["stations"].items():
                best[st] = min(best.get(st, 9), v[key]); wall[st] = min(wall.get(st, 9), v["slopeWall"])
            tries.append({"load": round(os.getloadavg()[0], 1), **{st: round(v[key], 3) for st, v in r["stations"].items()}})
            if max(best.values()) <= limit:
                break
        h.check(r["lean"] and r["timer"], "값싼 길에서 GPU 시간 질의로 쟀다(안 되면 벽시계로 본다)", [r["lean"], r["timer"]])
        h.check(len(best) >= 6 and max(best.values()) <= limit, f"값싼 길의 화소 기울기 ≤ {limit}ms/MP(책갈피마다 — 가장 큰 값)", {k: round(v, 3) for k, v in best.items()})
        h.notes["값싼 길 화소 기울기 ms/MP"] = {"gpu": {k: round(v, 3) for k, v in best.items()}, "wall": {k: round(v, 3) for k, v in wall.items()}, "tries": tries,
                                          "4K ms": {st: round(v["rows"][-1]["gpuMs"] or v["rows"][-1]["wallMs"], 2) for st, v in r["stations"].items()}}
    with h.open("dev", query="q=mid") as g:
        g.wait(h.READY)
        r = g.js("() => __fg.bench(['beach', 'camp'])")
        h.notes["정식 길 화소 기울기 ms/MP(참고)"] = {st: {"gpu": v["slopeGpu"] and round(v["slopeGpu"], 3), "wall": round(v["slopeWall"], 3)} for st, v in r["stations"].items()}
