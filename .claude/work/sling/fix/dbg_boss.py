#!/usr/bin/python3
"""두목 단계(5 · 10): 찾은 순서 그대로 · 흔들어서 몇 판 — 두목 체력이 무엇에 깎였는지(bossHit 사건)"""
import json,random,pathlib,sys
from playwright.sync_api import sync_playwright
H=pathlib.Path(__file__).resolve().parent
SEQ={int(k):v['seq'] for k,v in json.loads((H/'out_reach'/'solve_result.json').read_text()).items()}
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']);pg=b.new_page(viewport={'width':640,'height':360})
    pg.goto('http://127.0.0.1:19161/games/embed/slingfort.html?test=1');pg.wait_for_function('window.SF');pg.evaluate('SF.fxOff(true)')
    for L in (5,10):
        r=pg.evaluate('([l,s])=>{const r=SF.playSeq(l,s);return {ev:SF.events().filter(e=>e[0]==="bossHit"||e[0]==="boom"),ph:r.phase}}',[L,SEQ[L]])
        print(L,'solve',r['ph'],[e for e in r['ev'] if e[0]=='bossHit'])
        rng=random.Random(L)
        for k in range(6):
            pg.evaluate(f'SF.load({L},{{hold:true}})');hits=[]
            for i,(y,pw,t) in enumerate(SEQ[L]):
                y2=y+rng.uniform(-2,2);p2=max(pw*(1+rng.uniform(-.05,.05)),abs(y2)/24);t2=None if t is None else t+rng.randint(-6,6)
                pg.evaluate(f'SF.step({rng.randint(30,150)})');pg.evaluate(f'SF.shoot({y2},{p2},{json.dumps(t2)})');pg.evaluate('SF.runShot(16)')
            ev=pg.evaluate('SF.events()');print('  noisy',k,[e for e in ev if e[0]=='bossHit'],'boom',[e[4] for e in ev if e[0]=='boom'])
    b.close()
