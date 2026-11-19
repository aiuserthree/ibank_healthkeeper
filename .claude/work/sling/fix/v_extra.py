#!/usr/bin/python3
"""검증 ㉮ 덧 — 꿀폭탄 · 큰곰 강화 효과, 두목 체력 깎임, 쉬는 걸음이 결과를 바꾸는 까닭"""
import json,pathlib
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:19161';ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
HERE=pathlib.Path(__file__).resolve().parent
SEQ={int(k):v['seq'] for k,v in json.loads((HERE/'out_reach'/'solve_result.json').read_text()).items()}
out={}
with sync_playwright() as P:
    b=P.chromium.launch(args=ARGS);pg=b.new_page(viewport={'width':640,'height':360})
    pg.goto(BASE+'/games/embed/slingfort.html?test=1');pg.wait_for_function('window.SF');pg.evaluate('SF.fxOff(true)')
    def run(L,seq,up):
        pg.evaluate(f'SF.setUp({json.dumps(up)})')
        return pg.evaluate('([l,s])=>{const r=SF.playSeq(l,s);return {ev:SF.events(),st:SF.state()}}',[L,seq])
    for name,L,seq in (('bomb',8,SEQ[8][:2]),('bomb',2,SEQ[2][:2]+[[0,.6,60]]),('giant',9,SEQ[9][:2]),('giant',3,SEQ[3][:2])):
        for up in ({},{name:3}):
            r=run(L,seq,up);e=r['ev']
            out.setdefault(f'{name}-L{L}',[]).append({'up':up,'boom':[x for x in e if x[0]=='boom'],'pierce':[x for x in e if x[0]=='pierce'][-1:] ,'chargeEnd':[x for x in e if x[0]=='chargeEnd'],'broken':r['st']['broken'],'down':r['st']['enemiesDown']})
    pg.evaluate('SF.setUp(null)')
    # 두목: 10단계 첫 발 동안 두목 체력
    pg.evaluate("SF.load(10,{hold:true})");s=SEQ[10][0];pg.evaluate(f'SF.shoot({s[0]},{s[1]},null)')
    hp=[]
    for i in range(500):
        st=pg.evaluate('(()=>{SF.step(1);return document.getElementById("bossbar").hidden?-1:document.querySelectorAll("#bossbar .hp.on").length})()')
        if not hp or hp[-1][1]!=st:hp.append((i,st))
    out['boss10_hp_timeline']=hp
    # 쉬는 걸음: 1단계 처음 판에서 깨어 있는 몸 · 해시
    for idle in (0,40,100,150,200,300):
        pg.evaluate("SF.load(1,{hold:true})");st=pg.evaluate(f'SF.step({idle})')
        mv=pg.evaluate('SF.moving()')
        r=pg.evaluate('([s])=>{SF.shoot(s[0],s[1],s[2]);return SF.runShot(16)}',[SEQ[1][0]])
        out.setdefault('idle1',[]).append({'idle':idle,'hashBefore':st['hash'],'awake':len(mv),'after':r['hash'],'down':r['enemiesDown'],'phase':r['phase']})
    b.close()
(HERE/'extra.json').write_text(json.dumps(out,ensure_ascii=False,indent=1));print(json.dumps(out,ensure_ascii=False))
