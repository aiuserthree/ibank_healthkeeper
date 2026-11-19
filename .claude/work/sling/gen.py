#!/usr/bin/env python3
# 곰돌이 새총 원정대 그림 한 장 — 장부(조회 값 합계)로 상한 130 넘기 전에 멈춤 → 생성 → result_url 받기 → 장부 한 줄
# 쓰기: python3 gen.py <이름> <1k|2k> <비율> <transparent|opaque> <프롬프트 파일> [참조 그림]
import sys, json, subprocess, re, urllib.request, os, datetime
HF='/Users/jhcho/.local/bin/higgsfield'; HERE=os.path.dirname(os.path.abspath(__file__))
CAP=130.0; COST={'1k':1.5,'2k':2.75}  # higgsfield generate cost 조회 값(참조 그림 있어도 같음)
name,res,ar,bg,pf=sys.argv[1:6]; ref=sys.argv[6] if len(sys.argv)>6 else None
led=os.path.join(HERE,'credits.txt'); prev=0.0
if os.path.exists(led):
    for l in open(led,encoding='utf-8'):
        mm=re.search(r'누계 ([\d.]+)',l)
        if mm: prev=float(mm.group(1))
c=COST[res]
if prev+c>CAP: print('STOP: 상한',prev); sys.exit(2)
prompt=open(pf,encoding='utf-8').read().strip()
cmd=[HF,'generate','create','gpt_image_2_6','--prompt',prompt,'--quality','high','--resolution',res,'--aspect_ratio',ar,'--background',bg,'--output_format','png','--wait','--wait-timeout','15m','--json']
if ref: cmd+=['--image',ref]
r=subprocess.run(cmd,capture_output=True,text=True)
txt=r.stdout
os.makedirs(os.path.join(HERE,'art-src'),exist_ok=True)
open(os.path.join(HERE,'art-src',name+'.json'),'w').write(txt)
m=re.findall(r'"result_url"\s*:\s*"([^"]+)"',txt)
ok=bool(m)
# 작업이 만들어졌으면(성공 · 결과 없음 모두) 값이 나갔다고 보고 더한다. 아예 안 만들어진 실패만 0.
created=ok or bool(re.search(r'"(id|job_id)"\s*:',txt))
spent=c if created else 0.0; tot=round(prev+spent,2)
with open(led,'a',encoding='utf-8') as f:
    f.write(f"{datetime.datetime.now():%H:%M} {name} {res} {ar} {bg}{' 참조' if ref else ''} · 값 {spent}(조회 값) · 누계 {tot}{'' if ok else ' · 실패'}\n")
if not ok:
    print('FAIL',r.returncode,(r.stderr or txt)[-600:]); sys.exit(1)
dst=os.path.join(HERE,'art-src',name+'.png')
urllib.request.urlretrieve(m[-1],dst)
print('OK',dst,'값',spent,'누계',tot)
