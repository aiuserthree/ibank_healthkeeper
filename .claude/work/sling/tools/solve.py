#!/usr/bin/python3
"""곰돌이 새총 원정대 — 자동 쏘기로 단계마다 깰 수 있는지 · 별 3 이 되는지 확인
쓰는 법: (워크트리 web/ 에서 python3 -m http.server 8791 를 띄운 뒤)
  /usr/bin/python3 .claude/work/sling/tools/solve.py [단계들 예: 1,2,3] [--beam 3]
- 각도(-15~15°, 2.5° 간격 13) × 힘(.35~.85, .05 간격 11) 격자, 특수 곰은 누르는 때(안 누름 · 35 · 55 · 75 · 95 걸음)까지 훑는다
- 묶음 찾기(beam): 한 발 쏠 때마다 후보를 모두 쳐 보고(판 상태 저장 · 되살리기), 쓰러뜨린 너구리 · 두목 체력 · 부순 블록 순으로 좋은 몇 개만 이어 간다
- 찾은 이기는 순서는 새 쪽을 열어 처음부터 다시 쳐서(되살리기 없이) 같은 해시가 나오는지 확인한다(결정성)
- 아무렇게나 쏘기 40판(씨앗 고정)으로 「너무 쉬운지」도 잰다
- 결과: tools/solve_result.json · tools/solve_table.md (브라우저 하나 · 쪽 4개까지 동시에)
"""
import sys, json, asyncio, pathlib, time
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8791'
URL=BASE+'/games/embed/slingfort.html?test=1'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
OUT=pathlib.Path(__file__).resolve().parent
args=sys.argv[1:]
LEVELS=[int(x) for x in args[0].split(',')] if args and not args[0].startswith('-') else list(range(1,11))
BEAM=int(args[args.index('--beam')+1]) if '--beam' in args else 3
YAWS=[-15+2.5*i for i in range(13)]
POWS=[round(.35+.05*i,2) for i in range(11)]
TAPS=[None,35,55,75,95]
def cands(t):
    taps=[None] if t=='basic' else TAPS
    return [[y,p,tp] for y in YAWS for p in POWS for tp in taps]
def score(r):return r['down']*1000-r['bossHp']*300+r['broken']*3+r['gold']*.01

async def solve_level(ctx,L,log):
    pg=await ctx.new_page();await pg.goto(URL);await pg.wait_for_function('window.SF',timeout=60000)
    info=[x for x in await pg.evaluate('SF.levels()') if x['id']==L][0]
    await pg.evaluate(f'SF.load({L},{{hold:true}})');await pg.evaluate('SF.fxOff(true)');await pg.evaluate("SF.snapSave('r')")
    t0=time.time()
    # 아무렇게나 40판
    rr=await pg.evaluate("SF.randomRuns('r',40,7)")
    rand={'runs':len(rr),'wins':sum(1 for x in rr if x['win']),'star3':sum(1 for x in rr if x['win'] and x['left']>=2)}
    beam=[('r',[])];found=None;tried=0;best_partial=None
    for depth,t in enumerate(info['bears']):
        C=cands(t);pool=[]
        for key,seq in beam:
            res=await pg.evaluate('([k,c])=>SF.tryShots(k,c)',[key,C]);tried+=len(C)
            for i,r in enumerate(res):pool.append((r,key+'.'+str(i),seq+[C[i]]))
        wins=[x for x in pool if x[0]['phase']=='win']
        if wins:
            wins.sort(key=lambda x:-x[0]['gold']);found=(depth+1,wins[0]);break
        seen=set();nb=[]
        for x in sorted(pool,key=lambda x:-score(x[0])):
            if x[0]['phase']!='aim' or x[0]['hash'] in seen:continue
            seen.add(x[0]['hash']);nb.append((x[1],x[2]))
            if len(nb)>=BEAM:break
        best_partial=max(pool,key=lambda x:score(x[0]))
        log(f'  {L}단계 {depth+1}발째: 후보 {len(pool)} · 가장 좋은 쓰러뜨림 {best_partial[0]["down"]}/{info["enemies"]} 두목체력 {best_partial[0]["bossHp"]} · {time.time()-t0:.0f}초')
        await pg.evaluate('(k)=>SF.snapDrop(k)',[k for k,_ in nb]);beam=nb
        if not beam:break
    out={'level':L,'name':info['name'],'bears':info['bears'],'enemies':info['enemies'],'blocks':info['blocks'],'boss':info['boss'],'mats':info['mats'],'region':info['region'],
         'random':rand,'tried':tried,'sec':round(time.time()-t0,1)}
    if found:
        n,(r,_,seq)=found;out.update({'win':True,'minBears':n,'leftBears':len(info['bears'])-n,'stars':3 if len(info['bears'])-n>=2 else 2 if len(info['bears'])-n==1 else 1,'seq':seq,'searchHash':r['hash'],'gold':r['gold']})
        # 결정성: 새 쪽에서 처음부터(되살리기 없이) 두 번 — 효과 켠 것 · 끈 것
        p2=await ctx.new_page();await p2.goto(URL);await p2.wait_for_function('window.SF',timeout=60000)
        a=await p2.evaluate('([l,s])=>SF.playSeq(l,s,false)',[L,seq]);b=await p2.evaluate('([l,s])=>SF.playSeq(l,s,true)',[L,seq]);await p2.close()
        out['replay']={'phase':a['phase'],'hash':a['hash'],'hashFx':b['hash'],'same':a['hash']==b['hash']==r['hash'] and a['phase']=='win'}
    else:
        out.update({'win':False,'best':best_partial and {'down':best_partial[0]['down'],'bossHp':best_partial[0]['bossHp'],'seq':best_partial[2]}})
    await pg.close();return out

async def main():
    res={}
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS)
        q=list(LEVELS);sem=asyncio.Semaphore(4)
        async def run(L):
            async with sem:
                ctx=await b.new_context(viewport={'width':640,'height':360})
                r=await solve_level(ctx,L,lambda s:print(s,flush=True));await ctx.close()
                res[L]=r;print(json.dumps({k:v for k,v in r.items() if k!='seq'},ensure_ascii=False),flush=True)
        await asyncio.gather(*[run(L) for L in q])
        await b.close()
    old={}
    f=OUT/'solve_result.json'
    if f.exists():
        try:old={int(k):v for k,v in json.loads(f.read_text()).items()}
        except Exception:old={}
    old.update(res);f.write_text(json.dumps({str(k):old[k] for k in sorted(old)},ensure_ascii=False,indent=1))
    NAME={'basic':'보통','bomb':'꿀폭탄','shield':'방패','giant':'큰곰'}
    lines=['# 자동 쏘기 결과(강화 없음)','',f'격자: 각도 {len(YAWS)} × 힘 {len(POWS)} × 누름 {len(TAPS)}(특수 곰), 묶음 {BEAM}. 「아무렇게나」 = 무작위 쏘기 40판(씨앗 7) 가운데 이긴 판','',
           '| 단계 | 이름 | 곰(순서) | 적 | 블록 | 깸 | 최소 곰 | 별 3 | 아무렇게나 이김 | 재현 |','|---|---|---|---|---|---|---|---|---|---|']
    for k in sorted(old):
        r=old[k];bears=' · '.join(NAME[x] for x in r['bears'])
        en=str(r['enemies'])+(f"(두목 체력 {r['boss'][0]})" if r['boss'] else '')
        lines.append(f"| {k} | {r['name']} | {len(r['bears'])}: {bears} | {en} | {r['blocks']} | {'O' if r['win'] else 'X'} | {r.get('minBears','-')} | {'O' if r.get('stars')==3 else 'X'} | {r['random']['wins']}/{r['random']['runs']} (별3 {r['random']['star3']}) | {'같음' if r.get('replay',{}).get('same') else '-' if not r['win'] else '다름'} |")
    lines+=['','찾은 이기는 순서(각도°, 힘, 누른 걸음):']
    for k in sorted(old):
        r=old[k]
        if r['win']:lines.append(f"- {k}단계: "+' → '.join(f"({s[0]}, {s[1]}, {s[2] if s[2] is not None else '안 누름'})" for s in r['seq']))
    (OUT/'solve_table.md').write_text('\n'.join(lines)+'\n')
    print('\n'.join(lines))
asyncio.run(main())
