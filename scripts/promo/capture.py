"""새 게임 소개 영상 — 게임마다 실제로 켜서 조작하며 7초씩 녹화(GPU 헤드리스 크롬, 1280×720, CDP 화면 받기). 결과: raw/<게임>/ 프레임 → build.py 앞에 ffmpeg 로 raw/<게임>.mp4 를 만든다.
   ffmpeg -f concat -safe 0 -i raw/<게임>/list.txt -vf "fps=30,scale=1280:720,format=yuv420p" -c:v libx264 -crf 18 raw/<게임>.mp4 """
import json, pathlib, mimetypes, base64, math, sys, time
from playwright.sync_api import sync_playwright
WEB = pathlib.Path("/Users/jhcho/Documents/개인 프로젝트/헬스키퍼/web")
OUT = pathlib.Path(__file__).parent / "raw"; OUT.mkdir(exist_ok=True)
def handle(route):
    url = route.request.url.split("?")[0].replace("http://hk.test", "")
    if url.startswith("/api/"): return route.fulfill(status=200, content_type="application/json", body='{"data":{}}')
    p = WEB / url.lstrip("/")
    if not p.exists(): return route.fulfill(status=404, body="")
    return route.fulfill(status=200, content_type=mimetypes.guess_type(str(p))[0] or "text/html", body=p.read_bytes())
WASD = "wasd"
GAMES = [
  # key, url, localStorage, start clicks(text), warmup ms, drive
  ("sundown", "/games/embed/sundown.html", {"sundown-bumpers-v1": json.dumps({"unlocked":13,"track":4,"seenHelp":True,"mute":True})}, ["출발하기"], 4200, "race"),
  ("holecity", "/games/embed/holecity.html", {}, ["시작하기"], 2500, "wasd"),
  ("jelly", "/games/embed/jelly.html", {}, ["시작"], 3000, "wasd"),
  ("nightsquad", "/games/embed/nightsquad.html", {}, ["작전 시작"], 3500, "wasd"),
  ("kitsune", "/games/embed/kitsune.html", {}, ["시작하기"], 3000, "wasd"),
  ("frostcamp", "/games/embed/frostcamp.html", {}, ["시작", "[data-st=skip]"], 3000, "wasd"),
  ("eggfarm", "/games/embed/eggfarm.html?hk=1", {}, ["3분 도전"], 2500, "wasd"),
  ("herorush", "/games/embed/herorush.html", {}, ["1단계 시작"], 2500, "lr"),
  ("vinyl", "/games/embed/vinyl.html", {}, ["#bPlay"], 3000, "jump"),
]
only = sys.argv[1:]
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--use-angle=metal","--enable-gpu","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"])
    for key, url, ls, clicks, warm, drive in GAMES:
        if only and key not in only: continue
        ctx = b.new_context(viewport={"width":1280,"height":720}, device_scale_factor=1)
        init = "try{" + "".join(f"localStorage.setItem({json.dumps(k)},{json.dumps(v)});" for k,v in ls.items()) + "}catch(e){}"
        ctx.add_init_script(init)
        pg = ctx.new_page(); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
        pg.route("http://hk.test/**", handle)
        pg.goto("http://hk.test" + url); pg.wait_for_timeout(3500)
        for t in clicks:
            try:
                if t[0] in "#[": pg.locator(t).first.click(timeout=6000)
                else: pg.get_by_text(t, exact=True).first.click(timeout=6000)
            except Exception as e: errs.append("click:"+t)
            pg.wait_for_timeout(400)
        pg.mouse.move(640, 360)
        if drive == "race": pg.keyboard.down("ArrowUp")
        pg.wait_for_timeout(warm)
        cdp = ctx.new_cdp_session(pg); frames=[]
        cdp.on("Page.screencastFrame", lambda f: (frames.append((f["metadata"]["timestamp"], f["data"])), cdp.send("Page.screencastFrameAck", {"sessionId": f["sessionId"]})))
        cdp.send("Page.startScreencast", {"format":"jpeg","quality":88,"maxWidth":1280,"maxHeight":720,"everyNthFrame":1})
        t0 = time.time(); held=set()
        def hold(keys):
            for k in list(held):
                if k not in keys: pg.keyboard.up(k); held.discard(k)
            for k in keys:
                if k not in held: pg.keyboard.down(k); held.add(k)
        while time.time() - t0 < 7.0:
            t = time.time() - t0
            if drive == "wasd":
                a = t * 1.3
                ks = []
                if math.cos(a) > .35: ks.append("d")
                if math.cos(a) < -.35: ks.append("a")
                if math.sin(a) > .35: ks.append("s")
                if math.sin(a) < -.35: ks.append("w")
                hold(ks)
            elif drive == "race":
                st = math.sin(t * 1.6)
                hold(["ArrowRight"] if st > .55 else ["ArrowLeft"] if st < -.55 else [])
            elif drive == "lr":
                hold(["ArrowRight"] if math.sin(t*1.4) > 0 else ["ArrowLeft"])
            elif drive == "jump":
                if int(t*10) % 9 == 0: pg.keyboard.press("Space")
            pg.wait_for_timeout(50)
        hold([])
        cdp.send("Page.stopScreencast")
        d = OUT / key; d.mkdir(exist_ok=True)
        for f in d.glob("*.jpg"): f.unlink()
        lines=[]
        for i,(ts,data) in enumerate(frames):
            fn = d / f"{i:05d}.jpg"; fn.write_bytes(base64.b64decode(data))
            lines.append((fn.name, ts))
        with open(d/"list.txt","w") as fh:
            for i,(n,ts) in enumerate(lines):
                dur = (lines[i+1][1]-ts) if i+1 < len(lines) else 1/30
                fh.write(f"file '{n}'\nduration {max(0.001,dur):.4f}\n")
            if lines: fh.write(f"file '{lines[-1][0]}'\n")
        fps = len(frames)/7.0
        print(key, "frames", len(frames), f"~{fps:.1f}fps", errs[:3]); sys.stdout.flush()
        ctx.close()
    b.close()
