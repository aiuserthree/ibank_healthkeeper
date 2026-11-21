"""새 게임 소개 영상 — 게임마다 실제로 켜서 조작하며 7초씩(ringcatch · hoops 는 10초) 녹화(GPU 헤드리스 크롬, 1280×720, CDP 화면 받기). 결과: raw/<게임>/ 프레임 → build.py 앞에 ffmpeg 로 raw/<게임>.mp4 를 만든다.
   ffmpeg -f concat -safe 0 -i raw/<게임>/list.txt -vf "fps=30,scale=1280:720,format=yuv420p" -c:v libx264 -crf 18 raw/<게임>.mp4 """
import json, pathlib, mimetypes, base64, math, sys, time
from playwright.sync_api import sync_playwright
WEB = pathlib.Path(__file__).resolve().parents[2] / "web"  # 이 저장소(작업 폴더)의 web
OUT = pathlib.Path(__file__).parent / "raw"; OUT.mkdir(exist_ok=True)
def handle(route):
    url = route.request.url.split("?")[0].replace("http://hk.test", "")
    if url.startswith("/api/"): return route.fulfill(status=200, content_type="application/json", body='{"data":{}}')
    p = WEB / url.lstrip("/")
    if not p.exists(): return route.fulfill(status=404, body="")
    return route.fulfill(status=200, content_type=mimetypes.guess_type(str(p))[0] or "text/html", body=p.read_bytes())
WASD = "wasd"
REC = {"ringcatch": 10.0, "hoops": 10.0, "sundown": 10.0, "twilightrun": 12.0, "moonshot": 20.0, "looseends": 10.0, "acornshot": 10.0, "ferry": 10.0}  # 녹화 길이(초) — 없으면 7초
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
# 실타래 풀기 — 게임 안 풀이(Rules.suggest)로 다음 수를 구해 핀을 마우스로 끌어 옮긴다(창 밖에서 열면 생기는 window.__looseends)
LE_NEXT = """(()=>{const L=window.__looseends,S=L&&L.state;if(!S||S.busy||S.won||S.held||S.anim.length)return null;
  const mv=L.Rules.suggest(S.holes,S.ropes,S.tw,S.hist.map(h=>h.mv));if(!mv)return null;const r=S.ropes.find(r=>r.id===mv.id);
  const a=L.holeXY(r[mv.end]),b=L.holeXY(mv.to);return {x0:a.x,y0:a.y,x1:b.x,y1:b.y};})()"""
# 통통배 선착장 — 게임 안 풀이(solve)의 첫 수 배를 누른다(창 밖에서 열면 생기는 window.__ferry)
FERRY_TAP = """(()=>{const F=window.__ferry;if(!F||F.mode!=='play')return null;const r=F.solve(F.state,{limit:20000});if(!r.ok||!r.moves.length)return null;F.tap(r.moves[0]);return r.moves[0];})()"""
def drag(pg, x0, y0, x1, y1, n=18, hold=200):
    pg.mouse.move(x0, y0); pg.mouse.down()
    for k in range(1, n + 1): pg.mouse.move(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n); pg.wait_for_timeout(30)
    pg.wait_for_timeout(hold); pg.mouse.up()
GAMES = [
  # key, url, localStorage, start clicks(text), warmup ms, drive — 가장 새 게임을 맨 위에
  # 황혼 질주 — 서해 노을길 스프린트, 카운트다운(3초)이 끝나고 속도가 붙은 뒤부터 W 를 밟은 채 차선을 바꿔 가며 달린다
  ("twilightrun", "/games/embed/twilightrun.html", {}, ["#start"], 5500, "twilight"),
  # 뿅뿅 달나라 대포 — 보통 · 방아 로버 · 고요한 달 바다, 내 차례에 한 발 쏘고 컴퓨터가 쏴 터지는 장면까지
  ("moonshot", "/games/embed/moonshot.html", {"moonshot.v1": json.dumps({"mute": True})}, ["#tStart", "#pGo"], 3500, "moonshot"),
  # 실타래 풀기 — 퍼즐 13(실꾸러미, 줄 5개 · 첫 단계 손가락 안내 없음)
  ("looseends", "/games/embed/looseends.html", {"looseends.v1": json.dumps({"stars": [3] * 12, "cur": 11})}, [], 1500, "looseends"),
  # 도토리 새총단 — 이끼 계곡 3「서리 봉우리」(얼음 망루 셋), 두 발 쏴 망루가 와르르
  ("acornshot", "/games/embed/acornshot.html", {"acornshot.v1": json.dumps({"stars": [3] * 10, "best": [1] * 10})}, ["#start"], 4000, "acornshot"),
  # 통통배 선착장 — 5단계부터(1단계 손가락 안내 없음), 풀이대로 배를 눌러 빼고 손님을 태워 보낸다
  ("ferry", "/games/embed/ferry.html", {"ferry1": json.dumps({"level": 5, "mute": True})}, ["#btnStart"], 2500, "ferry"),
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
        t0 = time.time(); held=set(); nxt=0.0
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
            elif drive == "twilight":  # 3초마다 차선 하나씩 오른쪽 · 왼쪽으로
                ph = t % 6.0
                hold(["w", "d"] if 1.0 < ph < 1.45 else ["w", "a"] if 4.0 < ph < 4.45 else ["w"])
            elif drive == "moonshot" and t >= nxt:  # 내 차례가 오면 0.6초 뒤 스페이스를 1.1초 눌러 쏜다(그 사이 컴퓨터 차례)
                if pg.evaluate("(document.getElementById('dTurn')||{}).textContent") == "내 차례":
                    pg.wait_for_timeout(600); pg.keyboard.down("Space"); pg.wait_for_timeout(1100); pg.keyboard.up("Space"); nxt = time.time() - t0 + 3.0
            elif drive == "looseends" and t >= nxt:
                mv = pg.evaluate(LE_NEXT)
                if mv: drag(pg, mv["x0"], mv["y0"], mv["x1"], mv["y1"], n=20, hold=150); nxt = time.time() - t0 + 1.0
            elif drive == "acornshot" and t >= nxt:  # 0.3초 · 4.6초에 당겨 쏜다(첫 발은 앞 망루 · 둘째 발은 가운데 돌 망루)
                s = pg.evaluate("AcornGame.sling()")
                if nxt == 0.0: drag(pg, s["x"], s["y"], s["x"] - 110, s["y"] + 48, n=20, hold=350); nxt = 4.6
                elif nxt == 4.6 and pg.evaluate("AcornGame.snapshot().phase") == "aim": drag(pg, s["x"], s["y"], s["x"] - 150, s["y"] + 62, n=20, hold=350); nxt = 99
            elif drive == "ferry" and t >= nxt:
                pg.evaluate(FERRY_TAP); nxt = t + 0.8
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
