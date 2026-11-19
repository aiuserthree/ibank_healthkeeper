#!/usr/bin/env python3
# 원본(art-src) → 게임용 WebP(web/assets/games/slingfort/) + 대문 jpg(web/assets/lounge/slingfort.jpg)
# 쓰기: python3 prep_art.py [배경 품질=78] [아이콘 품질=82] [결 품질=80]
import os, sys, subprocess
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__)); SRC=os.path.join(HERE,'art-src')
ROOT=os.path.abspath(os.path.join(HERE,'..','..','..'))
DST=os.path.join(ROOT,'web/assets/games/slingfort'); os.makedirs(DST,exist_ok=True)
TMP=os.path.join(HERE,'chk','prep'); os.makedirs(TMP,exist_ok=True)
QB=int(sys.argv[1]) if len(sys.argv)>1 else 78; QI=int(sys.argv[2]) if len(sys.argv)>2 else 82; QT=int(sys.argv[3]) if len(sys.argv)>3 else 80
ICONS=['bear','bear_bomb','bear_shield','bear_giant','coon','coon_boss','slingshot','up_bomb','up_shield','up_giant','up_horn']
TEX=['tex_wood','tex_stone','tex_ice']; BG=['title','bg_forest','bg_marsh','bg_castle','map']
def out(name,im,q,alpha):
    p=os.path.join(TMP,name+'.png'); im.save(p)
    args=['/opt/homebrew/bin/cwebp','-quiet','-q',str(q),'-m','6']+(['-alpha_q','85','-exact'] if alpha else ['-noalpha'])+[p,'-o',os.path.join(DST,name+'.webp')]
    subprocess.run(args,check=True)
def icon(im,S=256):  # 알파 테두리로 잘라 정사각 칸 가운데에 두고 256 으로
    bb=im.getchannel('A').point(lambda v:255 if v>24 else 0).getbbox(); im=im.crop(bb)
    w,h=im.size; m=max(w,h); c=Image.new('RGBA',(m,m),(0,0,0,0)); c.paste(im,((m-w)//2,(m-h)//2)); return c.resize((S,S),Image.LANCZOS)
for n in ICONS:
    p=os.path.join(SRC,n+'.png')
    if os.path.exists(p): out(n,icon(Image.open(p).convert('RGBA')),QI,True)
for n in TEX:
    p=os.path.join(SRC,n+'.png')
    if os.path.exists(p): out(n,Image.open(p).convert('RGB').resize((512,512),Image.LANCZOS),QT,False)
for n in BG:
    p=os.path.join(SRC,n+'.png')
    if os.path.exists(p): out(n,Image.open(p).convert('RGB').resize((1600,900),Image.LANCZOS),QB,False)
p=os.path.join(SRC,'lounge.png')
if os.path.exists(p):
    im=Image.open(p).convert('RGB'); w,h=im.size; nh=w//2; top=(h-nh)//2
    im.crop((0,top,w,top+nh)).resize((900,450),Image.LANCZOS).save(os.path.join(ROOT,'web/assets/lounge/slingfort.jpg'),quality=72,optimize=True,progressive=True)
first=set(['title','bg_forest']+ICONS[:6]+['up_bomb','up_shield','up_giant','up_horn']+TEX)
tot=0;ft=0
for f in sorted(os.listdir(DST)):
    s=os.path.getsize(os.path.join(DST,f)); tot+=s
    if f[:-5] in first: ft+=s
    print(f,s)
print('합계',tot,'첫 화면(title+bg_forest+아이콘10+결3)',ft)
lp=os.path.join(ROOT,'web/assets/lounge/slingfort.jpg')
if os.path.exists(lp): print('lounge',os.path.getsize(lp))
