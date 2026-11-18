"""새 게임 소개 영상 — 게임마다 실제로 켜서 조작하며 7초씩(ringcatch · hoops 는 10초) 녹화(GPU 헤드리스 크롬, 1280×720, CDP 화면 받기). 결과: raw/<게임>/ 프레임 → build.py 앞에 ffmpeg 로 raw/<게임>.mp4 를 만든다.
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
REC = {"ringcatch": 10.0, "hoops": 10.0, "sundown": 10.0}  # 녹화 길이(초) — 없으면 7초
# 옥상 링 캐치 — 가장 먼저 골대 높이에 닿을 공의 떨어질 x 를 계산해 골대를 그 밑으로(림에 안 닿게 가운데로 받아 「완벽」 연속 → 불꽃 공)
RC_AUTO = """(()=>{const R=window.__rc;if(!R)return 'no __rc';const HH=R.W.hoop.root.position.y;
  const tick=()=>{requestAnimationFrame(tick);if(R.state!=='play')return;let best=null;
    for(const b of R.W.balls){if(b.st!=='fly')continue;const g=b.g||18,a=-g/2,bb=b.v.y,c=b.p.y-HH,D=bb*bb-4*a*c;if(D<0)continue;
      const t=(-bb-Math.sqrt(D))/(2*a);if(t<0)continue;if(!best||t<best.t)best={t,x:b.p.x+b.v.x*t};}
    if(best)R.W.hxT=best.x;};tick();return 'ok';})()"""
# 옥상 덩크슛 — 지금 골대에서 다음 골대 림 한가운데로 내려 꽂히는 (각도, 힘)을 찾는다(벽 튕김 · 림 양 끝에 스치는 길은 빼서 「완벽」 연속 → 불꽃 공)
HOOPS_SOLVE = """(()=>{const H=window.__hoops;if(!H||H.state!=='play')return null;const A=H.A;if(A.phase!=='rest'||!A.cur||!A.tgt)return null;
  const WX=5,BR=0.42,RR=0.98,GA=27,VMIN=8,VMAX=25.5,DEG=Math.PI/180,c=A.cur,t=A.tgt;let best=null;
  for(let ad=-70;ad<=70;ad+=1)for(let pw=0.2;pw<=1.0;pw+=0.01){const ang=ad*DEG,sp=VMIN+(VMAX-VMIN)*pw;
    let x=c.x-Math.sin(ang)*0.42,y=c.y-Math.cos(ang)*0.42,vx=Math.sin(ang)*sp,vy=Math.cos(ang)*sp,ok=true,hit=null;const dt=1/240;
    for(let i=0;i<240*3;i++){const py=y;vy-=GA*dt;x+=vx*dt;y+=vy*dt;if(x>WX-BR||x<-WX+BR){ok=false;break;}
      if(Math.min(Math.hypot(x-t.x-RR,y-t.y),Math.hypot(x-t.x+RR,y-t.y))<BR+0.09+0.06){ok=false;break;}
      if(py>t.y&&y<=t.y){hit={x,vy};break;}}
    if(!ok||!hit||hit.vy>-4)continue;const e=Math.abs(hit.x-t.x)+pw*0.08;if(!best||e<best.e)best={e,ang,pw,err:Math.abs(hit.x-t.x)};}
  if(!best||best.err>0.25)return null;const full=Math.max(120,Math.min(300,Math.min(innerWidth,innerHeight)*0.36));
  return {dx:-Math.sin(best.ang)*best.pw*full,dy:Math.cos(best.ang)*best.pw*full,err:best.err};})()"""
GAMES = [
  # key, url, localStorage, start clicks(text), warmup ms, drive — 가장 새 게임을 맨 위에
  # ringcatch · hoops 는 창 밖에서 열면 생기는 확인용 손잡이(window.__rc · window.__hoops)로 공 자리를 읽어 자동 조작
  ("ringcatch", "/games/embed/ringcatch.html", {"ringcatch3d.v1": json.dumps({"seen":True,"mute":True})}, ["#btnStart"], 2500, "ringcatch"),
  ("hoops", "/games/embed/hoops.html", {"hoops3d.v1": json.dumps({"seenA":True,"mute":True})}, ["#btnStart"], 600, "hoops"),
  # 선다운 — 그래픽 품질 「높음」 고정(sundown-gfx-v1), 트랙은 0부터(4 = 그랜드 노을 축제길 · 7 = 얼음 성 · 2 = 네온). 인자 sundown@7 처럼 주면 그 트랙을 raw/sundown@7/ 에 찍는다
  ("sundown", "/games/embed/sundown.html", {"sundown-bumpers-v1": json.dumps({"unlocked":13,"track":4,"seenHelp":True,"mute":True}), "sundown-gfx-v1": json.dumps({"pick":"high"})}, ["출발하기"], 3300, "race"),
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
RUNS = []
for g in GAMES:
    if not only: RUNS.append((g[0], g)); continue
    for a in only:
        k, _, tr = a.partition("@")
        if k != g[0]: continue
        ls = dict(g[2])
        if tr: ls["sundown-bumpers-v1"] = json.dumps({**json.loads(ls["sundown-bumpers-v1"]), "track": int(tr)})
        RUNS.append((a, (g[0], g[1], ls) + tuple(g[3:])))
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--use-angle=metal","--enable-gpu","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"])
    for name, (key, url, ls, clicks, warm, drive) in RUNS:
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
        if drive == "ringcatch": errs.append("auto:" + str(pg.evaluate(RC_AUTO)))
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
        rec = REC.get(key, 7.0)
        while time.time() - t0 < rec:
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
                if int(t * 20) % 50 == 25: pg.keyboard.press("e")  # 2.5초마다 아이템 쓰기(로켓 · 물풍선 등이 화면에 보이게)
            elif drive == "lr":
                hold(["ArrowRight"] if math.sin(t*1.4) > 0 else ["ArrowLeft"])
            elif drive == "hoops":
                sol = pg.evaluate(HOOPS_SOLVE)
                if sol:  # 당기는 동안 점선이 보이게 0.6초에 걸쳐 끌고, 잠깐 멈췄다 놓는다
                    x0, y0 = 640, 420
                    pg.mouse.move(x0, y0); pg.mouse.down()
                    for k in range(1, 19):
                        f = k / 18; pg.mouse.move(x0 + sol["dx"] * f, y0 + sol["dy"] * f); pg.wait_for_timeout(33)
                    pg.wait_for_timeout(250); pg.mouse.up(); pg.wait_for_timeout(900)
                elif pg.evaluate("window.__hoops&&window.__hoops.state") == "stage":
                    pg.keyboard.press("Space")
            elif drive == "jump":
                if int(t*10) % 9 == 0: pg.keyboard.press("Space")
            pg.wait_for_timeout(50)
        hold([])
        cdp.send("Page.stopScreencast")
        d = OUT / name; d.mkdir(exist_ok=True)
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
        fps = len(frames)/rec
        print(name, "frames", len(frames), f"~{fps:.1f}fps", errs[:3]); sys.stdout.flush()
        ctx.close()
    b.close()
