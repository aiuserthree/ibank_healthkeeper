#!/usr/bin/python3
"""검증 ㉯ 아케이드 붙임 — 틀 화면 /games/slingfort.html 을 정적 서버로 열고 /api/** 를 가짜 응답으로(앱 · 서버 안 띄움).
· 창 크기(와이드), 신호 순서(hk:* 양쪽), 점수 제출 요청, 진행 저장 PUT 몸(나중에 check_slingfort_state 로 검사), 서버 값 · 기기 값 합치기, MGMT_STALE, 비로그인
· /arcade.html 목록(백엔드 list_games 로 만든 games.json)에서 맨 위인지
결과 arcade.json · mgmt_puts.json · cap/arcade-*.jpg"""
import json, pathlib, datetime, copy
from playwright.sync_api import sync_playwright
H=pathlib.Path(__file__).resolve().parent;OUT=H/'cap';BASE='http://127.0.0.1:19161'
SOL={int(k):v for k,v in json.loads((H.parent/'tools'/'solve_result.json').read_text()).items()}
GAMES=(H/'games.json').read_text();MORE=json.loads((H/'more.json').read_text())  # 실제 백엔드 함수(빈 DB)로 만든 응답
NOW=lambda:datetime.datetime.now().astimezone().isoformat(timespec='seconds')
TOP_INIT=r"""if(window.top===window){window.__hk=[];addEventListener('message',e=>{const d=e.data;if(d&&typeof d.type==='string'&&d.type.startsWith('hk:'))window.__hk.push({t:Math.round(performance.now()),dir:'game→hk',...d})},true);
 const pm=window.postMessage;}
else{window.__in=[];addEventListener('message',e=>{const d=e.data;if(e.source===window.parent&&d&&typeof d.type==='string')window.__in.push({t:Math.round(performance.now()),dir:'hk→game',...d})},true)}"""
class Fake:
    def __init__(s,mgmt_state=None,logged=True,stale_once=None):
        s.log=[];s.puts=[];s.ver=1 if mgmt_state is not None else 0;s.state=mgmt_state;s.logged=logged;s.stale=stale_once;s.unknown=[]
    def __call__(s,route):
        r=route.request;path=r.url.split('/api',1)[1];m=r.method;body=None
        try:body=r.post_data_json
        except Exception:body=r.post_data
        s.log.append({'m':m,'path':path,'body':body})
        J=lambda d,st=200:route.fulfill(status=st,content_type='application/json',body=json.dumps(d,ensure_ascii=False))
        if not s.logged and path.startswith('/me/profile'):return J({'error':{'code':'UNAUTHORIZED'}},401)
        if path.startswith('/me/profile'):return J({'data':{'id':1,'name':'시험회원','totalUses':3,'avatarUrl':None}})
        if path.startswith('/play/status'):return J({'data':{'open':True,'opensAt':None}})
        if path.startswith('/play/games'):return route.fulfill(status=200,content_type='application/json',body=GAMES)
        if path.startswith('/play/stamps'):return J({'data':MORE['stamps']})
        if path.startswith('/play/weekly'):return J({'data':MORE['weekly']})
        if path.startswith('/play/slingfort/leaderboard'):return J({'data':MORE['leaderboard']})
        if path.startswith('/play/slingfort/run'):return J({'data':{'ok':True}})
        if path.startswith('/play/slingfort/score'):return J({'data':{'counted':True,'score':body.get('score'),'best':body.get('score'),'newBest':True,'todayRank':1,'stamp':None}})
        if path=='/play/mgmt/slingfort' and m=='GET':
            if not s.logged:return J({'error':{'code':'UNAUTHORIZED'}},401)
            return J({'data':{'state':s.state,'version':s.ver,'resets':0,'savedAt':NOW() if s.state else None,'now':NOW()}})
        if path=='/play/mgmt/slingfort' and m=='PUT':
            s.puts.append(copy.deepcopy(body))
            if s.stale is not None:
                fresh=s.stale;s.stale=None;s.state=fresh;s.ver+=5
                return J({'error':{'code':'MGMT_STALE','message':'stale'}},409)
            if body.get('version')!=s.ver:return J({'error':{'code':'MGMT_STALE'}},409)
            s.state=body['state'];s.ver+=1
            return J({'data':{'state':s.state,'version':s.ver,'resets':0,'savedAt':NOW(),'now':NOW()}})
        s.unknown.append(f'{m} {path}')
        return J({'error':{'code':'NOT_FOUND'}},404)
def gframe(pg):
    for f in pg.frames:
        if 'embed/slingfort' in f.url:return f
def open_game(b,fake,vp=(1920,1080),mobile=False,local=None):
    ctx=b.new_context(viewport={'width':vp[0],'height':vp[1]},is_mobile=mobile,has_touch=mobile,device_scale_factor=2 if mobile else 1)
    if local is not None:ctx.add_init_script(f"try{{if(!localStorage.getItem('__seeded')){{localStorage.setItem('slingfort.save.v1',{json.dumps(json.dumps(local))});localStorage.setItem('__seeded','1')}}}}catch(e){{}}")
    ctx.add_init_script(TOP_INIT)
    pg=ctx.new_page();errs=[]
    pg.on('pageerror',lambda e:errs.append('pageerror: '+str(e)))
    pg.on('console',lambda m:m.type=='error' and errs.append('console: '+m.text+' @'+(m.location or {}).get('url','')[-40:]))
    pg.route('**/api/**',fake)
    pg.goto(BASE+'/games/slingfort.html')
    pg.wait_for_function("window.__hk&&window.__hk.some(m=>m.type==='hk:ready')",timeout=60000)
    f=gframe(pg);f.wait_for_function("typeof ui!=='undefined'&&ui.cur==='title'",timeout=30000)
    pg.wait_for_timeout(2500)  # Sync.init · 첫 PUT
    return ctx,pg,f,errs
def play(f,L,seq):
    for c in seq:
        f.wait_for_function("game.phase==='aim'&&game.aimReadyT>=1||game.phase==='win'||game.phase==='lose'",timeout=60000)
        if f.evaluate('game.phase')!='aim':break
        f.evaluate(f'shoot({c[0]}*DEG,{c[1]},{json.dumps(c[2])})');f.wait_for_timeout(150)
        f.wait_for_function("game.phase!=='flight'&&game.phase!=='settle'",timeout=90000,polling=50)
    f.wait_for_timeout(1300)
res={}
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'])
    # ── 1. 처음 회원(서버 빈 값 · 기기 빈 값) 1920×1080: 창 크기 · 신호 · 점수 · 저장
    fk=Fake();ctx,pg,f,errs=open_game(b,fk)
    geo=pg.evaluate("""(()=>{const m=document.getElementById('hk-pf-main'),fr=document.querySelector('.hk-play-frame'),i=document.querySelector('iframe.hk-embed__frame');const r=e=>{const x=e.getBoundingClientRect();return [Math.round(x.left),Math.round(x.top),Math.round(x.width),Math.round(x.height)]};
      const cs=getComputedStyle(m);return {main:r(m),mainPad:[cs.paddingLeft,cs.paddingRight],frame:r(fr),iframe:r(i),sandbox:i.getAttribute('sandbox'),docScrollX:document.documentElement.scrollWidth>innerWidth}})()""")
    pg.screenshot(path=str(OUT/'arcade-1920-title.jpg'),type='jpeg',quality=75)
    f.click('[data-a=start]');f.wait_for_timeout(400);f.click('[data-a=play]')
    f.wait_for_function("game.phase==='aim'&&game.aimReadyT>=1",timeout=30000);lvl1=f.evaluate('game.level.id')
    play(f,1,SOL[1]['seq'])
    r1={'phase':f.evaluate('game.phase'),'ui':f.evaluate('ui.cur'),'best':f.evaluate('SAVE.get().best'),'score':f.evaluate('SAVE.score()')}
    pg.wait_for_timeout(1500);pg.screenshot(path=str(OUT/'arcade-1920-result1.jpg'),type='jpeg',quality=75)
    # 순위표가 열렸으면 닫기
    pg.evaluate("document.querySelector('.hk-pf__scrim')?.click()");pg.wait_for_timeout(300)
    f.click('[data-a=next]');f.wait_for_function("game.phase==='aim'&&game.aimReadyT>=1",timeout=30000)
    # Esc 두 번(멈춤 → 이어 하기)
    f.locator('canvas').first.click(position={'x':900,'y':80});pg.wait_for_timeout(150)  # 창 안에 초점(쏘지 않을 자리)
    f.press('body','Escape');pg.wait_for_timeout(500);paused1=f.evaluate("ui.cur");pg.screenshot(path=str(OUT/'arcade-1920-esc-pause.jpg'),type='jpeg',quality=75)
    f.press('body','Escape');pg.wait_for_timeout(500);paused2=f.evaluate("ui.cur")
    # 2단계 지기(아무렇게나)
    play(f,2,[(-15,.35,None)]*8)
    r2={'phase':f.evaluate('game.phase'),'score':f.evaluate('SAVE.score()')}
    pg.wait_for_timeout(1000)
    # 부모가 hk:restart → 첫 화면
    pg.evaluate("document.querySelector('iframe.hk-embed__frame').contentWindow.postMessage({type:'hk:restart'},location.origin)");pg.wait_for_timeout(400)
    afterRestart=f.evaluate('ui.cur')
    pg.wait_for_timeout(3000)  # dirty 2초 뒤 저장
    res['s1']={'geo':geo,'firstLevel':lvl1,'r1':r1,'r2':r2,'escPause':paused1,'escResume':paused2,'afterRestart':afterRestart,
      'toHK':pg.evaluate('window.__hk'),'toGame':f.evaluate('window.__in'),'api':[(x['m'],x['path'],x['body'] if 'score' in x['path'] else None) for x in fk.log if 'mgmt' not in x['path']],
      'mgmtCalls':[(x['m'],x['path'],(x['body'] or {}).get('version') if isinstance(x['body'],dict) else None) for x in fk.log if 'mgmt' in x['path']],'unknownApi':fk.unknown,'errors':errs}
    puts={'s1':fk.puts};ctx.close()
    # ── 2. 합치기: 서버 값 있음 + 이 기기 값(srv 없음 = 처음 붙음)
    S={'v':1,'gold':500,'unlocked':4,'last':4,'stars':{'1':3,'2':2,'3':1},'best':{'1':300,'2':400,'3':200},'cleared':{'1':True,'2':True,'3':True},'up':{'bomb':1,'shield':0,'giant':0,'horn':0},'music':False,'sfx':True}
    Lc={'v':1,'gold':800,'unlocked':2,'last':2,'stars':{'1':2},'best':{'1':350},'cleared':{'1':True},'up':{'bomb':0,'shield':0,'giant':2,'horn':0},'music':True,'sfx':False}
    fk=Fake(mgmt_state=S);ctx,pg,f,errs=open_game(b,fk,local=Lc)
    res['s2_merge']={'after':f.evaluate('SAVE.pure()'),'srvFlag':f.evaluate('SAVE.get().srv'),'firstPut':fk.puts[0]['state'] if fk.puts else None,'puts':len(fk.puts),'titleScore':f.evaluate("document.querySelector('.tbest b')?.textContent"),'errors':errs}
    puts['s2']=fk.puts;ctx.close()
    # ── 3. 이 기기가 이미 서버와 붙은 적 있음(srv:true) → 서버 값을 따름(소리는 기기)
    Lc3=dict(Lc,srv=True)
    fk=Fake(mgmt_state=S);ctx,pg,f,errs=open_game(b,fk,local=Lc3)
    res['s3_srv']={'after':f.evaluate('SAVE.pure()'),'errors':errs};puts['s3']=fk.puts;ctx.close()
    # ── 4. 서버 처음(state null) + 기기 진행 있음 → 기기 값을 올림
    fk=Fake(mgmt_state=None);ctx,pg,f,errs=open_game(b,fk,local=Lc)
    res['s4_new']={'after':f.evaluate('SAVE.pure()'),'firstPut':fk.puts[0] if fk.puts else None,'errors':errs};puts['s4']=fk.puts;ctx.close()
    # ── 5. MGMT_STALE: 첫 PUT 이 409 → 다시 받아 onStale(adopt)
    F={'v':1,'gold':4321,'unlocked':7,'last':7,'stars':{'1':3,'2':3,'3':3,'4':3,'5':3,'6':2},'best':{'1':500,'2':500,'3':500,'4':500,'5':900,'6':700},'cleared':{'1':True,'2':True,'3':True,'4':True,'5':True,'6':True},'up':{'bomb':3,'shield':3,'giant':3,'horn':2},'music':True,'sfx':True}
    fk=Fake(mgmt_state=S,stale_once=F);ctx,pg,f,errs=open_game(b,fk,local=Lc3)
    pg.wait_for_timeout(1500)
    res['s5_stale']={'after':f.evaluate('SAVE.pure()'),'ui':f.evaluate('ui.cur'),'titleGold':f.evaluate("document.querySelector('.tpills .pillg')?.textContent"),'calls':[(x['m'],x['path']) for x in fk.log if 'mgmt' in x['path']],'errors':errs}
    puts['s5']=fk.puts;ctx.close()
    # ── 6. 비로그인(프로필 401 → 틀은 로그인으로 보냄) — 본체만 혼자 열어 mgmt 401 일 때 도는지
    fk=Fake(logged=False);ctx=b.new_context(viewport={'width':1280,'height':720});pg=ctx.new_page();errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.route('**/api/**',fk)
    pg.goto(BASE+'/games/slingfort.html');pg.wait_for_timeout(2500);wrapperUrl=pg.url
    pg.goto(BASE+'/games/embed/slingfort.html');pg.wait_for_function("ui.cur==='title'");pg.wait_for_timeout(1500)
    pg.click('[data-a=start]');pg.click('[data-a=play]');pg.wait_for_function("game.phase==='aim'&&game.aimReadyT>=1")
    play(pg,1,SOL[1]['seq'])
    res['s6_anon']={'wrapperRedirect':wrapperUrl,'phase':pg.evaluate('game.phase'),'local':pg.evaluate("JSON.parse(localStorage.getItem('slingfort.save.v1')).best"),'syncOn':pg.evaluate('Sync.on'),'errors':errs}
    ctx.close()
    # ── 7. 창 크기: 1280×720 · 1366×768 · 휴대폰 가로 844×390 · 세로 390×844
    res['sizes']={}
    for name,vp,mob in [('1280x720',(1280,720),0),('1366x768',(1366,768),0),('2560x1080',(2560,1080),0),('phone-land',(844,390),1),('phone-port',(390,844),1)]:
        fk=Fake();ctx,pg,f,errs=open_game(b,fk,vp,bool(mob))
        g=pg.evaluate("""(()=>{const m=document.getElementById('hk-pf-main'),fr=document.querySelector('.hk-play-frame'),i=document.querySelector('iframe.hk-embed__frame');const r=e=>{const x=e.getBoundingClientRect();return [Math.round(x.left),Math.round(x.top),Math.round(x.width),Math.round(x.height)]};
          return {main:r(m),frame:r(fr),iframe:r(i),pageScroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight,innerWidth,innerHeight]}})()""")
        g['gameStage']=f.evaluate("(()=>{const s=document.getElementById('stage').getBoundingClientRect();return [Math.round(s.left),Math.round(s.top),Math.round(s.width),Math.round(s.height),getComputedStyle(document.documentElement).getPropertyValue('--u')]})()")
        g['minTap']=f.evaluate("Math.round(Math.min(...[...document.querySelectorAll('#ov [data-a]')].map(e=>{const r=e.getBoundingClientRect();return Math.min(r.width,r.height)}).filter(x=>x>0)))")
        pg.screenshot(path=str(OUT/f'arcade-{name}-title.jpg'),type='jpeg',quality=75)
        f.click('[data-a=start]');f.wait_for_timeout(400);pg.screenshot(path=str(OUT/f'arcade-{name}-map.jpg'),type='jpeg',quality=75)
        g['errors']=errs;res['sizes'][name]=g;ctx.close()
    # ── 8. /arcade.html 목록
    fk=Fake();ctx=b.new_context(viewport={'width':1440,'height':900});pg=ctx.new_page();errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.route('**/api/**',fk)
    pg.goto(BASE+'/arcade.html');pg.wait_for_timeout(3500)
    order=pg.evaluate("""(()=>{const keys=[...document.querySelectorAll('a[href^="/games/"]')].map(a=>a.getAttribute('href').replace(/^\\/games\\//,'').replace(/\\.html.*$/,''));const seen=[];keys.forEach(k=>{if(!seen.includes(k))seen.push(k)});
      const tile=document.querySelector('a[href^="/games/slingfort"]');return {firstKeys:seen.slice(0,6),sling:tile?{text:tile.textContent.replace(/\\s+/g,' ').trim().slice(0,90),img:(tile.querySelector('img')||{}).src||null}:null}})()""")
    newSec=pg.evaluate("""(()=>{const n=[...document.querySelectorAll('.is-new')].map(e=>e.closest('a')?.getAttribute('href')).filter(Boolean);return n.slice(0,6)})()""")
    pg.screenshot(path=str(OUT/'arcade-list.jpg'),type='jpeg',quality=70,full_page=False)
    tile=pg.locator('a[href^="/games/slingfort"]').first
    if tile.count():tile.scroll_into_view_if_needed();pg.wait_for_timeout(500);pg.screenshot(path=str(OUT/'arcade-list-tile.jpg'),type='jpeg',quality=70)
    res['arcadeList']={'order':order,'newBadges':newSec,'unknownApi':sorted(set(fk.unknown)),'errors':errs};ctx.close()
    b.close()
(H/'arcade.json').write_text(json.dumps(res,ensure_ascii=False,indent=1))
(H/'mgmt_puts.json').write_text(json.dumps(puts,ensure_ascii=False,indent=1))
print(json.dumps({k:v for k,v in res.items() if k!='s1'},ensure_ascii=False,indent=1)[:6000])
s1=res['s1'];print('S1',json.dumps({k:v for k,v in s1.items() if k not in('toHK','toGame')},ensure_ascii=False)[:3000])
print('toHK',[(m['t'],m['type'],m.get('score')) for m in s1['toHK']])
print('toGame',[(m['t'],m['type']) for m in s1['toGame']])
