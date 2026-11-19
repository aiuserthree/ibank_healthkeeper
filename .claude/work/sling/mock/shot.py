import sys,pathlib
from playwright.sync_api import sync_playwright
d=pathlib.Path(sys.argv[1])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1300,'height':800})
    pg.goto((d/'mock.html').as_uri())
    for i in ['play','title','map']: pg.locator('#'+i).screenshot(path=str(d/f'mock-{i}.png'))
    b.close()
