import sys,pathlib
from playwright.sync_api import sync_playwright
d=pathlib.Path(sys.argv[1])
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for v in ['aim','impact','title','map']:
        pg=b.new_page(viewport={'width':1280,'height':720})
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto((d/'index.html').as_uri()+'#'+v); pg.wait_for_function("document.title==='ready'",timeout=60000); pg.wait_for_timeout(300)
        pg.screenshot(path=str(d/f'm3-{v}.png')); print(v,errs); pg.close()
    b.close()
