"""휴대폰 가로 844×390 에서 틀 창이 화면 밖으로 나가는지 — slingfort 와 본보기 ferry 비교, 스크롤로 닿는지"""
import sys;sys.argv=['x'];exec(open('v_arcade.py').read().split('res={}')[0])
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch()
    for key in ('slingfort','ferry'):
        ctx=b.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=2);pg=ctx.new_page();pg.route('**/api/**',Fake())
        pg.goto(BASE+f'/games/{key}.html');pg.wait_for_timeout(4000)
        r=pg.evaluate("(()=>{const i=document.querySelector('iframe').getBoundingClientRect();window.scrollTo(0,9999);const se=document.scrollingElement;return {iframeTop:Math.round(i.top),iframeBottom:Math.round(i.bottom),vh:innerHeight,scrollY:Math.round(scrollY),scrollH:se.scrollHeight,bodyOverflow:getComputedStyle(document.body).overflow,htmlOverflow:getComputedStyle(document.documentElement).overflow}})()")
        print(key,r);pg.screenshot(path=str(OUT/f'phone-land-wrapper-{key}.jpg'),type='jpeg',quality=70);ctx.close()
    b.close()
