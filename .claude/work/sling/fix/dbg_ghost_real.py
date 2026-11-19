"""실제 frame 고리(시험 걸이 없음)에서 유령 곰 — ?level=2 로 열어 곰을 다 쏘고, 장면에 남은 곰 그림 수 · 그 위치(물리 몸은 없음)"""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-angle=metal']);pg=b.new_page(viewport={'width':1280,'height':720})
    pg.route('**/api/**',lambda r:r.fulfill(status=401,body='{}'))
    out=[]
    for L,shots in ((2,[(-10,.65),(2.5,.6),(0,.5),(5,.6)]),(3,[(-3,.6),(0,.62),(4,.55),(-6,.6),(2,.6)])):
        pg.goto(f'http://127.0.0.1:19161/games/embed/slingfort.html?level={L}');pg.wait_for_function("game.phase==='aim'&&game.aimReadyT>=1",timeout=30000)
        for c in shots:
            if pg.evaluate('game.phase')!='aim':break
            pg.evaluate(f'shoot({c[0]}*DEG,{c[1]},null)');pg.wait_for_timeout(200)
            pg.wait_for_function("game.phase!=='flight'&&game.phase!=='settle'",timeout=60000,polling=50)
            out.append((L,pg.evaluate("[game.phase,S.children.filter(c=>c.type==='Group'&&c.children.length===1&&c!==loadedBear).length]")))
    print(out);b.close()
