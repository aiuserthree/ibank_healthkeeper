#!/usr/bin/python3
"""곰돌이 새총 원정대 2단계 캡처 — 꿀폭탄 쾅 · 방패 통 · 큰곰 돌진 · 보스 성 · 늪 · 결과 카드 둘 · 멈춤 · 지도
쓰는 법: (web/ 에서 python3 -m http.server 19131) /usr/bin/python3 .claude/work/sling/tools/shots2.py
쏘기 순서는 tools/solve_result.json(자동 쏘기로 찾은 것)을 쓴다 → shots/s2-*.png"""
import json, pathlib
from playwright.sync_api import sync_playwright
T=pathlib.Path(__file__).resolve().parent;OUT=T.parent/'shots';OUT.mkdir(exist_ok=True)
SOL={int(k):v for k,v in json.loads((T/'solve_result.json').read_text()).items()}
URL='http://127.0.0.1:19131/games/embed/slingfort.html'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
errs=[]
def newpage(b,q='?test=1'):
    pg=b.new_page(viewport={'width':1280,'height':720});pg.on('pageerror',lambda e:errs.append(str(e)));pg.goto(URL+q)
    if 'test' in q:pg.wait_for_function('window.SF',timeout=60000)
    return pg
def play(pg,L,seq):
    for c in seq:pg.evaluate(f'SF.shoot({c[0]},{c[1]},{json.dumps(c[2])})');pg.evaluate('SF.runShot(15)')
def until(pg,kind,maxn=400,extra=0):
    for i in range(maxn):
        pg.evaluate('SF.step(1)')
        if any(e[0]==kind for e in pg.evaluate('SF.events()')):break
    if extra:pg.evaluate(f'SF.step({extra})')
def snap(pg,name,wait=350):pg.wait_for_timeout(wait);pg.screenshot(path=str(OUT/name))
with sync_playwright() as p:
    b=p.chromium.launch(args=ARGS)
    pg=newpage(b)
    # 꿀폭탄 쾅(8단계 얼음 피라미드)
    s=SOL[8]['seq'];pg.evaluate('SF.load(8,{hold:true})');play(pg,8,s[:1]);pg.wait_for_timeout(600)
    c=s[1];pg.evaluate(f'SF.shoot({c[0]},{c[1]},{json.dumps(c[2])})');until(pg,'boom',extra=2);snap(pg,'s2-bomb-boom.png',250)
    # 방패 통(2단계, 방패곰을 일찍 눌러)
    pg.evaluate('SF.load(2,{hold:true})');play(pg,2,SOL[2]['seq'][:1]);pg.wait_for_timeout(600)
    pg.evaluate('SF.shoot(2.5,.6,35)');until(pg,'boing',extra=1);snap(pg,'s2-shield-boing.png',250)
    # 큰곰 돌진(3단계): 누른 바로 뒤 · 뚫는 때
    s=SOL[3]['seq'];pg.evaluate('SF.load(3,{hold:true})');play(pg,3,s[:1]);pg.wait_for_timeout(600)
    c=s[1];pg.evaluate(f'SF.shoot({c[0]},{c[1]},{json.dumps(c[2])})');pg.evaluate(f'SF.step({c[2]-12})');pg.wait_for_timeout(500);snap(pg,'s2-giant-hint.png',100)
    until(pg,'tap',extra=3);snap(pg,'s2-giant-charge.png',200)
    until(pg,'pierce',extra=4);snap(pg,'s2-giant-pierce.png',200)
    pg.evaluate('SF.runShot(15)');pg.wait_for_timeout(300)
    # 이김 결과 카드(3단계 마저)
    play(pg,3,s[2:]);snap(pg,'s2-result-win.png',1200)
    # 짐 결과 카드(4단계, 엉뚱하게 쏨)
    pg.evaluate('SF.load(4,{hold:true})');play(pg,4,[[24,.35,None]]*5);snap(pg,'s2-result-lose.png',1200)
    # 멈춤
    pg.evaluate('SF.load(5,{hold:false})');pg.wait_for_timeout(1200);pg.click('#pauseBtn');snap(pg,'s2-pause.png',400)
    pg.close()
    # 보스 성 · 중간 보스 · 늪 — 단계 시작 띠(실제 놀이 주소)
    for L,name,t in ((10,'s2-boss-castle-intro.png',1500),(5,'s2-boss5-intro.png',1500),(6,'s2-swamp-intro.png',1500)):
        q=newpage(b,f'?level={L}');q.wait_for_timeout(t);q.screenshot(path=str(OUT/name));q.close()
    q=newpage(b);q.evaluate('SF.load(10,{hold:false})');q.wait_for_timeout(1500);q.screenshot(path=str(OUT/'s2-boss-castle-aim.png'))
    # 보스 성을 깨는 장면(마지막 발 무너짐)
    s=SOL[10]['seq'];q.evaluate('SF.load(10,{hold:true})');play(q,10,s[:-1]);q.wait_for_timeout(500);c=s[-1]
    q.evaluate(f'SF.shoot({c[0]},{c[1]},{json.dumps(c[2])})');q.evaluate('SF.step(130)');snap(q,'s2-boss-castle-crumble.png',400)
    # 지도: 1~3단계를 깬 저장으로
    q.evaluate('SF.resetSave()')
    for L in (1,2,3):q.evaluate(f'SF.load({L},{{hold:true}})');play(q,L,SOL[L]['seq'])
    q.goto(URL+'?test=1');q.wait_for_function('window.SF');q.wait_for_timeout(800);q.screenshot(path=str(OUT/'s2-map.png'))
    q.click('.node[data-l="2"]');q.wait_for_timeout(200);q.screenshot(path=str(OUT/'s2-map-pick2.png'))
    print('save',json.dumps(q.evaluate('SF.save()'),ensure_ascii=False))
    q.click('[data-a="village"]');q.wait_for_timeout(300);q.screenshot(path=str(OUT/'s2-village-placeholder.png'))
    q.close()
    # 휴대폰 가로 · 지도
    m=b.new_page(viewport={'width':844,'height':390},has_touch=True);m.goto(URL+'?test=1');m.wait_for_function('window.SF');m.wait_for_timeout(800);m.screenshot(path=str(OUT/'s2-phone-map.png'))
    m.evaluate('SF.load(10,{hold:false})');m.wait_for_timeout(1200);m.screenshot(path=str(OUT/'s2-phone-boss.png'));m.close()
    b.close()
print('errors',errs)
