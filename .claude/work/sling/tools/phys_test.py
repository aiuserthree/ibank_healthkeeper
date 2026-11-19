#!/usr/bin/python3
"""곰돌이 새총 원정대 시험(1단계에 만들고 2단계에서 10단계로 넓힘) — 물리 안정성 · 결정성 · 무너질 때 프레임 시간 · 캡처
쓰는 법: (워크트리 web/ 에서 python3 -m http.server 8791 를 띄운 뒤)
  /usr/bin/python3 .claude/work/sling/tools/phys_test.py [http://127.0.0.1:8791] [캡처 폴더]
"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8791').rstrip('/')
OUT=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else pathlib.Path(__file__).resolve().parents[1]/'shots')
OUT.mkdir(parents=True,exist_ok=True)
URL=BASE+'/games/embed/slingfort.html?test=1'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
LEVELS=list(range(1,11))+['stress']
# 시험 쏘기(기준 방향에서 돌린 각(도) · 힘 0~1)
# 단계마다: 자동 쏘기로 찾은 이기는 순서(tools/solve_result.json) — 특수 곰 누르는 걸음까지 그대로
_SOL=json.loads((pathlib.Path(__file__).resolve().parent/'solve_result.json').read_text())
SHOTS={int(k):[tuple(x) for x in v['seq']] for k,v in _SOL.items() if v.get('win')}
SHOTS['stress']=[(0,.64,None)]
res={}
def page(b,vp=(1280,720)):
    pg=b.new_page(viewport={'width':vp[0],'height':vp[1]})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(URL);pg.wait_for_function('window.SF',timeout=60000);return pg,errs
with sync_playwright() as p:
    b=p.chromium.launch(args=ARGS)
    pg,errs=page(b)
    # (a) 안정성: 쏘지 않고 10초(게임 그대로 = 잠든 채 시작) · 모두 깨운 채 시작(진짜 쌓임 버팀)
    res['a']={}
    for L in LEVELS:
        r={}
        pg.evaluate(f'SF.load({json.dumps(L)},{{hold:true}})');r['game']=pg.evaluate('SF.still(10)')
        pg.evaluate(f'SF.load({json.dumps(L)},{{hold:true,awake:true}})');r['awake']=pg.evaluate('SF.still(10)')
        res['a'][str(L)]=r
    # (b) 결정성: 같은 쏘기를 두 번(같은 쪽 안에서 다시 불러) + 새로 연 쪽에서 한 번
    def play(pgx,L):
        pgx.evaluate(f'SF.load({json.dumps(L)},{{hold:true}})');out=[]
        for yaw,pw,tap in SHOTS[L]:
            st=pgx.evaluate('SF.state()')
            if st['phase']!='aim':break
            pgx.evaluate(f'SF.shoot({yaw},{pw},{json.dumps(tap)})');r=pgx.evaluate('SF.runShot(14)')
            out.append({k:r[k] for k in ('phase','enemiesDown','broken','gold','hash','stepsRun')}|{'msMaxStep':round(r['msMaxStep'],2),'msPerStep':round(r['msTotal']/max(1,r['stepsRun']),3)})
        return out
    res['b']={}
    pg2,errs2=page(b)
    for L in LEVELS:
        r1=play(pg,L);r2=play(pg,L);r3=play(pg2,L)
        strip=lambda rr:[{k:v for k,v in x.items() if not k.startswith('ms')} for x in rr]
        res['b'][str(L)]={'same':strip(r1)==strip(r2)==strip(r3),'run1':r1,'run2_hash':[x['hash'] for x in r2],'run3_hash':[x['hash'] for x in r3]}
    pg2.close()
    # (c) 무너질 때 프레임 시간(실시간으로 돌림 — 큰 벽 100개 쏘고 5초)
    res['c']={}
    for L in ['stress',10,2]:
        pg.evaluate(f'SF.load({json.dumps(L)},{{hold:false}})');pg.wait_for_timeout(800)
        pg.evaluate('SF.resetPerf()');pg.evaluate(f'SF.shoot({SHOTS[L][0][0]},{SHOTS[L][0][1]},{json.dumps(SHOTS[L][0][2])})');pg.wait_for_timeout(5000)
        pf=pg.evaluate('SF.perf()');fr=sorted(pf['frames'][2:]);st=sorted(pf['steps'])
        q=lambda a,x:round(a[min(len(a)-1,int(len(a)*x))],2) if a else None
        res['c'][str(L)]={'frames':len(fr),'frame_ms_p50':q(fr,.5),'frame_ms_p95':q(fr,.95),'frame_ms_max':q(fr,1),'step_ms_p50':q(st,.5),'step_ms_p95':q(st,.95),'step_ms_max':q(st,1),'state':pg.evaluate('SF.state()')}
    # 일부러 늦춘 휴대폰 흉내(CPU 4배 느리게)로 물리 걸음 시간
    cdp=pg.context.new_cdp_session(pg);cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
    pg.evaluate("SF.load('stress',{hold:true})");pg.evaluate('SF.shoot(0,.64)');r=pg.evaluate('SF.runShot(6)')
    res['c']['stress_cpu4x']={'msPerStep':round(r['msTotal']/max(1,r['stepsRun']),3),'msMaxStep':round(r['msMaxStep'],2),'stepsRun':r['stepsRun']}
    pg.evaluate("SF.load(10,{hold:true})");mx=0;tot=0;n=0
    for yaw,pw,tap in SHOTS[10]:
        pg.evaluate(f'SF.shoot({yaw},{pw},{json.dumps(tap)})');r=pg.evaluate('SF.runShot(14)');mx=max(mx,r['msMaxStep']);tot+=r['msTotal'];n+=r['stepsRun']
    res['c']['boss10_cpu4x']={'msPerStep':round(tot/max(1,n),3),'msMaxStep':round(mx,2),'stepsRun':n}
    cdp.send('Emulation.setCPUThrottlingRate',{'rate':1})
    res['errors']=errs+errs2
    pg.close()
    # 실제 그래픽 칩(맥 Metal)으로 그릴 때 프레임 시간 — 되면 재고, 안 되면 건너뜀
    try:
        bg=p.chromium.launch(args=['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'])
        pgg=bg.new_page(viewport={'width':1280,'height':720});pgg.goto(URL);pgg.wait_for_function('window.SF',timeout=60000)
        gpu=pgg.evaluate("(()=>{const c=document.createElement('canvas').getContext('webgl');const d=c&&c.getExtension('WEBGL_debug_renderer_info');return d?c.getParameter(d.UNMASKED_RENDERER_WEBGL):'?'})()")
        for L in ['stress',10]:
            pgg.evaluate(f'SF.load({json.dumps(L)},{{hold:false}})');pgg.wait_for_timeout(800);pgg.evaluate('SF.resetPerf()');pgg.evaluate(f'SF.shoot({SHOTS[L][0][0]},{SHOTS[L][0][1]},{json.dumps(SHOTS[L][0][2])})');pgg.wait_for_timeout(5000)
            fr=sorted(pgg.evaluate('SF.perf()')['frames'][2:]);q=lambda a,x:round(a[min(len(a)-1,int(len(a)*x))],2) if a else None
            res['c']['gpu_'+str(L)]={'renderer':gpu,'frames':len(fr),'frame_ms_p50':q(fr,.5),'frame_ms_p95':q(fr,.95),'frame_ms_max':q(fr,1)}
        bg.close()
    except Exception as e:
        res['c']['gpu']='건너뜀: '+str(e)[:120]
    # 캡처: 조준(실제 마우스 끌기) · 날아감 · 무너짐 — 2단계
    pg,errs=page(b)
    pg.evaluate("SF.load(2,{hold:false})");pg.wait_for_timeout(1500)
    pg.mouse.move(640,420);pg.mouse.down();pg.mouse.move(600,520,steps=6);pg.mouse.move(632,575,steps=6);pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT/'s1-aim.png'))
    pg.mouse.up();pg.wait_for_timeout(900);pg.screenshot(path=str(OUT/'s1-flight.png'))
    pg.wait_for_timeout(1300);pg.screenshot(path=str(OUT/'s1-crumble.png'))
    pg.wait_for_timeout(6000);res['capture_state']=pg.evaluate('SF.state()');pg.screenshot(path=str(OUT/'s1-after.png'))
    # 가로 휴대폰 · 세로 휴대폰 · 단계 시작 훑기
    for name,vp in (('s1-phone-land.png',(844,390)),('s1-phone-port.png',(390,844))):
        pq=b.new_page(viewport={'width':vp[0],'height':vp[1]},has_touch=True);pq.goto(URL);pq.wait_for_function('window.SF');pq.evaluate("SF.load(1,{hold:false})");pq.wait_for_timeout(1500);pq.screenshot(path=str(OUT/name));pq.close()
    pi=b.new_page(viewport={'width':1280,'height':720});pi.goto(BASE+'/games/embed/slingfort.html?level=2');pi.wait_for_timeout(2600);pi.screenshot(path=str(OUT/'s1-intro.png'));pi.close()
    res['errors']+=errs
    b.close()
(OUT/'result.json').write_text(json.dumps(res,ensure_ascii=False,indent=1))
print(json.dumps(res,ensure_ascii=False))
