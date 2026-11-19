#!/usr/bin/python3
"""가로 휴대폰 844×390 아케이드 창(/games/slingfort.html, /api 는 가짜) 안에서 중요한 단추가 화면 안에 다 보이는지 · 크기(px) · 캡처.
화면: 첫 화면 · 곰 마을 · 지도 · 조준(용사 줄) · 멈춤 · 결과(이김 · 짐). 지도에서 고른 동그라미를 한 번 더 누르면 바로 시작하는지도.
'alone' 은 같은 크기에서 게임 쪽만 연 것. 결과 phone.json · cap/phone-*.jpg"""
import sys,json,pathlib
sys.argv=['x'];exec(open(pathlib.Path(__file__).with_name('v_arcade.py')).read().split('res={}')[0])
OUT=pathlib.Path(__file__).resolve().parent/'cap';OUT.mkdir(exist_ok=True)
SEL={'title':'[data-a=start],[data-a=village],.tsnd [data-a]','village':'.price,[data-a=map],[data-a=vback]','map':'[data-a=play],[data-a=village],[data-a=home],.node.sel',
     'aim':'#pauseBtn,.slot','pause':'#ov [data-a]','win':'#ov [data-a]','lose':'#ov [data-a]'}
JS="""(sel)=>{const fr=window!==parent?parent.document.querySelector('iframe.hk-embed__frame'):null;const o=fr?fr.getBoundingClientRect():{left:0,top:0};const vh=fr?parent.innerHeight:innerHeight;
 return [...document.querySelectorAll(sel)].map(e=>{const r=e.getBoundingClientRect();return {k:(e.dataset.a||e.id||e.className).slice(0,14),top:Math.round(o.top+r.top),bottom:Math.round(o.top+r.bottom),w:Math.round(r.width),h:Math.round(r.height),inView:o.top+r.bottom<=vh-2,vh}})}"""
res={}
with sync_playwright() as p:
    b=p.chromium.launch()
    for mode in ('arcade','alone'):
        ctx=b.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=2);pg=ctx.new_page();errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)));pg.route('**/api/**',Fake())
        if mode=='arcade':
            pg.goto(BASE+'/games/slingfort.html');f=None
            for _ in range(100):
                f=next((x for x in pg.frames if 'embed/slingfort' in x.url),None)
                if f:break
                pg.wait_for_timeout(200)
        else:
            pg.goto(BASE+'/games/embed/slingfort.html');f=pg.main_frame
        f.wait_for_function("typeof ui!=='undefined'&&ui.cur==='title'",timeout=60000);pg.wait_for_timeout(2500)
        R={'short':f.evaluate("document.documentElement.classList.contains('short')"),'stage':f.evaluate("[view.w,view.h,view.sb,view.u]")}
        def shot(name):
            R[name]=f.evaluate(JS,SEL[name]);pg.screenshot(path=str(OUT/f'phone-{mode}-{name}.jpg'),type='jpeg',quality=72)
        shot('title')
        f.evaluate("ui.village('title')");pg.wait_for_timeout(300);shot('village')
        f.evaluate("SAVE.get().unlocked=3;ui.map(2)");pg.wait_for_timeout(400);shot('map')
        f.click('.node.sel');pg.wait_for_timeout(500);R['reTapStarts']=f.evaluate("ui.cur===null&&game.level.id===2")
        f.wait_for_function("game.phase==='aim'&&game.aimReadyT>=1",timeout=30000);pg.wait_for_timeout(300);shot('aim')
        f.evaluate("openPause()");pg.wait_for_timeout(300);shot('pause');f.evaluate("closePause()")
        f.evaluate("game.result={win:true,gold:120,left:2,stars:3};game.phase='win';onResult()");pg.wait_for_timeout(1400);shot('win')
        f.evaluate("game.result={win:false,gold:40,enemies:2};game.phase='lose';onResult()");pg.wait_for_timeout(1400);shot('lose')
        R['errors']=errs;res[mode]=R;ctx.close()
    b.close()
(pathlib.Path(__file__).with_name('phone.json')).write_text(json.dumps(res,ensure_ascii=False,indent=1))
for m,R in res.items():
    print(m,'short',R['short'],'stage',R['stage'],'reTap',R['reTapStarts'],'errors',R['errors'][:3])
    for k in SEL:
        L=R[k];print(' ',k,'모두 보임' if all(x['inView'] for x in L) else '가려짐 '+str([x['k'] for x in L if not x['inView']]),'최소 높이',min([x['h'] for x in L] or [0]),'최소 폭',min([x['w'] for x in L] or [0]),'가장 아래',max([x['bottom'] for x in L] or [0]),'/',L[0]['vh'] if L else '')
