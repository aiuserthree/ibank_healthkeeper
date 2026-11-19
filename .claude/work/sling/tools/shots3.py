#!/usr/bin/python3
"""곰돌이 새총 원정대 3단계 확인 — 화면 크기 넷(1280×720 · 1920×1080 · 가로 휴대폰 844×390 · 세로 휴대폰 390×844)마다
첫 화면 · 놀이(조준 · 날아감) · 곰 마을 · 지도 · 결과 캡처, 페이지 오류, 처음 화면까지 받은 바이트, 떠오르는 글씨 수 상한, 아케이드 신호(hk:*)
쓰는 법: /usr/bin/python3 .claude/work/sling/tools/shots3.py [캡처 폴더]   (워크트리 web/ 를 19132 로 스스로 띄운다)
결과: <폴더>/s3-*.png · <폴더>/s3-result.json"""
import sys, json, pathlib, threading, functools, http.server
from playwright.sync_api import sync_playwright
T=pathlib.Path(__file__).resolve().parent;ROOT=T.parents[3];WEB=ROOT/'web'
OUT=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else T.parent/'shots';OUT.mkdir(parents=True,exist_ok=True)
SOL={int(k):v for k,v in json.loads((T/'solve_result.json').read_text()).items()}
PORT=19132;BASE=f'http://127.0.0.1:{PORT}';URL=BASE+'/games/embed/slingfort.html'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
http.server.ThreadingHTTPServer.request_queue_size=128
srv=http.server.ThreadingHTTPServer(('127.0.0.1',PORT),functools.partial(H,directory=str(WEB)))
threading.Thread(target=srv.serve_forever,daemon=True).start()
SIZES={'1280':(1280,720),'1920':(1920,1080),'land':(844,390),'port':(390,844)}
res={'errors':{},'bytes':{},'texts':{},'hk':None}
def newpage(b,vp,q='?test=1',mobile=False):
    ctx=b.new_context(viewport={'width':vp[0],'height':vp[1]},is_mobile=mobile,has_touch=mobile,device_scale_factor=1)
    pg=ctx.new_page();errs=[]
    pg.on('pageerror',lambda e:errs.append('pageerror: '+str(e)))
    pg.on('console',lambda m:m.type=='error' and 'Failed to load resource' not in m.text and errs.append('console: '+m.text))
    pg.on('requestfailed',lambda r:errs.append('requestfailed: '+r.url+' '+str(r.failure)))
    bad=[];pg.on('response',lambda r:r.status>=400 and '/api/' not in r.url and bad.append(f'{r.status} {r.url}'))
    pg.goto(URL+q)
    if 'test' in q:pg.wait_for_function('window.SF',timeout=60000)
    return ctx,pg,errs,bad
def snap(pg,name,wait=400):pg.wait_for_timeout(wait);pg.screenshot(path=str(OUT/name))
def shoot(pg,c):pg.evaluate(f'SF.shoot({c[0]},{c[1]},{json.dumps(c[2])})')
def wait_art(pg):pg.wait_for_function("(()=>{const a=SF.art();return ['title','map','bear','coon','up_bomb','tex_wood','bg_forest','bg_marsh','bg_castle'].every(k=>a[k]===true)})()",timeout=30000)
with sync_playwright() as p:
    b=p.chromium.launch(args=ARGS)
    # 1) 처음 화면까지 받는 바이트(주소 없이 연 첫 화면) — 그림 나머지는 첫 화면 그림을 받은 뒤 이어 받는다
    ctx=b.new_context(viewport={'width':1280,'height':720});pg=ctx.new_page();sizes={}
    def onresp(r):
        try:
            if r.status<400:sizes[r.url.replace(BASE,'')]=len(r.body())
        except Exception:pass
    pg.on('response',onresp);pg.goto(URL);pg.wait_for_timeout(5000)
    first={k:v for k,v in sizes.items() if not k.startswith('/assets/games/slingfort/') or k.endswith('/title.webp')}
    res['bytes']={'firstScreen':sum(first.values()),'firstFiles':first,'allArt':sum(v for k,v in sizes.items() if k.startswith('/assets/games/slingfort/')),'all':sum(sizes.values())}
    ctx.close()
    for key,vp in SIZES.items():
        mob=key in('land','port')
        ctx,pg,errs,bad=newpage(b,vp,mobile=mob);wait_art(pg)
        pg.evaluate('SF.show("title")');snap(pg,f's3-{key}-title.png',700)
        pg.evaluate('SF.setSave({v:1,gold:520,unlocked:6,last:6,stars:{1:3,2:3,3:2,4:1,5:2},best:{1:520,2:610,3:480,4:700,5:900},cleared:{1:true,2:true,3:true,4:true,5:true},up:{bomb:1,shield:0,giant:2,horn:1},music:true,sfx:true})')
        pg.evaluate('SF.show("village","title")');snap(pg,f's3-{key}-village.png')
        pg.evaluate('SF.show("map",6)');snap(pg,f's3-{key}-map.png')
        pg.evaluate('SF.show("title")');snap(pg,f's3-{key}-title2.png')
        # 놀이: 6단계(늪 배경) 조준 → 날아감
        L=6;pg.evaluate(f'SF.load({L},{{hold:true}})');pg.evaluate('SF.camTo("aim")');pg.evaluate('SF.aimPreview(-4,.62)');snap(pg,f's3-{key}-aim.png',900)
        pg.evaluate('SF.load(10,{hold:true})');snap(pg,f's3-{key}-aim10.png',900)
        s=SOL[1]['seq'];pg.evaluate('SF.load(1,{hold:true})');shoot(pg,s[0]);pg.evaluate('SF.step(40)');snap(pg,f's3-{key}-flight.png',300)
        pg.evaluate('SF.step(200)');snap(pg,f's3-{key}-impact.png',300)
        pg.evaluate('SF.runShot(15)');snap(pg,f's3-{key}-result.png',700)
        res['errors'][key]=errs+bad;ctx.close()
    # 2) 큰 무너짐 때 같은 때 떠오르는 글씨 수(10단계 이기는 순서, 걸음마다 셈) — 상한 6
    ctx,pg,errs,bad=newpage(b,(1280,720));wait_art(pg)
    s=SOL[10]['seq'];pg.evaluate('SF.load(10,{hold:true})');mx=0
    for c in s:
        shoot(pg,c)
        for i in range(500):
            st=pg.evaluate('SF.step(1)');n=pg.evaluate('(SF.fxTick(1/60),SF.textCount())');mx=max(mx,n)
            if st['phase'] not in('flight','settle'):break
    res['texts']={'level10_max_simultaneous':mx};snap(pg,'s3-1280-boss-result.png',600)
    # 지는 결과 · 두목 단계 시작 띠(아래 오른쪽) · 멈춤
    pg.evaluate('SF.load(5,{hold:false,skipIntro:false})');snap(pg,'s3-1280-boss5-intro.png',1200)
    pg.evaluate('SF.load(2,{hold:true})')
    for c in [(-15,.35,None)]*4:shoot(pg,c);pg.evaluate('SF.runShot(15)')
    snap(pg,'s3-1280-lose.png',700)
    pg.evaluate('SF.load(3,{hold:true})');pg.evaluate('SF.show("pause")');snap(pg,'s3-1280-pause.png')
    res['errors']['extra']=errs+bad;ctx.close()
    # 3) 아케이드 신호: 같은 주소의 시험 틀 안에 ?hk=1 로 띄워 주고받기
    ctx=b.new_context(viewport={'width':1280,'height':720});pg=ctx.new_page()
    pg.route('**/__hk_harness.html',lambda r:r.fulfill(content_type='text/html',body='''<!doctype html><meta charset=utf-8><body style="margin:0">
<iframe id=f src="/games/embed/slingfort.html?hk=1&test=1" style="width:1280px;height:720px;border:0"></iframe>
<script>window.got=[];addEventListener('message',e=>{if(e.origin===location.origin)got.push(e.data)});</script>'''))
    pg.goto(BASE+'/__hk_harness.html');pg.wait_for_function("got.some(m=>m.type==='hk:ready')",timeout=60000)
    fr=pg.frame_locator('#f');f=pg.frames[1]
    f.wait_for_function('window.SF');f.evaluate('SF.show("title")')
    fr.locator('[data-a=start]').click();pg.wait_for_timeout(300);fr.locator('[data-a=play]').click();pg.wait_for_timeout(500)
    pg.evaluate("document.getElementById('f').contentWindow.postMessage({type:'hk:pause'},location.origin)");pg.wait_for_timeout(300)
    pausedUi=f.evaluate('document.querySelector(".card.pz")!==null')
    pg.evaluate("document.getElementById('f').contentWindow.postMessage({type:'hk:resume'},location.origin)");pg.wait_for_timeout(300)
    f.evaluate(f'SF.playSeq(1,{json.dumps(SOL[1]["seq"])},true)');pg.wait_for_timeout(500)
    got=pg.evaluate('got');res['hk']={'types':[m['type'] for m in got],'scores':[m.get('score') for m in got if m['type'] in('hk:score','hk:live')],'pauseCard':pausedUi}
    ctx.close();b.close()
srv.shutdown()
(OUT/'s3-result.json').write_text(json.dumps(res,ensure_ascii=False,indent=1))
print(json.dumps({k:(v if k!='bytes' else {kk:vv for kk,vv in v.items() if kk!='firstFiles'}) for k,v in res.items()},ensure_ascii=False,indent=1))
