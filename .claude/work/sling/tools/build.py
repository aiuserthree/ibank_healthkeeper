#!/usr/bin/env python3
"""곰돌이 새총 원정대 본체 만들기: src/shell.html + three(r128 줄인 판) + cannon-es + game.js → web/games/embed/slingfort.html"""
import pathlib
W=pathlib.Path(__file__).resolve().parents[1]          # .claude/work/sling
ROOT=W.parents[2]                                        # 워크트리
src=W/'src'
three=(W/'mock3d'/'three.js').read_text()
html=(src/'shell.html').read_text()
for k,v in (('/*__THREE__*/',three.rstrip('\n')),('/*__CANNON__*/',(src/'cannon.min.js').read_text().rstrip('\n')),('/*__GAME__*/',(src/'game.js').read_text().rstrip('\n'))):
    assert html.count(k)==1,k
    html=html.replace(k,v)
out=ROOT/'web'/'games'/'embed'/'slingfort.html'
out.write_text(html)
print(out, len(html.encode()))
