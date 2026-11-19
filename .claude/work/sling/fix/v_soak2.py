#!/usr/bin/python3
"""검증 ㉯ 오래 두기(실제 놀이 고리 흉내) — 걸음마다 gameStep → syncAll → fx.update 를 실제 frame() 처럼 불러 60판(10단계 × 6바퀴, 이기는 순서 · 아무렇게나 섞음) + 두목 10판.
10판마다 three 기하 · 결 · 셰이더, 장면 물체, 물리 몸, DOM, 힙(gc 뒤). 결과 soak2.json"""
import json, pathlib
from playwright.sync_api import sync_playwright
H=pathlib.Path(__file__).resolve().parent;BASE='http://127.0.0.1:19161'
SOL={int(k):v for k,v in json.loads((H.parent/'tools'/'solve_result.json').read_text()).items()}
M="""(()=>{gc();let n=0;S.traverse(()=>n++);const top={};S.children.forEach(c=>{const k=c.type+(c.children.length?'['+c.children.length+']':'');top[k]=(top[k]||0)+1});
 return {geo:R.info.memory.geometries,tex:R.info.memory.textures,prog:R.info.programs.length,scene:n,sceneTop:S.children.length,top,
 bodies:world.bodies.length,dom:document.getElementsByTagName('*').length,heapMB:+(performance.memory.usedJSHeapSize/1048576).toFixed(1)}})()"""
PLAY="""(([L,seq,rnd])=>{SF.hold(true);loadLevel(L,{skipIntro:true});let i=0;
 const run=()=>{let n=0;while((game.phase==='flight'||game.phase==='settle')&&n<900){gameStep();syncAll(1/60);fx.update(1/60);n++}for(let k=0;k<30;k++){syncAll(1/60);fx.update(1/60)}};
 while(game.phase==='aim'){const c=rnd?[(i*7)%25-12,.4+(i%4)*.12,i%2?40:null]:seq[i];if(!c)break;shoot(c[0]*DEG,c[1],c[2]);run();i++}
 for(let k=0;k<120;k++){syncAll(1/60);fx.update(1/60)}return game.phase})"""
rows=[];errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--js-flags=--expose-gc','--enable-precise-memory-info'])
    pg=b.new_page(viewport={'width':1280,'height':720})
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(BASE+'/games/embed/slingfort.html?test=1');pg.wait_for_function('window.SF');pg.wait_for_timeout(2500)
    pg.evaluate('SF.load(1,{hold:true})');rows.append({'plays':0,**pg.evaluate(M)});print(rows[-1])
    k=0;ph={}
    for lap in range(6):
        for L in range(1,11):
            k+=1;r=pg.evaluate(PLAY,[L,SOL[L]['seq'],(lap+L)%2==1]);ph[r]=ph.get(r,0)+1
            pg.wait_for_timeout(60)
            pg.evaluate('SF.show("map",1)');pg.evaluate('SF.show("village","map")');pg.evaluate('SF.show("title")')
            if k%10==0:rows.append({'plays':k,**pg.evaluate(M)});print(rows[-1])
    for i in range(10):pg.evaluate(PLAY,[5 if i%2 else 10,SOL[5 if i%2 else 10]['seq'],False])
    rows.append({'plays':k+10,'note':'두목 5·10 10판 더',**pg.evaluate(M)});print(rows[-1])
    pg.evaluate('SF.load(1,{hold:true})');rows.append({'plays':k+10,'note':'마지막에 1단계 다시 불러온 뒤',**pg.evaluate(M)});print(rows[-1])
    b.close()
(H/'soak2.json').write_text(json.dumps({'rows':rows,'phases':ph,'errors':errs},ensure_ascii=False,indent=1))
print('phases',ph,'errors',errs[:5])
