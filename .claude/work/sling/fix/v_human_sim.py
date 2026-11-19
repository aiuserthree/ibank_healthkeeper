#!/usr/bin/python3
"""검증 ㉮ — 사람 손 흉내(게임 물리 그대로, 시험 걸이로 빠르게)
 (a) idle: 찾은 순서를 쏘기 사이 쉬는 걸음(0 · 40 · 200)만 바꿔 같은 결과인지
 (b) noisy: 찾은 순서를 손 흔들림(각도 ±2° · 힘 ±5% · 누름 ±6걸음 · 쉬는 걸음 30~150)으로 30판
 (c) greedy: 판마다 거친 격자(각도 5° · 힘 .1 · 누름 안/45/75)로 가장 좋은 한 발을 고르고(사람이 '이게 좋겠다' 고르는 셈) 흔들어 쏨, 8판
 이상 물리: 살아 있는 블록이 땅속(가운데 y<0.1) · 너무 멀리(요새에서 25m) 날아간 경우 셈
쓰는 법: /usr/bin/python3 v_human_sim.py [단계들] → human_sim.json
"""
import sys, json, asyncio, pathlib, random, math, time
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:19161'
URL=BASE+'/games/embed/slingfort.html?test=1'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
HERE=pathlib.Path(__file__).resolve().parent
FAST='--fast' in sys.argv;NOUP='--up' not in sys.argv
A=[a for a in sys.argv[1:] if not a.startswith('--')]
LEVELS=[int(x) for x in A[0].split(',')] if A else list(range(1,11))
UP={'bomb':3,'shield':3,'giant':3,'horn':2} if not NOUP else None
OUTN='human_sim_up.json' if UP else 'human_sim.json'
def load_seq():
    out={}
    for name in ('out_reach','out_orig'):
        f=HERE/name/'solve_result.json'
        if f.exists():
            for k,v in json.loads(f.read_text()).items():
                if v.get('win') and int(k) not in out:out[int(k)]=v['seq']
    return out
SEQ=load_seq()
def reach(y,p):return max(p,abs(y)/24)
def noisy(rng,y,p,tap):
    y2=max(-24,min(24,y+rng.uniform(-2,2)));p2=min(1,max(.15,p*(1+rng.uniform(-.05,.05))))
    t2=None if tap is None else max(1,tap+rng.randint(-6,6))
    return [y2,reach(y2,p2),t2]
JS_ANOM="""(()=>{const s=SF.snapshot();let under=0,far=0;for(const r of s){if(!r[0])continue;const [a,x,y,z]=r;
 if(y<0.1&&x>-40&&x<32&&z>-15&&z<43)under++;if(Math.hypot(x+6,z-26)>25)far++}return {under,far}})()"""
async def run_shot(pg,y,p,tap):
    await pg.evaluate(f'SF.shoot({y},{p},{json.dumps(tap)})')
    r=await pg.evaluate('SF.runShot(16)');a=await pg.evaluate(JS_ANOM)
    return r,a
async def level(ctx,L,info):
    pg=await ctx.new_page();await pg.goto(URL);await pg.wait_for_function('window.SF',timeout=60000)
    await pg.evaluate('SF.fxOff(true)')
    await pg.evaluate(f'SF.setUp({json.dumps(UP)})')
    out={'level':L,'bears':len(info['bears'])+(UP['horn'] if UP else 0)}
    info=dict(info,queue=info['bears']+(['basic']*UP['horn'] if UP else []))
    seq=SEQ.get(L)
    # (a) 쉬는 걸음
    if seq and not FAST:
        ia={}
        for idle in (0,40,200):
            await pg.evaluate(f'SF.load({L},{{hold:true}})');steps=[]
            for y,p,t in seq:
                if idle:await pg.evaluate(f'SF.step({idle})')
                r,_=await run_shot(pg,y,p,t);steps.append(r['stepsRun'])
                if r['phase']!='aim':break
            st=await pg.evaluate('SF.state()');ia[idle]={'phase':st['phase'],'hash':st['hash'],'down':st['enemiesDown'],'steps':steps}
        out['idle']=ia
    # (b) 흔들린 손으로 찾은 순서
    if seq:
        rng=random.Random(100+L);runs=[]
        for k in range(int(__import__('os').environ.get('HN','30'))):
            await pg.evaluate(f'SF.load({L},{{hold:true}})');used=0;an={'under':0,'far':0};ss=[]
            while True:
                st=await pg.evaluate('SF.state()')
                if st['phase']!='aim':break
                i=st['shotIdx'];base=seq[i] if i<len(seq) else [rng.uniform(-10,10),rng.uniform(.4,.8),None if info['queue'][i]=='basic' else 60]
                if info['queue'][i]=='basic':base=[base[0],base[1],None]
                await pg.evaluate(f'SF.step({rng.randint(30,150)})')
                r,a=await run_shot(pg,*noisy(rng,*base));used+=1;ss.append(r['stepsRun'])
                an['under']=max(an['under'],a['under']);an['far']=max(an['far'],a['far'])
            st=await pg.evaluate('SF.state()')
            alive=await pg.evaluate("game.enemies.map((e,i)=>e.alive?[i,+(e.body.position.x+6).toFixed(1),+e.body.position.y.toFixed(1),+(e.body.position.z-26).toFixed(1),e.hp]:null).filter(Boolean)")
            runs.append({'win':st['phase']=='win','used':used,'left':st['bearsLeft'],'down':st['enemiesDown'],'gold':st['gold'],'steps':ss,'anom':an,'alive':alive})
        out['noisy']=runs
    # (c) 고르는 사람
    rng=random.Random(500+L);runs=[]
    YA=[-15+5*i for i in range(7)];PO=[round(.35+.1*i,2) for i in range(6)]
    t0=time.time()
    for k in range(0 if FAST else 8):
        await pg.evaluate("SF.load('stress',{hold:true});SF.snapSave('x');SF.snapDrop([])")  # 시험 걸이 ALL 캐시가 같은 단계 다시 불러도 안 바뀌어서 한 번 다른 판으로
        await pg.evaluate(f'SF.load({L},{{hold:true}})');used=0;an={'under':0,'far':0};ss=[]
        while True:
            st=await pg.evaluate('SF.state()')
            if st['phase']!='aim':break
            await pg.evaluate(f'SF.step({rng.randint(30,150)})');await pg.evaluate("SF.snapSave('cur')")
            t=info['queue'][st['shotIdx']];taps=[None] if t=='basic' else [None,45,75]
            C=[[y,p,tp] for y in YA for p in PO for tp in taps if p>=abs(y)/24]
            res=await pg.evaluate('([k,c])=>SF.tryShots(k,c)',['cur',C])
            sc=lambda r:(1 if r['phase']=='win' else 0)*1e6+r['down']*1000-r['bossHp']*300+r['broken']*3
            best=max(range(len(C)),key=lambda i:sc(res[i]))
            n=noisy(rng,*C[best])
            r2=await pg.evaluate('([k,c])=>SF.tryShots(k,c)',['cur',[n]])
            await pg.evaluate("SF.snapDrop(['cur'])");a=await pg.evaluate(JS_ANOM)
            used+=1;ss.append(r2[0]['steps']);an['under']=max(an['under'],a['under']);an['far']=max(an['far'],a['far'])
        st=await pg.evaluate('SF.state()')
        runs.append({'win':st['phase']=='win','used':used,'left':st['bearsLeft'],'down':st['enemiesDown'],'gold':st['gold'],'steps':ss,'anom':an})
    out['greedy']=runs;out['greedy_sec']=round(time.time()-t0)
    await pg.close();return out
async def main():
    res={}
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS)
        ctx=await b.new_context(viewport={'width':640,'height':360})
        pg=await ctx.new_page();await pg.goto(URL);await pg.wait_for_function('window.SF',timeout=60000)
        infos={x['id']:x for x in await pg.evaluate('SF.levels()')}
        for x in infos.values():x['queue']=x['bears']
        await pg.close()
        sem=asyncio.Semaphore(4)
        async def run(L):
            async with sem:
                r=await level(ctx,L,infos[L]);res[L]=r
                g=r['greedy'] or [{'win':0}];nz=r.get('noisy',[])
                print(L,'noisy',sum(x['win'] for x in nz),'/',len(nz),'greedy',sum(x['win'] for x in g),'/',len(g),'idle',{k:(v['phase'],v['hash']) for k,v in r.get('idle',{}).items()},flush=True)
        await asyncio.gather(*[run(L) for L in LEVELS])
        await b.close()
    f=HERE/OUTN;old=json.loads(f.read_text()) if f.exists() else {}
    old.update({str(k):v for k,v in res.items()});f.write_text(json.dumps(old,ensure_ascii=False,indent=1))
asyncio.run(main())
