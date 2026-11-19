/* 곰돌이 새총 원정대(slingfort) — 1단계: 물리 · 새총 · 무너짐
 *  · 장면: three.js r128(로우폴리, 시안 mock3d 그대로), 물리: cannon-es 0.20.0(MIT, 본체에 넣음)
 *  · 물리는 고정 걸음 1/60초, 같은 입력 → 같은 결과(물리 · 판정에는 무작위를 쓰지 않는다 — 효과만 Math.random)
 *  · 블록은 처음에 잠든 채로 놓이고(쌓은 더미가 떨지 않게), 맞거나 받치던 것이 사라지면 깨어난다
 *  · 맞은 세기 = 한 걸음 동안 바뀐 속도(중력 몫 뺌). 재료마다 견디는 값을 넘은 만큼 체력이 깎이고 0 이면 부서진다
 *  · ?test=1 이면 window.SF 시험 걸이(load · shoot · run · state · snapshot · bench)
 */
'use strict';
const $=id=>document.getElementById(id);
const Q=new URLSearchParams(location.search);
const TEST=Q.get('test')==='1';
const MOBILE=(window.matchMedia&&matchMedia('(pointer:coarse)').matches)||/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const DEG=Math.PI/180;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const V3=THREE.Vector3;
// 헬스키퍼 아케이드 창 안(?hk=1)이면 단계 시작 · 원정 점수를 부모 창으로 보낸다(창 밖에서 혼자 열면 보내지 않는다)
const inFrame=window.parent!==window;
const ARC=/[?&]hk=1(&|$)/.test(location.search)||inFrame;
const HKO=location.origin;
const hk=msg=>{if(ARC&&inFrame){try{window.parent.postMessage(msg,HKO)}catch(e){}}};
const SCORE_MAX=100000; // 원정 점수 상한(game.py 와 같게)
const GAME={name:'곰돌이 새총 원정대',key:'slingfort'};
const nf=n=>Number(n||0).toLocaleString('ko-KR');
/* 그림(힉스필드 GPT 이미지) — 못 받으면 코드로 그리던 것(이모지 · 캔버스 결 · 색 하늘)으로 되돌아간다 */
const ART_FILES=['title','bear','bear_bomb','bear_shield','bear_giant','coon','coon_boss','up_bomb','up_shield','up_giant','up_horn','tex_wood','tex_stone','tex_ice','bg_forest','bg_marsh','bg_castle','map','slingshot'];
const artUrl=n=>'/assets/games/slingfort/'+n+'.webp';
const ART={ok:{},img:{},cb:{}};
function artLoad(n){if(ART.img[n])return ART.img[n];const im=new Image();im.decoding='async';ART.img[n]=im;
  let tries=0;im.onload=()=>{ART.ok[n]=true;(ART.cb[n]||[]).forEach(f=>{try{f(im)}catch(e){}});ART.cb[n]=[]};
  im.onerror=()=>{if(++tries<3){setTimeout(()=>{im.src=artUrl(n)+'?r='+tries},900*tries);return}ART.ok[n]=false}; // 두 번 더 받아 보고 안 되면 코드 그림
  im.src=artUrl(n);return im}
function artWhen(n,f){if(ART.ok[n])f(ART.img[n]);else{(ART.cb[n]=ART.cb[n]||[]).push(f);artLoad(n)}}
// DOM 그림: 받은 그림이면 그림, 아직 · 못 받았으면 이모지(그림이 오면 보이는 화면을 다시 그린다)
const aimg=(n,emo,cls='')=>ART.ok[n]?`<img class="art ${cls}" src="${artUrl(n)}" alt="" draggable="false">`:`<span class="art ae ${cls}">${emo}</span>`;
let artT=0;const artRefresh=()=>{clearTimeout(artT);artT=setTimeout(()=>{try{refreshArt()}catch(e){}},60)};
{const t=artLoad('title');let go=false;const rest=()=>{if(go)return;go=true;ART_FILES.forEach(n=>artWhen(n,artRefresh))};
  artWhen('title',()=>{artRefresh();rest()});t.addEventListener('error',rest);setTimeout(rest,1500)}

/* ───────── 1. 단계 자료 ─────────
 * 좌표: 요새 기준점(FX,FZ)에서의 거리(m). x 는 요새 폭(화면에서는 +x 가 왼쪽), z 는 깊이(+z 가 멀리), y 는 블록 밑면 높이.
 * blocks: [재료, 폭, 높이, 깊이, x, 밑면y, z]   enemies: [x, 밑면y, z, 돌림(도)]
 * bears: 쏘는 순서(basic 만 1단계. bomb · shield · giant 는 2단계에서) */
const FX=-6,FZ=26;
const BEARS={
  basic:{icon:'🐻',art:'bear',tag:'',tagc:'',col:0xa86a34},
  bomb:{icon:'🍯',art:'bear_bomb',tag:'꿀폭탄',tagc:'#d8452e',col:0x8a5226},
  shield:{icon:'🛡️',art:'bear_shield',tag:'방패',tagc:'#2f7fd8',col:0xb07a44},
  giant:{icon:'💪',art:'bear_giant',tag:'큰곰',tagc:'#e0862a',col:0x7a4520},
};
/* 요새 짜기 도우미: 블록을 정확히 맞물려 쌓는다(밑면 y = 아래 것 윗면) */
function fort(){const b=[],e=[];return{b,e,
  box(m,w,h,d,x,y,z=0){b.push([m,w,h,d,x,y,z]);return y+h},
  stack(m,s,x,z,n,y=0){for(let i=0;i<n;i++)b.push([m,s,s,s,x,y+i*s,z]);return y+n*s},
  arch(mp,mt,x,z,span,h,y=0,d=1,pw=.4){b.push([mp,pw,h,pw,x-span/2,y,z],[mp,pw,h,pw,x+span/2,y,z],[mt,span+pw+.2,.3,d,x,y+h,z]);return y+h+.3},
  en(x,y,z=0,r=0){e.push([x,y,z,r])},
  boss(x,y,z,hp){e.push([x,y,z,0,hp])}}}
const LEVELS=[
  {id:1,name:'숲속 연습장',sub:'뒤로 당겼다 놓아요 · 🍯 꿀폭탄곰은 날아갈 때 누르면 쾅!',tutorial:true,
   bears:['basic','bomb','basic','basic','basic'],
   blocks:[
     ['wood',.5,2.4,.5,-1.6,0,0],['wood',.5,2.4,.5,1.6,0,0],['wood',4.2,.35,1.0,0,2.4,0],
     ['wood',1.2,1.2,1.2,-2.5,0,0],['wood',1.2,1.2,1.2,-2.5,1.2,0],
     ['wood',1.0,1.0,1.0,3.3,0,-.1],['wood',1.0,1.0,1.0,4.35,0,-.1],['wood',1.0,1.0,1.0,3.8,1.0,-.1],
   ],
   enemies:[[0,2.75,0,0],[-2.5,2.4,0,15],[0,0,0,-10]],
   fence:[[-6,3.2,3.2,3.2]],banners:[[-4.5,2.8],[.5,3.0],[4.5,2.6]]},
  {id:2,name:'돌담 마을',sub:'돌은 무겁고 단단해요 · 🛡️ 방패곰은 누르면 통통 튕겨요!',
   bears:['basic','shield','bomb','basic','bomb','basic'],
   blocks:[
     ['stone',2.8,1.2,1.2,-3,0,0],['wood',.4,1.8,.4,-4.15,1.2,0],['wood',.4,1.8,.4,-1.85,1.2,0],['wood',3.2,.3,1.0,-3,3.0,0],
     ['wood',1.2,1.2,1.2,.2,0,0],['wood',1.2,1.2,1.2,.2,1.2,0],
     ['wood',.4,2.0,.4,2.0,0,0],['wood',.4,2.0,.4,4.4,0,0],['wood',3.0,.3,1.0,3.2,2.0,0],['wood',1.0,1.0,1.0,3.2,2.3,0],
     ['stone',1.0,1.0,1.0,5.9,0,.2],['wood',1.0,1.0,1.0,5.9,1.0,.2],
     ['wood',1.0,1.0,1.0,-5.4,0,-.2],
   ],
   enemies:[[-3,3.3,0,0],[-3,1.2,0,10],[.2,2.4,0,-15],[3.2,0,0,5]],
   fence:[[-7,3.2,7,3.2],[7.4,-1.8,7.4,3.0]],banners:[[-5.5,2.8],[0,3.0],[5.5,2.6]]},
  (()=>{const f=fort(); // 3 얼음 곳간 — 얼음 처음, 큰곰 처음(구현 3단계에 쉽게: 오른쪽 기둥 돌 → 나무, 얼음탑 3 → 2, 끝 상자를 0.6m 안으로)
    f.box('wood',1,1.6,1,-4.2,0);f.box('wood',1,1.6,1,-1.4,0);f.box('ice',3.8,.5,1,-2.8,1.6);f.en(-2.8,2.1);f.en(-2.8,0,0,10);
    f.stack('ice',1,1.2,0,2);f.en(1.2,2);
    f.arch('wood','wood',3.9,0,2.2,1.8);f.box('ice',1,1,1,3.9,2.1);f.en(3.9,0,0,-10);
    f.box('wood',1,1,1,5.6,0,.2);f.en(5.6,1,.2);
    f.box('stone',1.2,1.2,1.2,-6.2,0,.1);f.box('wood',1,1,1,-6.2,1.2,.1);
    return {id:3,name:'얼음 곳간',sub:'얼음은 쨍그랑 잘 깨져요 · 💪 큰곰은 누르면 벽을 뚫고 돌진!',bears:['basic','giant','shield','bomb','bomb','basic'],
      blocks:f.b,enemies:f.e,fence:[[-8,3.4,8,3.4]],banners:[[-5,3.0],[1,3.2],[5.5,3.0]]}})(),
  (()=>{const f=fort(); // 4 단풍 망루 — 높은 탑
    f.box('stone',2.6,1,1.2,0,0);f.box('wood',.4,2,.4,-1,1);f.box('wood',.4,2,.4,1,1);f.box('wood',2.8,.3,1.2,0,3);
    f.box('wood',.4,1.6,.4,-.9,3.3);f.box('wood',.4,1.6,.4,.9,3.3);f.box('wood',2.4,.3,1.2,0,4.9);
    f.en(0,5.2);f.en(0,3.3);f.en(0,1);
    f.stack('wood',1,-4.2,0,2);f.en(-4.2,2,0,15);f.box('ice',1,1,1,-2.6,0,-.3);
    f.arch('stone','wood',5,0,2.2,1.4,0,1,.8);f.en(5,1.7,0,-15);
    return {id:4,name:'단풍 망루',sub:'높은 망루는 아래 기둥을 노려요 · 와르르 무너져요!',bears:['basic','bomb','giant','shield','basic'],
      blocks:f.b,enemies:f.e,fence:[[-8,3.4,8,3.4]],banners:[[-6,3.0],[3,3.2],[7,3.0]]}})(),
  (()=>{const f=fort(); // 5 너구리 두목 산채 — 중간 보스
    f.box('stone',1.2,1.2,1.2,-1.3,0);f.box('stone',1.2,1.2,1.2,1.3,0);f.box('stone',4,.4,1.4,0,1.2);f.boss(0,1.6,0,3);
    f.box('wood',.4,2.6,.4,-1.7,1.6);f.box('wood',.4,2.6,.4,1.7,1.6);f.box('wood',4,.3,1.4,0,4.2);f.en(0,4.5);
    f.stack('wood',1,-4.4,0,2);f.en(-4.4,2);f.box('ice',.5,1.6,1.6,-3,0,-.4);
    f.box('stone',1.2,1.2,1.2,3.8,0);f.box('wood',1,1,1,3.8,1.2);f.en(3.8,2.2,0,-10);
    f.box('ice',.5,1.4,1.4,5.0,0,-1);f.en(5.1,0,.2);
    f.stack('wood',.8,-5.8,.3,3);f.en(-5.8,2.4,.3,20);
    return {id:5,name:'너구리 두목 산채',sub:'두목 너구리는 여러 번 맞혀야 쓰러져요!',bears:['basic','giant','bomb','shield','bomb','bomb','basic'],boss:true,
      blocks:f.b,enemies:f.e,fence:[[-8.5,3.6,8.5,3.6],[8.6,-2,8.6,3.4],[-8.6,-2,-8.6,3.4]],banners:[[-5.5,3.2],[0,3.4],[5.5,3.2],[-2.6,3.4],[2.6,3.4]]}})(),
  (()=>{const f=fort(); // 6 늪 나루터 — 안개 늪 처음, 기둥집
    for(const x of [-3,-1,1,3])f.box('wood',.4,2,.4,x,0);f.box('wood',6.8,.3,1.2,0,2);
    f.box('wood',.4,1.6,.4,-2.2,2.3);f.box('wood',.4,1.6,.4,2.2,2.3);f.box('wood',5,.3,1.2,0,3.9);
    f.en(-.9,2.3);f.en(.9,2.3,0,10);f.en(0,4.2);f.en(-2,0,0,-10);f.box('ice',1,1,1,0,0);
    f.stack('ice',1,-4.2,0,2);f.en(-4.2,2);
    f.box('wood',1.2,1.2,1.2,4.2,0);f.en(4.2,1.2,0,-15);
    return {id:6,name:'늪 나루터',sub:'안개 늪에 왔어요 · 기둥을 부러뜨리면 집이 통째로 무너져요!',bears:['basic','shield','bomb','giant','basic'],region:'swamp',
      blocks:f.b,enemies:f.e,fence:[[-8,3.4,8,3.4]],banners:[[-4.5,3.0],[4.5,3.0]]}})(),
  (()=>{const f=fort(); // 7 이끼 돌탑 — 돌탑 둘과 얼음 다리
    f.stack('stone',1,-3,0,3);f.stack('stone',1,3,0,3);f.box('ice',7.2,.4,1,0,3);f.en(-1.2,3.4);f.en(1.2,3.4,0,-10);
    f.stack('wood',1,0,-1.2,2);f.en(0,0,.4);
    f.arch('wood','wood',-5.8,0,1.6,1.6);f.en(-5.8,0,0,10);
    f.stack('ice',1,5.2,0,2);f.en(5.2,2);
    return {id:7,name:'이끼 돌탑',sub:'돌탑 사이 얼음 다리 · 다리가 깨지면 위 너구리가 떨어져요!',bears:['basic','giant','bomb','shield','basic'],region:'swamp',
      blocks:f.b,enemies:f.e,fence:[[-8.5,3.4,8.5,3.4]],banners:[[-4.5,3.2],[4.5,3.2]]}})(),
  (()=>{const f=fort(); // 8 버섯 얼음굴 — 얼음 피라미드(3단계에 쉽게: 꼭대기 하나 뺌, 끝 얼음을 0.2m 안으로)
    for(const x of [-1.5,-.5,.5,1.5])f.box('ice',1,1,1,x,0);for(const x of [-1,0,1])f.box('ice',1,1,1,x,1);for(const x of [-.5,.5])f.box('ice',1,1,1,x,2);f.en(0,3);f.en(0,0,1.4);
    f.arch('wood','wood',-4.6,0,2,2);f.en(-4.6,0);f.en(-4.6,2.3,0,10);
    f.box('stone',1.2,1.2,1.2,4,0);f.box('stone',1.2,1.2,1.2,5.4,0);f.box('wood',2.8,.3,1.2,4.7,1.2);f.en(4.7,1.5,0,-10);
    f.box('ice',1,1,1,6.5,0);f.en(6.5,1);
    return {id:8,name:'버섯 얼음굴',sub:'얼음 피라미드 · 꿀폭탄 한 방이면 얼음이 와장창!',bears:['basic','bomb','giant','shield','bomb','basic'],region:'swamp',
      blocks:f.b,enemies:f.e,fence:[[-8.5,3.4,8.5,3.4]],banners:[[-6.5,3.0],[2.5,3.4],[7.6,3.0]]}})(),
  (()=>{const f=fort(); // 9 갈대 성문 — 앞을 막은 성벽(3단계에 쉽게: 성벽 윗줄 가운데 둘 뺌, 오른쪽 나무 더미 2 → 1)
    for(let i=0;i<6;i++){const x=-2.5+i;f.box('stone',1,1,1,x,0,-1.4);if(i!==2&&i!==3)f.box('wood',1,1,1,x,1,-1.4)}
    f.arch('wood','wood',0,.8,2,2.6);f.en(0,2.9,.8);f.en(0,0,.8);f.en(-2.2,0,.6,10);f.en(2.2,0,.6,-10);
    f.stack('ice',1,-4.4,0,2);f.en(-4.4,2);f.stack('wood',1,4.4,0,1);f.en(4.4,1,0,-15);
    return {id:9,name:'갈대 성문',sub:'성벽 뒤에 숨었어요 · 큰곰 돌진으로 벽을 뚫어요!',bears:['basic','giant','bomb','shield','giant','basic'],region:'swamp',
      blocks:f.b,enemies:f.e,fence:[[-8.5,3.4,8.5,3.4]],banners:[[-3.6,2.8],[3.6,2.8],[0,3.6]]}})(),
  (()=>{const f=fort(); // 10 산적 두목 성 — 마지막 보스 요새(3단계에 쉽게: 앞 돌담 가운데 하나 뺌)
    for(const y of [0,1.2]){f.box('stone',1.2,1.2,1.2,-1.3,y);f.box('stone',1.2,1.2,1.2,1.3,y)}
    f.box('stone',4.2,.4,1.6,0,2.4);f.boss(0,2.8,0,5);f.en(0,0,0);
    f.box('stone',.5,2.6,.5,-1.8,2.8);f.box('stone',.5,2.6,.5,1.8,2.8);f.box('ice',4.6,.4,1.6,0,5.4);f.en(0,5.8);
    for(let i=0;i<7;i++)if(i!==3)f.box('stone',1,1,1,-3+i,0,-2.2);for(const x of [-3,-1,1,3])f.box('ice',.5,.5,.5,x,1,-2.2);
    f.stack('wood',1,-4.3,0,2);f.box('wood',1.6,.3,1.4,-4.3,2);f.en(-4.3,2.3,0,15);
    f.stack('ice',1,4.8,0,2);f.en(4.8,2,0,-15);
    f.arch('wood','wood',0,2.2,3.2,3);f.en(0,3.3,2.2);
    f.en(-3.4,0,0,10);f.en(3.4,0,0,-10);
    return {id:10,name:'산적 두목 성',sub:'마지막 성 · 두목과 졸개를 모두 쓰러뜨려요!',bears:['basic','giant','bomb','shield','giant','bomb','bomb','bomb','basic'],region:'swamp',boss:true,view:1.2,
      blocks:f.b,enemies:f.e,fence:[[-9,4,9,4],[9.2,-3,9.2,3.8],[-9.2,-3,-9.2,3.8]],banners:[[-7.4,3.2],[-2.8,3.6],[2.8,3.6],[7.4,3.2]]}})(),
];
const REGIONS=[{key:'forest',name:'단풍 숲',lv:[1,2,3,4,5]},{key:'swamp',name:'안개 늪',lv:[6,7,8,9,10]}];
// 시험용 큰 요새(블록 100) — 무너질 때 프레임 시간 재기(?test=1&level=stress 또는 SF.load('stress'))
const STRESS=(()=>{const b=[];const mats=['wood','stone','wood','ice','wood'];
  for(let r=0;r<5;r++)for(let i=0;i<10;i++)for(let k=0;k<2;k++)b.push([mats[r],.92,.9,.92,-4.7+i*.95+(r%2?.2:0),r*.9,k*.95-.47]);
  return {id:'stress',name:'시험 · 큰 벽',sub:'블록 100개',bears:['basic','basic','basic'],blocks:b,
    enemies:[[-3,4.5,0,0],[-.6,4.5,0,0],[1.8,4.5,0,0],[4,4.5,0,0]],fence:[],banners:[]}})();
const levelById=id=>id==='stress'?STRESS:LEVELS.find(l=>l.id==id)||LEVELS[0];

/* 재료: 밀도(kg/m³ 대신 쉬운 값) · 체력 · 견디는 속도 변화(m/s) · 부서질 때 금화 */
const MATS={
  wood:{dens:1.6,hp:12,thr:2.4,gold:3},
  stone:{dens:5.0,hp:26,thr:3.4,gold:5},
  ice:{dens:1.3,hp:4.5,thr:1.4,gold:2},
};
const ENEMY={w:.7,h:1.4,mass:1.5,dvKill:2.0,tipCos:.7,crushJ:2.4,gold:15};
/* 두목: 곰 몸(빠르기 bearV 이상) · 꿀폭탄 폭발 · 큰곰 돌진 · 방패 튕김에 직접 맞을 때, 또는 아주 센 충격(속도 변화 dvHit 이상 — 큰 돌이 높은 데서 떨어진 정도)에만 체력 1.
 * 무너진 잔해에 깔리거나 스치는 것으로는 안 깎인다. 깎인 뒤 cool 걸음(0.9초, 전 24걸음) 동안은 다시 안 깎인다. 물 · 밖으로 떨어지면 바로 쓰러짐 */
const BOSS={w:1.4,h:2.2,mass:7,gold:60,cool:54,dvHit:6.5,bearV:3,bearV2:10,perShot:2}; // perShot: 한 발(쏜 곰 하나)이 두목에게 깎는 체력 합 상한 — 물/밖 떨어짐은 따로(바로 쓰러짐) // 빠른 곰(10m/s 이상)이 바로 맞히면 2
const BEAR_R=.6,BEAR_M=6;
const GIANT_R=.85,GIANT_M=14;
/* 특수 곰 — 곰 마을 강화가 이 값을 올린다(applyUp). 시험 걸이(?test=1)는 강화 없음이 기본(SF.setUp 으로 바꿈) */
const UP={bombR:3.2,shieldN:3,giantN:4,horn:0};
// 곰 마을: 칸마다 값(레퍼런스 LONGHOUSE 에서 본 값 120 · 320 / 120 / 150 · 380 / 300 · 900, 못 본 칸은 비슷한 비율로 정함)
const UPG={
  bomb:{name:'꿀폭탄',art:'up_bomb',emo:'🍯',val:[3.2,3.6,4.0,4.4],cost:[120,320,640],d:(a,b)=>b==null?`폭발 ${a}m · 최고`:`폭발 ${a}m → ${b}m`},
  shield:{name:'냄비 방패',art:'up_shield',emo:'🛡️',val:[3,4,5,6],cost:[120,320,640],d:(a,b)=>b==null?`튕김 ${a}번 · 최고`:`튕김 ${a} → ${b}번`},
  giant:{name:'큰곰 돌진',art:'up_giant',emo:'💪',val:[4,5,6,7],cost:[150,380,760],d:(a,b)=>b==null?`블록 ${a}개 · 최고`:`블록 ${a} → ${b}개`},
  horn:{name:'출정 나팔',art:'up_horn',emo:'📯',val:[0,1,2],cost:[300,900],d:(a,b)=>b==null?`곰 +${a} · 최고`:a?`곰 +${a} → +${b}`:`곰 그대로 → +${b}`},
};
let testUp=null;
function upLv(){const u=(TEST?testUp:null)||(TEST?{}:SAVE.get().up)||{};const o={};for(const k in UPG)o[k]=clamp(u[k]|0,0,UPG[k].cost.length);return o}
function applyUp(){const u=upLv();UP.bombR=UPG.bomb.val[u.bomb];UP.shieldN=UPG.shield.val[u.shield];UP.giantN=UPG.giant.val[u.giant];UP.horn=UPG.horn.val[u.horn]}
const BOMB={dmg:18,push:11,fac:{ice:2.2,wood:1.25,stone:.45},killK:.22,throwFwd:5,throwDown:7};
const SHIELD={keep:.86,minSpeed:8,push:6,cool:10};
const GIANT={speed:21,steps:70,pad:.12};
const G=-12;
const DT=1/60;
const P0=new V3(-1.6,4.35,-.25);           // 새총 주머니(쏘는 자리)
const PITCH=32*DEG;
const BASE_YAW=Math.atan2(FX-P0.x,FZ-P0.z); // 새총 → 요새 가운데
const YAW_RANGE=24*DEG;
const powerToSpeed=p=>11+11*p; // 힘 → 빠르기(검증 반영: 9+14p → 11+11p, 손이 조금 흔들려도 떨어지는 자리가 덜 바뀌게)

/* ───────── 2. 장면 ───────── */
const stage=$('stage');
const R=new THREE.WebGLRenderer({antialias:!MOBILE,powerPreference:'high-performance',preserveDrawingBuffer:TEST});
R.setPixelRatio(Math.min(window.devicePixelRatio||1,MOBILE?1.5:2));
R.shadowMap.enabled=true;R.shadowMap.type=MOBILE?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
stage.prepend(R.domElement);
const S=new THREE.Scene();S.background=new THREE.Color(0x8fd0f5);S.fog=new THREE.Fog(0xbfe4f7,60,170);
const cam=new THREE.PerspectiveCamera(42,16/9,.1,400);
const HEMI=new THREE.HemisphereLight(0xdff2ff,0x4a7a2a,.62);S.add(HEMI);
const sun=new THREE.DirectionalLight(0xfff1d6,1.05);sun.position.set(-30,50,-20);sun.castShadow=true;
sun.shadow.mapSize.set(MOBILE?1024:2048,MOBILE?1024:2048);Object.assign(sun.shadow.camera,{left:-34,right:34,top:34,bottom:-34,far:150});
sun.shadow.bias=-.0006;sun.shadow.camera.updateProjectionMatrix();S.add(sun);sun.target.position.set(-3,0,16);S.add(sun.target);
let vseed=7;const vr=()=>{vseed=(vseed*16807)%2147483647;return vseed/2147483647}; // 꾸밈 배치(늘 같은 모양)
const M=(c,o={})=>new THREE.MeshLambertMaterial(Object.assign({color:c},o));
// 같이 쓰는 기하 · 재질(빼도 버리지 않음)과, 장면에서 빼면서 그 물체만의 기하 · 재질을 버리는 도우미(판을 거듭해도 쌓이지 않게)
const SHARED=new WeakSet();const share=(...a)=>{a.forEach(x=>x&&SHARED.add(x));return a[0]};
function disposeTree(o){if(!o)return;if(o.parent)o.parent.remove(o);
  o.traverse(c=>{if(c.geometry&&!SHARED.has(c.geometry))c.geometry.dispose();const m=c.material;if(m)(Array.isArray(m)?m:[m]).forEach(x=>{if(!SHARED.has(x))x.dispose()})})}

// 꾸밈은 색마다 한 덩어리로 합쳐 그리기 수를 줄인다
function DecoBatch(){this.b=new Map()}
DecoBatch.prototype.add=function(geo,color,x,y,z,o={}){
  const key=color+'|'+(o.basic?1:0)+'|'+(o.shadow===false?0:1)+'|'+(o.op||1);
  const m=new THREE.Matrix4().compose(new V3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx||0,o.ry||0,o.rz||0)),new V3(o.sx||1,o.sy||1,o.sz||1));
  const g=(geo.index?geo.toNonIndexed():geo.clone());g.applyMatrix4(m);
  if(!this.b.has(key))this.b.set(key,{color,o,arr:[]});this.b.get(key).arr.push(g.attributes.position.array);
};
DecoBatch.prototype.flush=function(parent){
  for(const {color,o,arr} of this.b.values()){
    let n=0;arr.forEach(a=>n+=a.length);const pos=new Float32Array(n);let k=0;arr.forEach(a=>{pos.set(a,k);k+=a.length});
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.computeVertexNormals();
    const mat=o.basic?new THREE.MeshBasicMaterial({color,transparent:!!o.op,opacity:o.op||1}):new THREE.MeshLambertMaterial({color,transparent:!!o.op,opacity:o.op||1});
    const me=new THREE.Mesh(g,mat);me.castShadow=o.shadow!==false;me.receiveShadow=true;parent.add(me);
  }
  this.b.clear();
};
function tex(draw,w=128,h=128){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');draw(x,w,h);return new THREE.CanvasTexture(c)}
let tseed=7;const tr=()=>{tseed=(tseed*16807)%2147483647;return tseed/2147483647};
const drawWood=(x,w,h)=>{x.fillStyle='#c98a45';x.fillRect(0,0,w,h);for(let i=0;i<4;i++){x.fillStyle=i%2?'#bd7d3a':'#d39552';x.fillRect(0,i*32,w,30);x.fillStyle='#7a4a1e';x.fillRect(0,i*32+30,w,2)}x.strokeStyle='#5a3412';x.lineWidth=6;x.strokeRect(3,3,w-6,h-6);x.fillStyle='#4a2a10';[[12,12],[w-12,12],[12,h-12],[w-12,h-12]].forEach(([a,b])=>{x.beginPath();x.arc(a,b,4,0,7);x.fill()})};
const drawStone=(x,w,h)=>{x.fillStyle='#a3a7ab';x.fillRect(0,0,w,h);for(let i=0;i<260;i++){x.fillStyle=`rgba(${tr()>.5?255:40},${tr()>.5?255:40},${tr()>.5?255:40},.06)`;x.fillRect(tr()*w,tr()*h,6,6)}x.strokeStyle='#6d7378';x.lineWidth=3;x.strokeRect(2,2,w-4,h-4);x.beginPath();x.moveTo(0,h/2);x.lineTo(w,h/2);x.moveTo(w/2,0);x.lineTo(w/2,h/2);x.moveTo(w/4,h/2);x.lineTo(w/4,h);x.stroke()};
const drawIce=(x,w,h)=>{const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#e8fbff');g.addColorStop(1,'#a6e0f5');x.fillStyle=g;x.fillRect(0,0,w,h);x.strokeStyle='rgba(255,255,255,.9)';x.lineWidth=4;x.beginPath();x.moveTo(20,10);x.lineTo(50,60);x.lineTo(40,110);x.moveTo(90,20);x.lineTo(110,70);x.stroke();x.strokeStyle='#7cc4df';x.lineWidth=4;x.strokeRect(2,2,w-4,h-4)};
// 금: 0 · 1 · 2 단계
const drawCrack=(x,w,h,lv,col)=>{x.strokeStyle=col;x.lineCap='round';x.lineJoin='round';
  const paths=lv===1?[[[64,6],[58,34],[70,52],[60,78]],[[58,34],[36,46]]]:[[[64,6],[58,34],[70,52],[60,78],[72,104],[66,122]],[[58,34],[30,44],[16,62]],[[70,52],[98,60],[118,48]],[[60,78],[34,92]],[[72,104],[100,110]],[[6,20],[26,30]]];
  x.lineWidth=lv===1?4:5;paths.forEach(p=>{x.beginPath();x.moveTo(p[0][0],p[0][1]);p.slice(1).forEach(q=>x.lineTo(q[0],q[1]));x.stroke()})};
const BLOCKMAT={};
{ // 결: 캔버스 256 에 코드로 그린 결(바로) → 힉스필드 결 그림(tex_*.webp)을 받으면 그 위에 다시 그림. 금 간 표시는 그대로 얹는다
  const base={wood:drawWood,stone:drawStone,ice:drawIce},crack={wood:'#3a1e08',stone:'#3e4246',ice:'#ffffff'};
  for(const k of ['wood','stone','ice']){
    const cv=[];
    BLOCKMAT[k]=[0,1,2].map(lv=>{tseed=7;const t=tex((x,w,h)=>{x.scale(2,2);base[k](x,128,128);if(lv)drawCrack(x,128,128,lv,crack[k])},256,256);cv.push(t);
      return share(k==='ice'?new THREE.MeshLambertMaterial({map:t,transparent:true,opacity:.86}):new THREE.MeshLambertMaterial({map:t}))});
    artWhen('tex_'+k,im=>cv.forEach((t,lv)=>{const c=t.image,x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,256,256);x.drawImage(im,0,0,256,256);
      if(k==='ice'){x.fillStyle='rgba(230,250,255,.18)';x.fillRect(0,0,256,256)}x.scale(2,2);if(lv)drawCrack(x,128,128,lv,crack[k]);t.needsUpdate=true}));
  }
}
// 땅: 노는 자리(새총 ~ 요새)는 평평(물리 바닥 y=0 과 맞춤)
function groundH(x,z){let y=Math.sin(x*.05)*.6+Math.cos(z*.07)*.5;if(z<-5||z>40)y+=Math.max(0,(Math.abs(x)-60)*.05);y-=.6;if(z>44)y-=1.2;
  const f=clamp(1-Math.max(0,Math.abs(x+4)-16)/10,0,1)*clamp(1-Math.max(0,z-38)/5,0,1)*clamp(1-Math.max(0,-12-z)/8,0,1);return lerp(y,-.02,f)}
{
  const gg=new THREE.PlaneGeometry(400,400,100,100);gg.rotateX(-Math.PI/2);
  const p=gg.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,groundH(p.getX(i),p.getZ(i)));gg.computeVertexNormals();
  const gm=new THREE.Mesh(gg,M(0x5fb043));gm.receiveShadow=true;S.add(gm);
  const river=new THREE.Mesh(new THREE.PlaneGeometry(400,18),new THREE.MeshLambertMaterial({color:0x3aa7e0,transparent:true,opacity:.95}));river.rotation.x=-Math.PI/2;river.rotation.z=-.18;river.position.set(0,-.55,52);S.add(river);
  var GROUND_MESH=gm,RIVER_MESH=river;
}
const DECO_F=new THREE.Group(),DECO_S=new THREE.Group();S.add(DECO_F);S.add(DECO_S);DECO_S.visible=false;
const deco=new DecoBatch();
for(let i=0;i<40;i++)deco.add(new THREE.CircleGeometry(.5+vr()*.6,6),0xffffff,-80+vr()*160,-.5,46+vr()*12,{basic:1,op:.5,shadow:false,rx:-Math.PI/2,sy:.25});
deco.add(new THREE.PlaneGeometry(400,30),0xa8d07a,0,-.4,70,{rx:-Math.PI/2,shadow:false});
for(let i=0;i<9;i++){const h=18+vr()*22;deco.add(new THREE.ConeGeometry(14+vr()*12,h,5),i%2?0x7fa6b8:0x92b6c4,-110+i*28,h/2-2,120+vr()*20,{shadow:false})}
{ // 꽃(인스턴스)
  const n=300,fm=new THREE.InstancedMesh(new THREE.SphereGeometry(.09,5,4),new THREE.MeshBasicMaterial({color:0xffffff}),n);
  const mm=new THREE.Matrix4(),cols=[0xffffff,0xfff07a,0xffb3d1,0xc9b3ff].map(c=>new THREE.Color(c));
  for(let i=0;i<n;i++){const x=-30+vr()*60,z=-6+vr()*42;mm.makeTranslation(x,groundH(x,z)+.06,z);fm.setMatrixAt(i,mm);fm.setColorAt(i,cols[i%4])}
  DECO_F.add(fm);
}
function pine(B,x,z,s=1){const y0=groundH(x,z);B.add(new THREE.CylinderGeometry(.25*s,.35*s,1.6*s,6),0x7a4a26,x,y0+.6*s,z);for(let k=0;k<3;k++)B.add(new THREE.ConeGeometry((1.9-k*.45)*s,(2.1-k*.3)*s,7),k%2?0x2f9a3e:0x37ab48,x,y0+(1.9+k*1.15)*s,z)}
function round(B,x,z,s=1){const y0=groundH(x,z);B.add(new THREE.CylinderGeometry(.18*s,.24*s,2.4*s,6),0xefe8da,x,y0+1.1*s,z);B.add(new THREE.IcosahedronGeometry(1.4*s,0),0x9ad24a,x,y0+2.9*s,z)}
function maple(B,x,z,s=1){const y0=groundH(x,z);B.add(new THREE.CylinderGeometry(.22*s,.3*s,2*s,6),0x6a3c1e,x,y0+.9*s,z);B.add(new THREE.DodecahedronGeometry(1.5*s,0),0xe8762c,x,y0+2.8*s,z);B.add(new THREE.DodecahedronGeometry(1.0*s,0),0xf0a23a,x+.8*s,y0+3.4*s,z-.3)}
[[-9,10],[-6,18],[-12,26],[-4,34],[12,36],[18,30],[24,40],[-16,40],[6,44],[30,34],[-22,30],[16,46],[8,20],[-24,18],[-20,40]].filter(([x,z])=>!(x>-19&&x<6&&z>4&&z<38)).forEach(([x,z],i)=>(i%3==0?maple:i%3==1?pine:round)(deco,x,z,1+vr()*.5));
for(let i=0;i<14;i++)pine(deco,-40+i*7+vr()*3,62+vr()*6,1.3+vr()*.5);
for(let i=0;i<10;i++)maple(deco,-38+i*8,58+vr()*3,1.2);
for(let i=0;i<8;i++){const x=-14+vr()*28,z=4+vr()*30;deco.add(new THREE.DodecahedronGeometry(.4+vr()*.5,0),0x9b9a92,x,-.2,z,{sy:.6})}
deco.flush(DECO_F);
// 코드로 그린 먼 산(원뿔) — 배경 그림이 보이면 숨긴다(그림 속 산과 겹치지 않게)
const FAR_MOUNT=[];
/* 안개 늪 꾸밈: 마른 나무 · 버드나무 · 부들 · 버섯 · 연잎 · 낮은 안개 */
{
  const D=new DecoBatch();
  const dead=(x,z,s)=>{const y0=groundH(x,z);D.add(new THREE.CylinderGeometry(.18*s,.32*s,4*s,5),0x4a3a2c,x,y0+2*s,z);
    D.add(new THREE.CylinderGeometry(.08*s,.14*s,1.8*s,4),0x4a3a2c,x+.6*s,y0+3.2*s,z,{rz:-.8});D.add(new THREE.CylinderGeometry(.07*s,.12*s,1.5*s,4),0x4a3a2c,x-.5*s,y0+2.6*s,z,{rz:.9})};
  const willow=(x,z,s)=>{const y0=groundH(x,z);D.add(new THREE.CylinderGeometry(.25*s,.35*s,2.4*s,6),0x5a4630,x,y0+1.1*s,z);
    D.add(new THREE.ConeGeometry(2*s,3.4*s,7),0x4f7a3a,x,y0+3.2*s,z,{rx:Math.PI});D.add(new THREE.DodecahedronGeometry(1.3*s,0),0x5e8a44,x,y0+4.4*s,z)};
  const reeds=(x,z)=>{const y0=groundH(x,z);for(let k=0;k<5;k++){const dx=(vr()-.5)*.9,dz=(vr()-.5)*.9,h=1.2+vr()*.8;D.add(new THREE.CylinderGeometry(.03,.04,h,4),0x6f8f3a,x+dx,y0+h/2,z+dz);D.add(new THREE.CylinderGeometry(.08,.08,.35,5),0x6a4020,x+dx,y0+h-.1,z+dz)}};
  const shroom=(x,z,s)=>{const y0=groundH(x,z);D.add(new THREE.CylinderGeometry(.12*s,.16*s,.6*s,6),0xf0e6d0,x,y0+.3*s,z);D.add(new THREE.SphereGeometry(.42*s,8,5,0,Math.PI*2,0,Math.PI/2),0xd8443a,x,y0+.55*s,z)};
  [[-9,10],[-6,18],[-12,26],[-4,34],[12,36],[18,30],[24,40],[-16,40],[6,44],[30,34],[-22,30],[16,46],[8,20],[-24,18],[-20,40]].filter(([x,z])=>!(x>-19&&x<6&&z>4&&z<38)).forEach(([x,z],i)=>(i%2?dead:willow)(x,z,1+vr()*.4));
  for(let i=0;i<14;i++)(i%3?willow:dead)(-40+i*7+vr()*3,62+vr()*6,1.2+vr()*.4);
  for(let i=0;i<16;i++){const x=-24+vr()*40,z=-4+vr()*42;if(x>-19&&x<6&&z>4&&z<36)continue;reeds(x,z)}
  for(let i=0;i<30;i++){const x=-28+vr()*50,z=-6+vr()*44;if(x>-17&&x<4&&z>8&&z<34)continue;shroom(x,z,.7+vr()*.6)}
  for(let i=0;i<24;i++)D.add(new THREE.CircleGeometry(.6+vr()*.6,7),0x3f7a3a,-60+vr()*120,-.5,46+vr()*12,{rx:-Math.PI/2,shadow:false});
  for(let i=0;i<9;i++){const h=18+vr()*22;D.add(new THREE.ConeGeometry(14+vr()*12,h,5),i%2?0x7f8f88:0x8f9c94,-110+i*28,h/2-2,120+vr()*20,{shadow:false})}
  for(let i=0;i<10;i++)D.add(new THREE.PlaneGeometry(40,6),0xf2f5ee,-70+i*16,.8+vr()*.8,40+vr()*30,{basic:1,op:.22,shadow:false,rx:-Math.PI/2+.2});
  D.flush(DECO_S);
}
for(const [G_,cols] of [[DECO_F,[0x7fa6b8,0x92b6c4]],[DECO_S,[0x7f8f88,0x8f9c94]]])G_.children.forEach(c=>{if(c.material&&c.material.color&&cols.includes(c.material.color.getHex()))FAR_MOUNT.push(c)});
const THEMES={
  forest:{sky:0x8fd0f5,fog:0xbfe4f7,near:60,far:170,ground:0x5fb043,river:0x3aa7e0,hemi:0xdff2ff},
  swamp:{sky:0xa7c2bd,fog:0xc3d2c8,near:30,far:120,ground:0x5f7f44,river:0x4f8a7a,hemi:0xe0ece4},
};
let themeNow='';
function setTheme(k){if(themeNow===k)return;themeNow=k;const t=THEMES[k];S.background.setHex(t.sky);S.fog.color.setHex(t.fog);S.fog.near=t.near;S.fog.far=t.far;
  GROUND_MESH.material.color.setHex(t.ground);RIVER_MESH.material.color.setHex(t.river);HEMI.color.setHex(t.hemi);DECO_F.visible=k==='forest';DECO_S.visible=k==='swamp';$('stage').style.background='#'+t.sky.toString(16).padStart(6,'0')}

/* 먼 배경(하늘 · 먼 산): 힉스필드 배경 그림을 요새 너머 큰 원통 안쪽에 붙인다(안개 무시 · 조금 비침). 그림 아래 38%(풀밭)는 잘라 쓴다.
 * 그림을 못 받으면 원통을 숨긴 채 — 지금까지처럼 색 하늘 + 코드 산 */
const BACKDROP=(()=>{const R0=185,TH=170*DEG,CROP=.38,REP=2.6;
  const H=R0*TH/REP*9/16*(1-CROP); // 그림 한 장 = 호의 1/2.6(좌우 거울로 되풀이) — 먼 산이 지평선 바로 위에 작게 보이게
  const geo=new THREE.CylinderGeometry(R0,R0,H,64,1,true,-TH/2,TH);
  const mat=new THREE.MeshBasicMaterial({color:0xffffff,fog:false,transparent:true,opacity:.92,depthWrite:false,side:THREE.BackSide});
  const m=new THREE.Mesh(geo,mat);m.position.set(-4,H/2-7,8);m.visible=false;m.renderOrder=-1;S.add(m);
  const T={};let want='';
  return{set(n){want=n;if(T[n]){mat.map=T[n];mat.needsUpdate=true;mat.opacity=n==='bg_marsh'?.8:.92;m.visible=true;FAR_MOUNT.forEach(c=>c.visible=false);return}m.visible=false;FAR_MOUNT.forEach(c=>c.visible=true);
      artWhen(n,im=>{if(!T[n]){const t=new THREE.Texture(im);t.wrapS=THREE.MirroredRepeatWrapping;t.repeat.set(REP,1-CROP);t.offset.set(0,CROP);t.needsUpdate=true;T[n]=t}if(want===n)BACKDROP.set(n)})},
    mesh:m}})();
function setBackdrop(n){BACKDROP.set(n)}
// 새총(시안 그대로)
const SL=new THREE.Group();S.add(SL);SL.position.set(-1.6,0,0);
{
  const bark=M(0x8a5428),rope=M(0xd9b27a),knob=M(0xf0c04a);
  const part=(g,m,x,y,z,rz=0)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.rotation.z=rz;o.castShadow=true;SL.add(o);return o};
  part(new THREE.CylinderGeometry(.42,.55,3.4,7),bark,0,1.5,0);
  for(let k=0;k<6;k++)part(new THREE.TorusGeometry(.47,.07,4,10),rope,0,.6+k*.35,0).rotation.x=Math.PI/2;
  part(new THREE.CylinderGeometry(.25,.36,2,6),bark,-.6,3.9,0,.45);part(new THREE.CylinderGeometry(.25,.36,2,6),bark,.6,3.9,0,-.45);
  part(new THREE.SphereGeometry(.38,7,6),knob,-1.05,4.85,0);part(new THREE.SphereGeometry(.38,7,6),knob,1.05,4.85,0);
}
const TIPS=[new V3(-1.6-1.05,4.85,0),new V3(-1.6+1.05,4.85,0)];
const bandMat=new THREE.MeshLambertMaterial({color:0x4a2a12});
const bands=TIPS.map(()=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1,5),bandMat);o.castShadow=true;S.add(o);return o});
const pouch=new THREE.Mesh(new THREE.BoxGeometry(.5,.08,.22),M(0x5a3418));pouch.castShadow=true;S.add(pouch);
const _up=new V3(0,1,0);
function setBand(o,a,b){const d=new V3().subVectors(b,a);const L=d.length();o.position.copy(a).addScaledVector(d,.5);o.scale.set(1,Math.max(L,.01),1);o.quaternion.setFromUnitVectors(_up,d.normalize())}

// 곰 · 너구리 모델(시안 그대로). 곰은 몸 가운데가 원점(물리 공과 맞춤)
function bearModel(s=1,col=0xa86a34,extra){const outer=new THREE.Group();const g=new THREE.Group();g.position.y=-1.05*s;g.scale.setScalar(s);outer.add(g);
  const add=(geo,m,a,b,c)=>{const o=new THREE.Mesh(geo,m);o.position.set(a,b,c);o.castShadow=true;g.add(o);return o};
  const fur=M(col),light=M(0xe8c48e),dark=M(0x2a1a0e);
  add(new THREE.SphereGeometry(.75,10,8),fur,0,.75,0).scale.set(1,.95,.9);
  add(new THREE.SphereGeometry(.5,8,6),light,0,.65,-.4).scale.set(1,1,.5);
  add(new THREE.SphereGeometry(.55,10,8),fur,0,1.75,0);
  add(new THREE.SphereGeometry(.2,6,5),fur,-.4,2.2,0);add(new THREE.SphereGeometry(.2,6,5),fur,.4,2.2,0);
  add(new THREE.SphereGeometry(.24,7,6),light,0,1.62,-.45).scale.z=.7;
  add(new THREE.SphereGeometry(.08,5,4),dark,0,1.7,-.62);add(new THREE.SphereGeometry(.06,5,4),dark,-.2,1.88,-.48);add(new THREE.SphereGeometry(.06,5,4),dark,.2,1.88,-.48);
  add(new THREE.TorusGeometry(.48,.11,5,12),M(0xd83a2e),0,1.3,0).rotation.x=Math.PI/2;
  add(new THREE.SphereGeometry(.22,6,5),fur,-.75,.9,-.1);add(new THREE.SphereGeometry(.22,6,5),fur,.75,.9,-.1);
  add(new THREE.SphereGeometry(.26,6,5),fur,-.35,.05,-.1);add(new THREE.SphereGeometry(.26,6,5),fur,.35,.05,-.1);
  if(extra)extra(add,outer);return outer}
// 곰 종류마다 덧붙이는 것(꿀단지 · 냄비 뚜껑 방패 · 큰곰 머리띠)
const POT_GEO=new THREE.SphereGeometry(.38,9,7),POT_MAT=M(0xf2a81c,{emissive:0x402000}),POT_LID=M(0x8a4a1a);share(POT_GEO,POT_MAT,POT_LID);
function honeyPot(s=1){const g=new THREE.Group();const a=new THREE.Mesh(POT_GEO,POT_MAT);a.scale.set(s,s*.9,s);a.castShadow=true;g.add(a);
  const l=new THREE.Mesh(new THREE.CylinderGeometry(.22*s,.26*s,.14*s,8),POT_LID);l.position.y=.36*s;g.add(l);
  const d=new THREE.Mesh(new THREE.SphereGeometry(.12*s,6,5),POT_MAT);d.position.set(.18*s,.05*s,-.32*s);g.add(d);return g}
const BEAR_EXTRA={
  bomb:(add,outer)=>{const p=honeyPot(.9);p.position.set(.7,.9,-.35);outer.children[0].add(p);outer.userData.pot=p},
  shield:(add,outer)=>{add(new THREE.CylinderGeometry(.32,.32,.1,10),M(0x9aa4ad),0,2.25,0);
    const sh=new THREE.Group();const disc=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.05,.14,14),M(0xb8c2cb));disc.rotation.x=Math.PI/2;sh.add(disc);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(1.05,.09,5,16),M(0x5a6670));sh.add(rim);const kn=new THREE.Mesh(new THREE.SphereGeometry(.2,6,5),M(0x2a1a0e));kn.position.z=-.12;sh.add(kn);
    sh.position.set(0,1.2,-.85);sh.visible=false;outer.children[0].add(sh);outer.userData.shield=sh},
  giant:(add)=>{add(new THREE.TorusGeometry(.5,.1,5,12),M(0xffd23a),0,2.0,0).rotation.x=Math.PI/2;add(new THREE.SphereGeometry(.3,6,5),M(0x7a4520),-.85,1.2,-.3).scale.set(1.3,1.3,1.3);add(new THREE.SphereGeometry(.3,6,5),M(0x7a4520),.85,1.2,-.3).scale.set(1.3,1.3,1.3)},
};
const bearScale=t=>t==='giant'?.62*GIANT_R/BEAR_R:.62;
const makeBear=t=>bearModel(bearScale(t),BEARS[t].col,BEAR_EXTRA[t]);
const COON_GEO=(()=>{const o={};o.body=new THREE.SphereGeometry(.42,8,6);o.head=new THREE.SphereGeometry(.38,9,7);o.ear=new THREE.ConeGeometry(.13,.28,4);o.muz=new THREE.SphereGeometry(.2,6,5);o.mask=new THREE.BoxGeometry(.72,.14,.2);o.eye=new THREE.SphereGeometry(.05,4,4);o.nose=new THREE.SphereGeometry(.06,4,4);o.hat=new THREE.ConeGeometry(.42,.12,10);o.tail=[0,1,2,3].map(k=>new THREE.SphereGeometry(.16-k*.01,6,5));return o})();
const COON_MAT={fur:M(0x8d8a86),wh:M(0xf2efe8),dk:M(0x2e2a28),eye:M(0xffffff),hat:M(0x3a5a2a)};
share(...Object.values(COON_GEO).flat(),...Object.values(COON_MAT));
// 너구리 몸 상자 가운데가 원점(키 1.4 → 발은 -0.7)
function coonModel(){const outer=new THREE.Group();const g=new THREE.Group();g.position.y=-.7;outer.add(g);const G_=COON_GEO,Mt=COON_MAT;
  const add=(geo,m,a,b,c)=>{const o=new THREE.Mesh(geo,m);o.position.set(a,b,c);o.castShadow=true;g.add(o);return o};
  add(G_.body,Mt.fur,0,.45,0);add(G_.head,Mt.fur,0,1.05,0);add(G_.ear,Mt.dk,-.25,1.42,0);add(G_.ear,Mt.dk,.25,1.42,0);
  add(G_.muz,Mt.wh,0,.98,-.3).scale.z=.7;add(G_.mask,Mt.dk,0,1.1,-.28);add(G_.eye,Mt.eye,-.14,1.11,-.39);add(G_.eye,Mt.eye,.14,1.11,-.39);
  add(G_.nose,Mt.dk,0,.95,-.46);add(G_.hat,Mt.hat,0,1.38,0);for(let k=0;k<4;k++)add(G_.tail[k],k%2?Mt.dk:Mt.fur,0,.35+k*.12,.45+k*.12);
  return outer}

// 궤적 점선
const DOTS=30;
const dots=new THREE.InstancedMesh(new THREE.SphereGeometry(.13,6,5),new THREE.MeshBasicMaterial({color:0xffffff}),DOTS);dots.count=0;dots.frustumCulled=false;S.add(dots);

/* ───────── 3. 물리 ───────── */
let world,groundBody,PM;
function resetIds(){try{CANNON.Body.idCounter=0;CANNON.Shape.idCounter=0;CANNON.Material.idCounter=0;if(CANNON.Equation)CANNON.Equation.idCounter=0;if(CANNON.ContactMaterial)CANNON.ContactMaterial.idCounter=0}catch(e){}}
function makeWorld(){
  resetIds();
  world=new CANNON.World({gravity:new CANNON.Vec3(0,G,0)});
  world.allowSleep=true;
  world.broadphase=new CANNON.SAPBroadphase(world);world.broadphase.axisIndex=0;
  world.solver.iterations=14;world.solver.tolerance=1e-6;
  PM={ground:new CANNON.Material('ground'),wood:new CANNON.Material('wood'),stone:new CANNON.Material('stone'),ice:new CANNON.Material('ice'),bear:new CANNON.Material('bear'),enemy:new CANNON.Material('enemy')};
  world.defaultContactMaterial.friction=.55;world.defaultContactMaterial.restitution=.04;
  world.defaultContactMaterial.contactEquationStiffness=5e7;world.defaultContactMaterial.contactEquationRelaxation=3;
  const cm=(a,b,f,r)=>world.addContactMaterial(new CANNON.ContactMaterial(PM[a],PM[b],{friction:f,restitution:r,contactEquationStiffness:5e7,contactEquationRelaxation:3}));
  for(const k of ['ground','wood','stone','enemy','bear'])cm('ice',k,.1,.04);cm('ice','ice',.06,.04);
  for(const k of ['ground','wood','stone','enemy'])cm('bear',k,.5,.18);
  cm('stone','stone',.65,.02);cm('stone','ground',.7,.02);cm('wood','ground',.6,.03);
  // 바닥: 노는 자리만(그 밖은 강 · 낭떠러지 — 떨어지면 물에 빠짐)
  groundBody=new CANNON.Body({mass:0,material:PM.ground});
  groundBody.addShape(new CANNON.Box(new CANNON.Vec3(36,1,29)),new CANNON.Vec3(0,-1,0));
  groundBody.position.set(-4,0,14);world.addBody(groundBody);
}

/* ───────── 4. 판 상태 ───────── */
const game={level:null,phase:'intro',blocks:[],enemies:[],bear:null,queue:[],shotIdx:0,steps:0,shotStep:0,quiet:0,
  enemiesLeft:0,broken:0,gold:0,shotBroken:0,shotCrumble:false,result:null,introT:0,aimReadyT:0};
const fortG=new THREE.Group();S.add(fortG);
let loadedBear=null; // 새총에 얹힌 곰 그림(쏘면 날아가는 곰이 된다)

let shotMeshes=[]; // 이 판에 쏜 곰 · 꿀단지 그림(판을 바꿀 때 남김없이 뺀다)
function clearLevel(){
  // 요새 꾸밈 · 블록 · 너구리(쓰러져 이미 빠진 것도) · 쏜 곰 · 꿀단지 그림을 빼고, 그것만의 기하 · 재질은 버린다
  const objs=new Set(fortG.children);game.blocks.forEach(o=>objs.add(o.mesh));game.enemies.forEach(o=>objs.add(o.mesh));
  if(game.bear)objs.add(game.bear.mesh);if(game.pot)objs.add(game.pot.mesh);shotMeshes.forEach(m=>objs.add(m));
  objs.forEach(disposeTree);shotMeshes=[];
  game.blocks=[];game.enemies=[];game.bear=null;game.pot=null;game.loadN=(game.loadN|0)+1;
  fx.clear();
}
const boxGeoCache=new Map();
const boxGeo=(w,h,d)=>{const k=w+','+h+','+d;if(!boxGeoCache.has(k))boxGeoCache.set(k,share(new THREE.BoxGeometry(w,h,d)));return boxGeoCache.get(k)};
function addBlock(spec,awake){
  const [mat,w,h,d,x,yb,z]=spec;const m=MATS[mat];
  const b=new CANNON.Body({mass:m.dens*w*h*d,material:PM[mat],allowSleep:true,sleepSpeedLimit:.2,sleepTimeLimit:.5,angularDamping:.08,linearDamping:.01,collisionFilterGroup:2});
  b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2)));b.position.set(FX+x,yb+h/2,FZ+z);
  world.addBody(b);if(!awake)b.sleep();
  const mesh=new THREE.Mesh(boxGeo(w,h,d),BLOCKMAT[mat][0]);mesh.castShadow=true;mesh.receiveShadow=true;fortG.add(mesh);
  const blk={kind:'block',mat,w,h,d,body:b,mesh,hp:m.hp,maxhp:m.hp,crack:0,alive:true,start:b.position.clone(),inWorld:true};
  b.userData=blk;game.blocks.push(blk);syncMesh(blk);return blk;
}
function addEnemy(spec,awake){
  const [x,yb,z,rot,hp]=spec;const boss=!!hp,K=boss?BOSS:ENEMY;
  const b=new CANNON.Body({mass:K.mass,material:PM.enemy,allowSleep:true,sleepSpeedLimit:.2,sleepTimeLimit:.5,angularDamping:.1,collisionFilterGroup:4});
  b.addShape(new CANNON.Box(new CANNON.Vec3(K.w/2,K.h/2,K.w/2)));b.position.set(FX+x,yb+K.h/2,FZ+z);
  b.quaternion.setFromEuler(0,(rot||0)*DEG,0);world.addBody(b);if(!awake)b.sleep();
  const mesh=boss?bossModel():coonModel();fortG.add(mesh);
  const en={kind:'enemy',boss,hp:hp||1,maxhp:hp||1,cool:0,body:b,mesh,alive:true,start:b.position.clone(),dieT:0,inWorld:true};b.userData=en;game.enemies.push(en);syncMesh(en);return en;
}
// 두목 너구리: 졸개보다 크고 금관 · 빨간 망토
function bossModel(){const outer=new THREE.Group();const inner=coonModel();const s=BOSS.h/ENEMY.h;inner.scale.setScalar(s);outer.add(inner);
  const g=new THREE.Group();g.position.y=-BOSS.h/2;outer.add(g);
  const crown=new THREE.Mesh(new THREE.CylinderGeometry(.34,.4,.3,8,1,true),M(0xffc928,{emissive:0x553300,side:THREE.DoubleSide}));crown.position.y=2.2;g.add(crown);
  for(let k=0;k<5;k++){const sp=new THREE.Mesh(new THREE.ConeGeometry(.08,.22,4),M(0xffc928));const a=k/5*Math.PI*2;sp.position.set(Math.sin(a)*.36,2.45,Math.cos(a)*.36);g.add(sp)}
  const cape=new THREE.Mesh(new THREE.CylinderGeometry(.5,.85,1.3,8,1,true,Math.PI*.15,Math.PI*1.7),M(0xc8352e,{side:THREE.DoubleSide}));cape.position.set(0,.95,.05);g.add(cape);
  inner.children[0].children.forEach(o=>{if(o.material===COON_MAT.hat)o.visible=false});
  return outer}
function addFence(B,x1,z1,x2,z2){
  const L=Math.hypot(x2-x1,z2-z1),n=Math.max(2,Math.round(L/.48));
  for(let i=0;i<=n;i++){const t=i/n,x=FX+lerp(x1,x2,t),z=FZ+lerp(z1,z2,t),h=2+(i%3)*.25;
    B.add(new THREE.CylinderGeometry(.22,.24,h,6),0xc07a3c,x,h/2-.3,z);B.add(new THREE.ConeGeometry(.22,.5,6),0xc88a4a,x,h-.05,z)}
  // 울타리는 움직이지 않는 벽(얇은 상자)
  const wb=new CANNON.Body({mass:0,material:PM.wood});wb.addShape(new CANNON.Box(new CANNON.Vec3(L/2,1.1,.22)));
  wb.position.set(FX+(x1+x2)/2,1.1,FZ+(z1+z2)/2);wb.quaternion.setFromEuler(0,-Math.atan2(z2-z1,x2-x1),0);world.addBody(wb);
}
function addBanner(B,x,z){x+=FX;z+=FZ;B.add(new THREE.CylinderGeometry(.06,.06,6,5),0x4a3020,x,2.7,z);B.add(new THREE.SphereGeometry(.14,6,5),0xf0c04a,x,5.75,z);
  B.add(new THREE.PlaneGeometry(1.1,1.9),0xe0682a,x+.6,4.6,z);B.add(new THREE.CircleGeometry(.3,10),0xfff2cf,x+.6,4.75,z-.02,{basic:1,shadow:false})}

function loadLevel(id,opts={}){
  clearLevel();makeWorld();
  const L=levelById(id);game.level=L;setTheme(L.region||'forest');setBackdrop(L.id===10?'bg_castle':L.region==='swamp'?'bg_marsh':'bg_forest');
  const B=new DecoBatch();(L.fence||[]).forEach(f=>addFence(B,...f));(L.banners||[]).forEach(b=>addBanner(B,...b));
  const dg=new THREE.Group();B.flush(dg);dg.children.forEach(c=>{c.userData.own=1;if(c.material.side!==undefined)c.material.side=THREE.DoubleSide});fortG.add(dg);
  L.blocks.forEach(s=>addBlock(s,opts.awake));L.enemies.forEach(s=>addEnemy(s,opts.awake));
  applyUp();game.queue=L.bears.slice();if(typeof L.id==='number')for(let i=0;i<UP.horn;i++)game.queue.push('basic'); // 출정 나팔: 줄 끝에 보통 곰
  game.shotIdx=0;game.steps=0;game.shotStep=0;game.quiet=0;game.pot=null;game.tapReq=false;game.tapAt=null;game.ev=[];
  game.enemiesLeft=game.enemies.length;game.broken=0;game.gold=0;game.result=null;game.shotBroken=0;game.shotCrumble=false;
  game.phase=opts.skipIntro?'aim':'intro';game.introT=0;game.aimReadyT=opts.skipIntro?1:0;
  setView(L.view||1);
  ui.level(L);ui.enemies(game.enemiesLeft,false);ui.gold(0);ui.slots();ui.overlay(null);ui.boss();
  loadBearIntoSling();
  if(opts.skipIntro){camSnap(AIM_POS,AIM_LOOK);ui.banner(false)}else{ui.banner(true,L)}
  ui.hint(false);
}
function loadBearIntoSling(){
  if(loadedBear){disposeTree(loadedBear);loadedBear=null}
  const t=game.queue[game.shotIdx];if(!t)return;
  loadedBear=makeBear(t);loadedBear.position.copy(P0);loadedBear.scale.setScalar(.01);loadedBear.userData.pop=0;S.add(loadedBear);
}
function syncMesh(o){const p=o.body.position,q=o.body.quaternion;o.mesh.position.set(p.x,p.y,p.z);o.mesh.quaternion.set(q.x,q.y,q.z,q.w)}

/* 쏘기(물리 쪽 — 시험 걸이도 이것을 부른다). yawOff: 기준 방향에서 돌린 각(라디안, +는 화면 왼쪽), power 0~1
 * tapAt: 시험용 — 날아간 지 몇 걸음째에 화면을 누를지(null = 안 누름). 실제 놀이에서는 누른 다음 걸음에 발동 */
function launchDir(yawOff){const y=BASE_YAW+yawOff;return new V3(Math.sin(y)*Math.cos(PITCH),Math.sin(PITCH),Math.cos(y)*Math.cos(PITCH))}
const BEAR_MASK=1|2|4;
function shoot(yawOff,power,tapAt=null){
  if(game.phase!=='aim'||!game.queue[game.shotIdx])return false;
  yawOff=clamp(yawOff,-YAW_RANGE,YAW_RANGE);power=clamp(power,0,1);
  const type=game.queue[game.shotIdx],big=type==='giant';
  const v=launchDir(yawOff).multiplyScalar(powerToSpeed(power));
  const b=new CANNON.Body({mass:big?GIANT_M:BEAR_M,material:PM.bear,allowSleep:false,linearDamping:0,angularDamping:.5,collisionFilterGroup:8,collisionFilterMask:BEAR_MASK});
  b.addShape(new CANNON.Sphere(big?GIANT_R:BEAR_R));b.position.set(P0.x,P0.y,P0.z);b.velocity.set(v.x,v.y,v.z);b.angularVelocity.set(-4,0,0);
  world.addBody(b);
  const mesh=loadedBear||makeBear(type);mesh.scale.setScalar(1);loadedBear=null;if(!mesh.parent)S.add(mesh);shotMeshes.push(mesh);
  game.bear={kind:'bear',type,body:b,mesh,slow:0,gone:false,used:false,r:big?GIANT_R:BEAR_R,bounces:0,bounceN:0,cool:0,charge:0,pierced:0,dir:null};b.userData=game.bear;
  game.shotIdx++;for(const en of game.enemies)en.shotDmg=0;game.phase='flight';game.shotStep=0;game.quiet=0;game.shotBroken=0;game.shotCrumble=false;game.tapReq=false;game.tapAt=tapAt;
  ui.slots();ui.hint(false);fx.twang();
  return true;
}

/* ── 특수 곰 발동(날아가는 중 화면을 누르면) ── */
function canTap(){const br=game.bear;return !!(br&&!br.gone&&!br.used&&br.type!=='basic'&&(game.phase==='flight'||game.phase==='settle'))}
function activate(){
  const br=game.bear;if(!canTap())return false;
  br.used=true;const b=br.body,v=b.velocity;
  if(br.type==='bomb'){ // 꿀단지를 앞 아래로 던진다 — 닿으면 쾅
    const h=Math.hypot(v.x,v.z)||1;
    const pb=new CANNON.Body({mass:2,material:PM.bear,allowSleep:false,linearDamping:0,collisionFilterGroup:16,collisionFilterMask:BEAR_MASK});
    pb.addShape(new CANNON.Sphere(.38));pb.position.set(b.position.x,b.position.y-.3,b.position.z);
    pb.velocity.set(v.x+v.x/h*BOMB.throwFwd,Math.min(v.y,0)-BOMB.throwDown,v.z+v.z/h*BOMB.throwFwd);world.addBody(pb);
    const pm=honeyPot(1.1);S.add(pm);shotMeshes.push(pm);game.pot={kind:'pot',body:pb,mesh:pm,t:0};pb.userData=game.pot;
    if(br.mesh.userData.pot)br.mesh.userData.pot.visible=false;fx.say('던져라!',b.position,'sp-b');
  }else if(br.type==='shield'){ // 냄비 방패: 닿을 때마다 튕김
    br.bounces=UP.shieldN;br.cool=0;if(br.mesh.userData.shield)br.mesh.userData.shield.visible=true;fx.say('방패!',b.position,'sp-s');
  }else if(br.type==='giant'){ // 돌진: 앞으로 곧게 빨라지며 블록을 뚫는다
    const hz=Math.hypot(v.x,v.z);const d=new V3(v.x,v.y<0?Math.max(v.y*.5,-hz*.5):-hz*.12,v.z);/* 오르는 중이면 살짝 아래로(약 7°), 내려가는 중이면 그 반만큼 */if(d.lengthSq()<1e-6)d.set(0,0,1);d.normalize();
    br.dir=d;br.charge=GIANT.steps;br.pierced=0;b.collisionFilterMask=1;b.velocity.set(d.x*GIANT.speed,d.y*GIANT.speed,d.z*GIANT.speed);fx.say('돌진!',b.position,'sp-g');
  }
  game.ev.push(['tap',br.type,game.shotStep,+b.velocity.length().toFixed(2)]);ui.slots();snd('special',br.type);return true;
}
function endCharge(br,slow){game.ev.push(['chargeEnd',br.pierced,game.shotStep]);br.charge=0;br.body.collisionFilterMask=BEAR_MASK;if(slow)br.body.velocity.scale(slow,br.body.velocity)}

// 상자(돌아간) 와 점 사이 가장 가까운 거리
const _q=new CANNON.Quaternion(),_v=new CANNON.Vec3();
function boxDist(o,p){const b=o.body,sh=b.shapes[0].halfExtents;_v.set(p.x-b.position.x,p.y-b.position.y,p.z-b.position.z);b.quaternion.conjugate(_q);_q.vmult(_v,_v);
  const dx=Math.max(Math.abs(_v.x)-sh.x,0),dy=Math.max(Math.abs(_v.y)-sh.y,0),dz=Math.max(Math.abs(_v.z)-sh.z,0);return Math.sqrt(dx*dx+dy*dy+dz*dz)}

/* 쾅: 반경 안 블록 · 너구리에 거리에 따라 힘 · 피해(얼음 · 나무 잘 부서짐, 돌은 덜) */
function explode(p,toBreak,hitE){
  const Rb=UP.bombR;const n0=toBreak.length,e0=hitE.length;
  for(const o of [...game.blocks,...game.enemies]){if(!o.alive)continue;const d=boxDist(o,p);if(d>=Rb)continue;const k=1-d/Rb;const b=o.body;
    if(b.sleepState===CANNON.Body.SLEEPING)b.wakeUp();
    const dir=new CANNON.Vec3(b.position.x-p.x,b.position.y-p.y+.4,b.position.z-p.z);const L=dir.length()||1;dir.scale(1/L,dir);
    const dv=BOMB.push*k/(1+.04*b.mass);b.velocity.x+=dir.x*dv;b.velocity.y+=dir.y*dv;b.velocity.z+=dir.z*dv;
    b.angularVelocity.x+=dir.z*3*k;b.angularVelocity.z-=dir.x*3*k;
    if(o.kind==='block'){o.hp-=BOMB.dmg*k*BOMB.fac[o.mat];if(o.hp<=0)toBreak.push(o)}
    else if(k>BOMB.killK)hitE.push([o,'boom',k>(o.boss?.3:.45)?2:1]);
  }
  for(const o of world.bodies)if(o.type===CANNON.Body.DYNAMIC&&o.sleepState===CANNON.Body.SLEEPING&&o.position.distanceTo(new CANNON.Vec3(p.x,p.y,p.z))<Rb+1.2)o.wakeUp();
  game.ev.push(['boom',game.shotStep,+p.y.toFixed(2),toBreak.length-n0,hitE.length-e0]);fx.boom(p,Rb);
}

// 몸이 사라진 자리 둘레의 잠든 것을 깨운다(받치던 것이 없어지면 떨어지도록)
function wakeAround(body,pad=.35){
  body.updateAABB();const a=body.aabb;
  for(const o of world.bodies){if(o.type!==CANNON.Body.DYNAMIC||o===body||o.sleepState!==CANNON.Body.SLEEPING)continue;
    o.updateAABB();const c=o.aabb;
    if(c.lowerBound.x<=a.upperBound.x+pad&&c.upperBound.x>=a.lowerBound.x-pad&&c.lowerBound.y<=a.upperBound.y+pad&&c.upperBound.y>=a.lowerBound.y-pad&&c.lowerBound.z<=a.upperBound.z+pad&&c.upperBound.z>=a.lowerBound.z-pad)o.wakeUp()}
}
function removeObj(o){if(o.inWorld){world.removeBody(o.body);o.inWorld=false}}

/* 한 걸음(1/60초). 판정 · 금화 · 차례 넘김 · 특수 곰이 모두 여기서 — 화면 빠르기와 무관 */
const _pre=[];
function gameStep(){
  const br0=game.bear;
  // 0) 누름(실제 누름은 다음 걸음 첫머리에, 시험은 정해 둔 걸음에)
  if(br0&&(game.tapReq||(game.tapAt!=null&&game.shotStep===game.tapAt)))activate();
  game.tapReq=false;
  if(br0&&!br0.gone&&br0.charge>0){const b=br0.body,d=br0.dir;b.velocity.set(d.x*GIANT.speed,d.y*GIANT.speed,d.z*GIANT.speed);b.force.y-=b.mass*G} // 돌진 중엔 곧게(중력 상쇄)
  const bodies=world.bodies;
  for(let i=0;i<bodies.length;i++){const b=bodies[i];const v=b.velocity;_pre[i*3]=v.x;_pre[i*3+1]=v.y;_pre[i*3+2]=v.z}
  const nPre=bodies.length,preRef=bodies.slice();
  world.step(DT);
  game.steps++;
  const toBreak=[],hitE=[];
  let bearPre=null;
  // 1) 속도 변화로 맞은 세기 재기
  for(let i=0;i<nPre;i++){const b=preRef[i];const u=b.userData;if(!u)continue;
    if(u.kind==='bear'){bearPre=new CANNON.Vec3(_pre[i*3],_pre[i*3+1],_pre[i*3+2]);continue}
    if(b.sleepState===CANNON.Body.SLEEPING)continue;
    const v=b.velocity;const dx=v.x-_pre[i*3],dy=v.y-_pre[i*3+1]-G*DT,dz=v.z-_pre[i*3+2];const dv=Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(u.kind==='block'&&u.alive){const m=MATS[u.mat];if(dv>m.thr){u.hp-=(dv-m.thr);if(u.hp<=0)toBreak.push(u);else if(dv>m.thr*1.4)Snd.hit(u.mat,dv)}}
    else if(u.kind==='enemy'&&u.alive){if(dv>(u.boss?BOSS.dvHit:ENEMY.dvKill))hitE.push([u,'hit',1])}
  }
  // 2) 너구리를 누르는 힘(깔림) · 곰과 닿은 것
  const cs=world.contacts;const br=game.bear&&!game.bear.gone?game.bear:null;const bearHits=[];let potHit=false;
  for(let i=0;i<cs.length;i++){const c=cs[i];const a=c.bi.userData,b=c.bj.userData;
    if(br&&(c.bi===br.body||c.bj===br.body)){const other=c.bi===br.body?c.bj:c.bi;const n=c.bi===br.body?new CANNON.Vec3(-c.ni.x,-c.ni.y,-c.ni.z):c.ni.clone();bearHits.push([other,n])}
    if(game.pot&&(c.bi===game.pot.body||c.bj===game.pot.body))potHit=true;
    const en=a&&a.kind==='enemy'?a:b&&b.kind==='enemy'?b:null;if(!en||!en.alive)continue;
    const other=en===a?c.bj:c.bi;if(other.type!==CANNON.Body.DYNAMIC)continue;
    if(!en.boss&&c.multiplier*DT>ENEMY.crushJ)hitE.push([en,'crush',1])}
  // 곰 몸이 두목에 직접 닿음(빠를 때만)
  if(br&&bearPre&&bearPre.length()>=BOSS.bearV)for(const [o] of bearHits){const u=o.userData;if(u&&u.kind==='enemy'&&u.boss&&u.alive)hitE.push([u,'bear',bearPre.length()>=BOSS.bearV2?2:1])}
  // 3) 특수 곰
  if(br){
    if(br.type==='bomb'&&!br.used&&bearHits.length&&game.shotStep>2){br.used=true;if(br.mesh.userData.pot)br.mesh.userData.pot.visible=false;explode(br.body.position,toBreak,hitE);ui.slots()} // 안 누르면 닿은 자리에서 쾅
    if(br.type==='shield'&&br.bounces>0&&br.cool<=0&&bearHits.length&&bearPre){
      const [other,n]=bearHits[0];const vn=bearPre.dot(n);
      if(vn<-.5){const nv=bearPre.vsub(n.scale(2*vn));let sp=nv.length()*SHIELD.keep;sp=Math.max(sp,SHIELD.minSpeed);nv.normalize();if(nv.y<.35){nv.y=.35;nv.normalize()}
        br.body.velocity.set(nv.x*sp,nv.y*sp,nv.z*sp);
        if(other.type===CANNON.Body.DYNAMIC){if(other.sleepState===CANNON.Body.SLEEPING)other.wakeUp();const dv=SHIELD.push/(1+.05*other.mass);other.velocity.x-=n.x*dv;other.velocity.y-=n.y*dv*.5;other.velocity.z-=n.z*dv}
        br.bounces--;br.bounceN++;br.cool=SHIELD.cool;game.ev.push(['boing',br.bounceN,game.shotStep,other.type===CANNON.Body.DYNAMIC?'obj':'static',+sp.toFixed(1)]);fx.say('통! ×'+br.bounceN,br.body.position,'sp-s');snd('boing');
        if(!br.bounces&&br.mesh.userData.shield)br.mesh.userData.shield.visible=false}}
    if(br.cool>0)br.cool--;
    if(br.charge>0){br.charge--;const p=br.body.position;
      for(const o of game.blocks){if(!o.alive||toBreak.includes(o))continue;if(boxDist(o,p)<br.r+GIANT.pad){
        if(br.pierced<UP.giantN){br.pierced++;o.hp=0;toBreak.push(o);game.ev.push(['pierce',br.pierced,o.mat,game.shotStep]);fx.say('콰직!',o.body.position,'sp-g',26)}else{endCharge(br,.45);break}}}
      if(br.charge>0)for(const o of game.enemies){if(!o.alive)continue;if(boxDist(o,p)<br.r+GIANT.pad&&!hitE.some(h=>h[0]===o)){hitE.push([o,'smash',2]);if(o.body.sleepState===CANNON.Body.SLEEPING)o.body.wakeUp();o.body.velocity.set(br.dir.x*8,4,br.dir.z*8)}}
      if(br.charge>0&&bearHits.some(([o])=>o.type!==CANNON.Body.DYNAMIC))endCharge(br,.5); // 땅 · 울타리에 닿으면 돌진 끝
      if(br.charge===1)endCharge(br,.7);
    }
  }
  if(game.pot){const P=game.pot;P.t++;if(potHit||P.t>180||P.body.position.y<-2){explode(P.body.position,toBreak,hitE);world.removeBody(P.body);disposeTree(P.mesh);game.pot=null}}
  // 4) 떨어짐 · 물에 빠짐
  for(const en of game.enemies){if(!en.alive)continue;const p=en.body.position;
    // 졸개는 넘어지면(위 방향이 tipCos 아래로 기울면 — 약 57°) 쓰러짐
    if(!en.boss&&en.body.sleepState!==CANNON.Body.SLEEPING){const q=en.body.quaternion;const upY=1-2*(q.x*q.x+q.z*q.z);if(upY<ENEMY.tipCos){hitE.push([en,'tip',1]);continue}}
    if(p.y<-1.5||p.z>43||p.z<-14||p.x<-40||p.x>32)hitE.push([en,'out',99])}
  for(const blk of game.blocks){if(blk.alive&&blk.body.position.y<-3)toBreak.push(blk)}
  // 5) 부서짐 · 쓰러짐(두목은 체력)
  for(const blk of toBreak){if(!blk.alive)continue;blk.alive=false;removeObj(blk);wakeAround(blk.body);
    game.broken++;game.shotBroken++;const g=MATS[blk.mat].gold;game.gold+=g;fx.breakBlock(blk,g)}
  for(const en of game.enemies)if(en.cool>0)en.cool--;
  const done=new Set();
  for(const [en,why,dmg] of hitE){if(!en.alive||done.has(en))continue;done.add(en);
    if(en.boss&&why!=='out'){if(en.cool>0)continue;const d=Math.min(dmg,BOSS.perShot-(en.shotDmg||0));en.cool=BOSS.cool;if(d<=0){fx.bossHit(en);continue}en.shotDmg=(en.shotDmg||0)+d;en.hp-=d;en.cool=BOSS.cool;game.ev.push(['bossHit',why,Math.max(0,en.hp),game.shotIdx,game.shotStep]);ui.boss();if(en.hp>0){fx.bossHit(en);continue}}
    en.alive=false;removeObj(en);wakeAround(en.body);
    game.enemiesLeft--;game.gold+=en.boss?BOSS.gold:ENEMY.gold;fx.enemyDown(en,why);ui.boss()}
  // 금 단계 갱신
  for(const blk of game.blocks){if(!blk.alive)continue;const r=blk.hp/blk.maxhp;const c=r<.34?2:r<.7?1:0;if(c!==blk.crack){blk.crack=c;blk.mesh.material=BLOCKMAT[blk.mat][c]}}
  // 6) 곰 · 차례
  if(game.phase==='flight'||game.phase==='settle'){
    game.shotStep++;
    const br=game.bear;
    if(br&&!br.gone){const b=br.body;const sp=b.velocity.length();br.slow=sp<1.2?br.slow+1:0;
      if(br.slow>30||game.shotStep>5*60||b.position.y<-3||b.position.z>48){br.gone=true;world.removeBody(b);wakeAround(b,.2);fx.poof(b.position,1.2);disposeTree(br.mesh)} // 그림도 바로 뺀다(같은 걸음에 차례가 끝나도 남지 않게)
      else if(game.phase==='flight'&&(b.position.z>FZ-6||game.shotStep>150))game.phase='settle'}
    // 크게 무너짐
    if(!game.shotCrumble){let fast=0;for(const blk of game.blocks)if(blk.alive&&blk.body.sleepState!==CANNON.Body.SLEEPING&&blk.body.velocity.lengthSquared()>6.25)fast++;
      if(fast>=4||game.shotBroken>=3){game.shotCrumble=true;fx.crumble()}}
    let moving=false;
    for(const o of game.blocks)if(o.alive&&o.body.sleepState!==CANNON.Body.SLEEPING&&o.body.velocity.lengthSquared()+.25*o.body.angularVelocity.lengthSquared()>.25){moving=true;break}
    if(!moving)for(const o of game.enemies)if(o.alive&&o.body.sleepState!==CANNON.Body.SLEEPING&&o.body.velocity.lengthSquared()>.25){moving=true;break}
    game.quiet=moving?0:game.quiet+1;
    if((!br||br.gone)&&!game.pot&&(game.quiet>=30||game.shotStep>8*60))endShot();
    else if(game.enemiesLeft<=0&&(!br||br.gone)&&!game.pot&&game.quiet>=10)endShot(); // 다 쓰러뜨리면 조금 빨리
  }
}
function endShot(){
  game.bear=null;
  if(game.enemiesLeft<=0){game.phase='win';const left=game.queue.length-game.shotIdx;game.result={win:true,gold:game.gold,left,stars:left>=2?3:left===1?2:1};ui.slots();onResult()}
  else if(game.shotIdx>=game.queue.length){game.phase='lose';game.result={win:false,gold:game.gold,enemies:game.enemiesLeft};ui.slots();onResult()}
  else{game.phase='aim';game.aimReadyT=0;loadBearIntoSling();ui.slots()}
}

/* ───────── 5. 효과(보기만 — 물리와 무관) ───────── */
const fxR=(()=>{
  const debris=[],dust=[],coins=[],texts=[],flashes=[];
  const dustGeo=new THREE.IcosahedronGeometry(.6,0),coinGeo=new THREE.CylinderGeometry(.22,.22,.06,12),coinMat=M(0xf5c022,{emissive:0x553300}),boomGeo=new THREE.SphereGeometry(1,14,10);
  const debMat={wood:M(0xc98a45),stone:M(0xa3a7ab),ice:new THREE.MeshLambertMaterial({color:0xcfeffa,transparent:true,opacity:.85})};
  const debGeo=new THREE.BoxGeometry(1,1,1);
  const fxL=$('fx');
  function spawnDebris(p,mat,n,size){for(let i=0;i<n;i++){if(debris.length>90){const o=debris.shift();S.remove(o.m)}
    const m=new THREE.Mesh(debGeo,debMat[mat]);const s=size*(.25+Math.random()*.35);m.scale.set(s,s*(.6+Math.random()*.8),s);m.position.set(p.x+(Math.random()-.5)*size,p.y+(Math.random()-.5)*size,p.z+(Math.random()-.5)*size);
    m.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);m.castShadow=!MOBILE;S.add(m);
    debris.push({m,v:new V3((Math.random()-.5)*7,2+Math.random()*5,(Math.random()-.5)*7),w:new V3(Math.random()*8,Math.random()*8,Math.random()*8),t:0,life:1.6+Math.random()*.6})}}
  function spawnDust(p,n,sz=1){for(let i=0;i<n;i++){if(dust.length>40){const o=dust.shift();S.remove(o.m);o.m.material.dispose()}
    const m=new THREE.Mesh(dustGeo,new THREE.MeshLambertMaterial({color:0xe9e2d2,transparent:true,opacity:.6,depthWrite:false}));
    m.position.set(p.x+(Math.random()-.5)*1.4*sz,p.y+(Math.random()-.3)*sz,p.z+(Math.random()-.5)*1.4*sz);m.scale.setScalar(.4*sz);S.add(m);
    dust.push({m,v:new V3((Math.random()-.5)*1.2,.6+Math.random()*.8,(Math.random()-.5)*1.2),t:0,life:.9+Math.random()*.5,s0:(.5+Math.random()*.7)*sz})}}
  function spawnCoins(p,n){for(let i=0;i<n;i++){if(coins.length>50){const o=coins.shift();S.remove(o.m)}
    const m=new THREE.Mesh(coinGeo,coinMat);m.position.set(p.x,p.y+.3,p.z);m.rotation.set(Math.PI/2*Math.random(),0,Math.random()*3);S.add(m);
    coins.push({m,v:new V3((Math.random()-.5)*4,5+Math.random()*3,(Math.random()-.5)*4),t:0,life:1.1+Math.random()*.3})}}
  // 떠오르는 글씨: 같은 때 많아야 TEXT_MAX 개(넘치면 가장 오래된 것부터 지움). 금화는 모아서 「+45」 하나로(GOLD_GAP 초마다)
  const TEXT_MAX=6,GOLD_GAP=.32;
  function text(str,p,cls,dur=1.1,size,keep){while(texts.length>=TEXT_MAX){let i=texts.findIndex(o=>!o.keep);if(i<0)i=0;texts[i].el.remove();texts.splice(i,1)}
    const el=document.createElement('div');el.className='fl'+(cls?' '+cls:'');el.textContent=str;if(size)el.style.fontSize=size+'px';fxL.appendChild(el);
    texts.push({el,p:p.clone(),t:0,life:dur,keep:!!keep})}
  const pend={g:0,n:0,x:0,y:0,z:0,t:0,big:false};
  function addGold(g,p,big){if(!g)return;pend.g+=g;pend.n++;pend.x+=p.x;pend.y+=p.y;pend.z+=p.z;pend.big=pend.big||big;if(!pend.t)pend.t=1e-4}
  function flushGold(){if(!pend.g)return;const c=new V3(pend.x/pend.n,pend.y/pend.n+(pend.big?1:.6),pend.z/pend.n);text('+'+pend.g,c,'',pend.big?1.2:1,pend.big?40:28+Math.min(14,pend.g/4));snd('coin',pend.g);
    pend.g=pend.n=pend.x=pend.y=pend.z=pend.t=0;pend.big=false}
  return{
    breakBlock(blk,g){const p=blk.body.position;const sz=Math.cbrt(blk.w*blk.h*blk.d);spawnDebris(p,blk.mat,MOBILE?5:8,sz);spawnDust(p,blk.mat==='ice'?2:3,sz);
      if(g){spawnCoins(p,1);addGold(g,p,false)}ui.gold(game.gold);snd('break',blk.mat)},
    enemyDown(en,why){const p=en.body.position;spawnDust(p,4,1);spawnCoins(p,5);addGold(en.boss?BOSS.gold:ENEMY.gold,p,true);
      en.dieT=.001;en.dieV=new V3((Math.random()-.5)*3,6,2+Math.random()*2);ui.enemies(game.enemiesLeft,true);ui.gold(game.gold);snd('enemy')},
    poof(p,sz){spawnDust(p,4,sz)},
    say(str,p,cls,size){text(str,new V3(p.x,p.y+1.4,p.z),cls,1.1,size||44,!size)},
    boom(p,r){const c=new V3(p.x,p.y,p.z);const m=new THREE.Mesh(boomGeo,new THREE.MeshBasicMaterial({color:0xffb030,transparent:true,opacity:.85,depthWrite:false}));
      m.position.copy(c);S.add(m);flashes.push({m,t:0,r});spawnDust(c,10,r*.6);spawnDebris(c,'wood',4,.6);text('쾅!',new V3(c.x,c.y+3.4,c.z),'sp-b',1.3,110,true);snd('boom')},
    bossHit(en){const p=en.body.position;spawnDust(p,3,1);text('아야! ♥'+en.hp,new V3(p.x,p.y+1.6,p.z),'sp-b',1.1,38,true);snd('enemy',1)},
    crumble(){ui.crumble();snd('crumble')},
    twang(){snd('twang')},
    clear(){debris.forEach(o=>S.remove(o.m));dust.forEach(o=>{S.remove(o.m);o.m.material.dispose()});coins.forEach(o=>S.remove(o.m));flashes.forEach(o=>{S.remove(o.m);o.m.material.dispose()});texts.forEach(o=>o.el.remove());pend.g=pend.n=pend.x=pend.y=pend.z=pend.t=0;debris.length=dust.length=coins.length=texts.length=flashes.length=0},
    update(dt){
      if(pend.t){pend.t+=dt;if(pend.t>GOLD_GAP)flushGold()}
      for(let i=flashes.length-1;i>=0;i--){const o=flashes[i];o.t+=dt;const k=o.t/.45;o.m.scale.setScalar(.4+o.r*smooth(k));o.m.material.opacity=.85*(1-k);if(k>=1){S.remove(o.m);o.m.material.dispose();flashes.splice(i,1)}}
      for(let i=debris.length-1;i>=0;i--){const o=debris[i];o.t+=dt;o.v.y+=G*dt;o.m.position.addScaledVector(o.v,dt);o.m.rotation.x+=o.w.x*dt;o.m.rotation.y+=o.w.y*dt;
        const hh=o.m.scale.y*.5;if(o.m.position.y<hh){o.m.position.y=hh;o.v.y*=-.3;o.v.x*=.7;o.v.z*=.7;o.w.multiplyScalar(.7)}
        if(o.t>o.life){const k=1-(o.t-o.life)/.35;if(k<=0){S.remove(o.m);debris.splice(i,1)}else o.m.scale.multiplyScalar(.9)}}
      for(let i=dust.length-1;i>=0;i--){const o=dust[i];o.t+=dt;const k=o.t/o.life;o.m.position.addScaledVector(o.v,dt);o.m.scale.setScalar(o.s0*(.6+k*1.2));o.m.material.opacity=.6*(1-k);
        if(k>=1){S.remove(o.m);o.m.material.dispose();dust.splice(i,1)}}
      for(let i=coins.length-1;i>=0;i--){const o=coins[i];o.t+=dt;o.v.y+=G*dt;o.m.position.addScaledVector(o.v,dt);o.m.rotation.y+=12*dt;o.m.rotation.x+=5*dt;
        if(o.m.position.y<.1){o.m.position.y=.1;o.v.y*=-.4;o.v.x*=.6;o.v.z*=.6}if(o.t>o.life){S.remove(o.m);coins.splice(i,1)}}
      for(let i=texts.length-1;i>=0;i--){const o=texts[i];o.t+=dt;const k=o.t/o.life;const v=o.p.clone();v.y+=k*1.2;v.project(cam);
        o.el.style.left=((v.x+1)/2*view.w)+'px';o.el.style.top=((1-v.y)/2*view.h)+'px';o.el.style.opacity=k<.7?1:(1-k)/.3;if(k>=1||v.z>1){o.el.remove();texts.splice(i,1)}}
    }
  };
})();
// 시험(자동 쏘기)에서는 효과를 끈다 — 물리 · 판정과 무관
let fxOn=true;const fx={};for(const k of Object.keys(fxR))fx[k]=(...a)=>{if(fxOn||k==='clear'||k==='update')return fxR[k](...a)};
/* ───────── 소리 · 음악(WebAudio 로 그 자리에서 만든다 — 바깥 소리 파일 없음) ─────────
 * 브라우저 정책 때문에 처음 누를 때(pointerdown · keydown) 켠다. 소리 · 음악 켜고 끄기는 저장(SAVE.sfx · SAVE.music) */
const Snd=(()=>{
  let ctx=null,master=null,sfxG=null,musG=null,noise=null;const last={};
  function init(){if(ctx)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;try{ctx=new C()}catch(e){ctx=null;return}
    master=ctx.createGain();master.gain.value=.8;master.connect(ctx.destination);
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;comp.connect(master);
    sfxG=ctx.createGain();sfxG.connect(comp);musG=ctx.createGain();musG.connect(master);
    const n=ctx.sampleRate|0,b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;noise=b;
    applyVol();music.start()}
  function applyVol(){if(!ctx)return;const d=SAVE.get();sfxG.gain.value=d.sfx?.9:0;musG.gain.setTargetAtTime(d.music?.55:0,ctx.currentTime,.08)}
  function unlock(){init();if(ctx&&ctx.state==='suspended')ctx.resume().catch(()=>{})}
  const ok=()=>ctx&&ctx.state==='running'&&SAVE.get().sfx&&fxOn;
  const gap=(k,ms)=>{const t=performance.now();if(last[k]&&t-last[k]<ms)return false;last[k]=t;return true};
  // 바탕 소리 만들기
  function tone(type,f0,f1,dur,vol,{at=0,attack=.005,out=sfxG,q=0}={}){const t=ctx.currentTime+at;const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;
    o.frequency.setValueAtTime(f0,t);if(f1!==f0)o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+attack);g.gain.exponentialRampToValueAtTime(.0008,t+dur);o.connect(g);g.connect(out);o.start(t);o.stop(t+dur+.05);return o}
  function nz(dur,vol,{type='bandpass',f0=1000,f1=null,q=1,at=0,attack=.004,out=sfxG}={}){const t=ctx.currentTime+at;const src=ctx.createBufferSource();src.buffer=noise;
    const fl=ctx.createBiquadFilter();fl.type=type;fl.frequency.setValueAtTime(f0,t);if(f1)fl.frequency.exponentialRampToValueAtTime(f1,t+dur);fl.Q.value=q;
    const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+attack);g.gain.exponentialRampToValueAtTime(.0008,t+dur);
    src.connect(fl);fl.connect(g);g.connect(out);src.start(t,Math.random()*.5);src.stop(t+dur+.05)}
  const P={
    stretch(p){tone('sawtooth',90+p*160,120+p*200,.09,.035);nz(.08,.04,{f0:600+p*900,q:6})},           // 고무줄 당김(끼익)
    twang(){tone('triangle',180,70,.35,.22);nz(.38,.22,{f0:2400,f1:400,q:1.2})},                         // 발사 휙
    hit(m,k){k=clamp(k,0,1);if(m==='stone'){tone('sine',85,45,.22,.22*k+.06);nz(.12,.12*k,{type:'lowpass',f0:500})}
      else if(m==='ice'){tone('triangle',1900+Math.random()*600,1700,.18,.07*k+.03);tone('sine',3100,2900,.12,.04*k,{at:.02})}
      else{tone('sine',150,80,.16,.18*k+.05);nz(.1,.1*k+.03,{f0:700,q:2})}},                               // 나무 쿵 · 돌 쿵(낮게) · 얼음 쨍
    break(m){if(m==='ice'){for(let i=0;i<4;i++)tone('triangle',2200+Math.random()*1600,1500,.22,.05,{at:i*.025});nz(.3,.14,{type:'highpass',f0:3000})}
      else if(m==='stone'){tone('sine',70,35,.35,.26);nz(.42,.26,{type:'lowpass',f0:900,f1:200})}
      else{tone('square',120,60,.12,.06);nz(.3,.22,{f0:900,f1:300,q:1.5})}},                              // 부서짐
    enemy(boss){const b=boss?.6:1;const o=tone('square',720*b,300*b,.26,.08);tone('sawtooth',760*b,320*b,.24,.04,{at:.01})},   // 너구리 꽥
    coin(n){const k=Math.min(4,1+Math.floor((n||1)/20));for(let i=0;i<k;i++){tone('sine',1320,1320,.09,.07,{at:i*.07});tone('sine',1760,1760,.16,.06,{at:i*.07+.045})}},  // 금화 짤랑
    boom(){tone('sine',130,32,.7,.4);nz(.9,.4,{type:'lowpass',f0:1800,f1:120,q:.7});nz(.25,.18,{f0:2500,q:.8})},                // 꿀폭탄 쾅
    boing(){tone('sine',260,620,.25,.2);tone('triangle',520,1240,.22,.06,{at:.01});tone('square',1800,1700,.08,.03)},        // 방패 통
    special(t){if(t==='giant'){tone('sawtooth',90,240,.5,.14);nz(.6,.2,{f0:300,f1:1400,q:.8})}else if(t==='bomb'){tone('triangle',500,260,.18,.1)}else tone('sine',700,980,.12,.08)}, // 큰곰 돌진 · 꿀단지 던짐 · 방패 듦
    crumble(){tone('sine',60,30,.9,.18);nz(1.1,.2,{type:'lowpass',f0:700,f1:150,attack:.05})},
    win(){[523,659,784,1047].forEach((f,i)=>tone('triangle',f,f,.32,.13,{at:i*.11}));tone('sine',1047,1047,.6,.08,{at:.46});tone('sine',1319,1319,.6,.06,{at:.46})},  // 이김
    lose(){[392,349,311,262].forEach((f,i)=>tone('triangle',f,f*.97,.36,.11,{at:i*.17}))},            // 짐
    click(){tone('sine',880,660,.07,.08)},buy(){tone('sine',988,988,.08,.08);tone('sine',1319,1319,.2,.08,{at:.07});tone('triangle',1976,1976,.2,.04,{at:.12})},
  };
  function play(k,a,b){if(!ok()||!P[k])return;
    if(k==='break'&&!gap('break',45))return;if(k==='coin'&&!gap('coin',90))return;if(k==='enemy'&&!gap('enemy',80))return;if(k==='stretch'&&!gap('stretch',70))return;
    try{P[k](a,b)}catch(e){}}
  function hit(m,dv){if(!ok())return;if(!gap('hit'+m,m==='ice'?70:55))return;try{P.hit(m,(dv-MATS[m].thr)/6)}catch(e){}}
  // 밝은 짧은 음악 고리: C · Am · F · G 네 마디(110 bpm 8분음표), 앞 0.3초를 미리 짜 둔다
  const music=(()=>{const BPM=110,ST=60/BPM/2;let step=0,next=0,timer=0;
    const CH=[[60,64,67],[57,60,64],[53,57,60],[55,59,62]],ML=[[72,76,79,76,74,72,74,76],[72,69,72,76,74,72,71,69],[69,72,77,76,72,69,72,74],[71,74,79,77,76,74,72,71]];
    const hz=n=>440*Math.pow(2,(n-69)/12);
    function note(type,f,t,dur,vol){const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.01);g.gain.exponentialRampToValueAtTime(.0006,t+dur);o.connect(g);g.connect(musG);o.start(t);o.stop(t+dur+.03)}
    function tick(){if(!ctx)return;const now=ctx.currentTime;if(next<now)next=now+.05;
      while(next<now+.3){const bar=Math.floor(step/8)%4,i=step%8,t=next;
        if(SAVE.get().music&&ctx.state==='running'){
          if(ML[bar][i]&&(i%2===0||bar%2))note('triangle',hz(ML[bar][i]),t,ST*1.6,.05);
          if(i%4===0)note('sine',hz(CH[bar][0]-24),t,ST*3.6,.11);if(i%4===2)note('sine',hz(CH[bar][0]-12),t,ST*1.5,.06);
          if(i%2===1)CH[bar].forEach(n=>note('sine',hz(n),t,ST*.8,.018));
        }
        step++;next+=ST}}
    return{start(){if(!timer)timer=setInterval(tick,90)}}})();
  document.addEventListener('visibilitychange',()=>{if(!ctx)return;try{document.hidden?ctx.suspend().catch(()=>{}):ctx.resume().catch(()=>{})}catch(e){}});
  for(const ev of ['pointerdown','keydown','touchend'])window.addEventListener(ev,unlock,{capture:true,passive:true});
  return{play,hit,unlock,applyVol,get ctx(){return ctx}};
})();
function snd(k,a,b){Snd.play(k,a,b)}

/* ───────── 6. 저장(진행 · 별 · 금화 · 곰 마을 · 소리 — 하나의 객체) ─────────
 * 이 기기(localStorage)에 늘 저장하고, 헬스키퍼에 로그인돼 있으면 서버 진행 저장(매니지먼트 'slingfort', 목록엔 숨김)에도 올린다(Sync).
 * 서버 쪽 값 검사(backend mgmt.py check_slingfort_state)와 칸 · 범위가 같아야 한다 */
const SAVE_KEY='slingfort.save.v1';
const LV_MAX=10,LV_SCORE_MAX=20000,GOLD_MAX=9999999;
function cleanSave(r){const o={v:1,gold:0,unlocked:1,last:1,stars:{},best:{},cleared:{},up:{bomb:0,shield:0,giant:0,horn:0},music:true,sfx:true};
  if(!r||typeof r!=='object')return o;const I=(v,a,b,dv)=>Number.isInteger(v)?clamp(v,a,b):dv;
  o.gold=I(r.gold,0,GOLD_MAX,0);o.unlocked=I(r.unlocked,1,LV_MAX,1);o.last=Math.min(o.unlocked,I(r.last,1,LV_MAX,1));
  for(let i=1;i<=LV_MAX;i++){const k=String(i);
    if(r.cleared&&r.cleared[k]===true)o.cleared[k]=true;
    if(r.stars&&Number.isInteger(r.stars[k])&&r.stars[k]>0&&o.cleared[k])o.stars[k]=clamp(r.stars[k],1,3);
    if(r.best&&Number.isInteger(r.best[k])&&r.best[k]>0)o.best[k]=clamp(r.best[k],0,LV_SCORE_MAX)}
  if(r.up&&typeof r.up==='object')for(const k of ['bomb','shield','giant','horn'])o.up[k]=I(r.up[k],0,k==='horn'?2:3,0);
  if(typeof r.music==='boolean')o.music=r.music;if(typeof r.sfx==='boolean')o.sfx=r.sfx;return o}
const SAVE=(()=>{
  let d=cleanSave(null);
  try{const r=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(r&&r.v===1)d=Object.assign(cleanSave(r),{srv:!!r.srv})}catch(e){}
  const subs=[];
  return{
    get:()=>d,
    save(quiet){if(TEST)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(d))}catch(e){}if(!quiet)subs.forEach(f=>{try{f(d)}catch(e){}})},
    onChange(f){subs.push(f)},
    replace(nd,quiet){const srv=d.srv;d=cleanSave(nd);d.srv=srv;this.save(quiet)},
    reset(){d=cleanSave(null);this.save()},
    pure(){const o=cleanSave(d);return o},
    totalStars(){return Object.values(d.stars).reduce((a,b)=>a+b,0)},
    score(){return Math.min(SCORE_MAX,Object.values(d.best).reduce((a,b)=>a+b,0))}, // 원정 점수 = 단계별 최고 점수 합
  };
})();
/* 서버 진행 저장(회원별 · 어느 기기에서나 이어짐) — /_shared/mgmt.js 의 HKMgmt('slingfort').
 * 비로그인 · 업무 시간 · 서버 없음(혼자 연 화면) · 오류면 이 기기에만. 처음 붙을 때는 이 기기 값과 서버 값을 합친다(큰 쪽 · 합집합) */
const Sync={store:null,on:false,busy:false,
  merge(a,b){const o=cleanSave(a),q=cleanSave(b);o.gold=Math.max(o.gold,q.gold);o.unlocked=Math.max(o.unlocked,q.unlocked);o.last=Math.max(o.last,q.last);
    for(const k in q.cleared)o.cleared[k]=true;for(const k in q.stars)o.stars[k]=Math.max(o.stars[k]||0,q.stars[k]);for(const k in q.best)o.best[k]=Math.max(o.best[k]||0,q.best[k]);
    for(const k in q.up)o.up[k]=Math.max(o.up[k],q.up[k]);return cleanSave(o)},
  adopt(srv){this.busy=true;try{SAVE.replace(Object.assign(srv||{},{music:SAVE.get().music,sfx:SAVE.get().sfx}),true)}finally{this.busy=false}afterSync()},
  async init(){
    if(TEST||typeof HKMgmt==='undefined')return;
    try{
      const st=await HKMgmt.open(GAME.key,{blank:()=>({}),onStale:fresh=>this.adopt(fresh),onClosed:()=>{this.on=false}});
      if(!st||typeof st!=='object'||!('state' in st))return;
      this.store=st;const srv=st.state||{},d=SAVE.get();
      this.busy=true;try{SAVE.replace(st.isNew||!d.srv?this.merge(d,srv):Object.assign(cleanSave(srv),{music:d.music,sfx:d.sfx}),true);SAVE.get().srv=true;SAVE.save(true)}finally{this.busy=false}
      this.on=true;this.push();st.saveNow();afterSync();
    }catch(e){this.on=false}
  },
  push(){if(!this.on||!this.store||this.busy)return;this.store.state=SAVE.pure();this.store.dirty()},
  flush(){if(this.on&&this.store){this.store.state=SAVE.pure();this.store.saveNow({keepalive:true})}},
};
SAVE.onChange(()=>Sync.push());
addEventListener('pagehide',()=>Sync.flush());
document.addEventListener('visibilitychange',()=>{if(document.hidden)Sync.flush()});
function afterSync(){Snd.applyVol();if(ui.cur==='title')ui.title();else if(ui.cur==='village')ui.village();else if(ui.cur==='map')ui.map(ui._sel)}
const firstBonus=id=>50+id*5;
function onResult(){
  const r=game.result,L=game.level,d=SAVE.get();
  hkRun=false; // 결과 뒤에는 다음 단계 시작(hk:start) 전까지 지금 점수(hk:live)를 보내지 않는다
  if(typeof L.id==='number'){
    if(r.win){r.first=d.cleared[L.id]?0:firstBonus(L.id);r.leftGold=r.left*100;r.total=r.gold+r.leftGold+r.first;
      d.cleared[L.id]=true;d.stars[L.id]=Math.max(d.stars[L.id]||0,r.stars);d.best[L.id]=Math.max(d.best[L.id]||0,r.total);
      d.unlocked=Math.max(d.unlocked,Math.min(LEVELS.length,L.id+1));d.last=Math.min(LEVELS.length,L.id+1);d.gold=Math.min(GOLD_MAX,d.gold+r.total)}
    else{r.total=r.gold;d.gold=Math.min(GOLD_MAX,d.gold+r.gold);d.last=L.id}
    SAVE.save();
    hk({type:'hk:score',score:clamp(Math.round(SAVE.score()),0,SCORE_MAX)}); // 원정 점수(단계별 최고 합)
  }
  const show=()=>{if(game.result===r){ui.gold(0);ui.result();snd(r.win?'win':'lose')}};
  if(TEST)show();else setTimeout(show,900);
}

/* ───────── 7. 화면 표시 ───────── */
const STAR=on=>`<span class="star ${on?'on':''}">★</span>`;
const COIN='<span class="coin">₩</span>';
const isNum=L=>L&&typeof L.id==='number';
let liveLast=-1;
// 지금 원정 점수(아케이드 「기록 남기고 나가기」용) = 다른 단계 최고 합 + 이 단계(최고 · 지금 판 금화 중 큰 쪽)
let hkRun=false; // 단계 시작(hk:start)을 보낸 뒤에만 지금 점수를 보낸다
function hkLive(){if(!hkRun||!ARC||!inFrame||!isNum(game.level)||game.phase==='win'||game.phase==='lose')return;const d=SAVE.get(),k=String(game.level.id),b=d.best[k]||0;
  const v=clamp(Math.round(Object.values(d.best).reduce((a,x)=>a+x,0)-b+Math.max(b,game.gold)),0,SCORE_MAX);if(v!==liveLast){liveLast=v;hk({type:'hk:live',score:v})}}
const ui={
  cur:null,
  level(L){$('lvl').textContent='🏕️ '+(isNum(L)?'단계 '+L.id:L.name)},
  enemies(n,pop){$('enemyIc').innerHTML=aimg('coon','🦝','pi');$('enemyN').textContent=n;$('enemy').classList.toggle('zero',n<=0);if(pop){const m=$('minus');m.style.opacity=1;clearTimeout(ui._mt);ui._mt=setTimeout(()=>m.style.opacity=0,900)}},
  gold(g){$('gold').textContent=nf(SAVE.get().gold+(game.phase==='win'||game.phase==='lose'?0:g));hkLive()},
  boss(){const b=game.enemies.find(e=>e.boss);const el=$('bossbar');if(!b||!b.alive){el.hidden=true;return}
    el.hidden=false;el.innerHTML=aimg('coon_boss','👑','pi')+'두목 '+Array.from({length:b.maxhp},(_,i)=>`<span class="hp ${i<b.hp?'on':''}">♥</span>`).join('')},
  slots(){const el=$('slots');const q=game.queue;let x=0,h='';
    const fly=(game.phase==='flight'||game.phase==='settle')&&game.bear,cur=fly?game.shotIdx-1:game.shotIdx;
    q.forEach((t,i)=>{const B=BEARS[t];const on=i===cur&&game.phase!=='win'&&game.phase!=='lose';const used=i<cur||(fly&&i===cur&&game.bear.used);
      // 둥글게 자르기는 안쪽 칸(.slin)만 — 특수 딱지(.tag)는 그 바깥 형제라 위로 삐져나와도 안 잘린다
      h+=`<div class="slot ${on?'on':''} ${used?'used':''}" style="left:${x}px"><span class="slin">${aimg(B.art,B.icon,'sl')}</span>${B.tag?`<span class="tag" style="background:${B.tagc}">${B.tag}</span>`:''}</div>`;x+=on?108:84});
    el.innerHTML=h},
  // 단계 시작 띠: 두목 단계는 두목을 가리지 않게 아래 오른쪽에
  banner(show,L){const b=$('banner');if(show){$('bn1').textContent=(isNum(L)?L.id+'단계 · ':'')+L.name;$('bn2').textContent=L.sub;b.classList.toggle('low',!!L.boss);b.style.opacity=1;b.hidden=false}else{b.style.opacity=0;setTimeout(()=>{if(b.style.opacity==='0')b.hidden=true},450)}},
  crumble(){const c=$('crumble');c.classList.add('show');clearTimeout(ui._ct);ui._ct=setTimeout(()=>c.classList.remove('show'),1300)},
  hint(on){$('hint').hidden=!on;$('hand').hidden=!on},
  overlay(html,cur){$('ov').innerHTML=html||'';ui.cur=html?(cur||'card'):null;document.body.classList.toggle('menu',!!html)},
  result(){
    const r=game.result,L=game.level,num=isNum(L);const hasNext=num&&L.id<LEVELS.length;
    const row=(ic,label,val,cls='')=>`<div class="row"><span class="ic">${ic}</span><span class="lb">${label}</span><span class="vl ${cls}">${val}</span></div>`;
    if(r.win){const n=game.enemies.length;
      ui.overlay(`<div class="dim"><div class="card res"><div class="ttl teal">요새 함락!</div><div class="body"><div class="rinfo">
        <div class="lvname">${num?L.id+'단계 · ':''}${L.name}</div>
        <div class="stars">${STAR(r.stars>=1)}${STAR(r.stars>=2).replace('star','star mid')}${STAR(r.stars>=3)}</div>
        <div class="s3tip ${r.stars>=3?'ok':''}">${r.stars>=3?`곰을 ${r.left}마리 남겨서 별 3개!`:'곰을 2마리 남기면 별 3개!'}</div>
        ${row(aimg('coon','🦝'),'너구리',n+'/'+n,'pur')}${row(COIN,'약탈 금화','+'+r.gold,'grn')}
        ${row(aimg('bear','🐻'),'남은 곰',r.left+' × 100','grn')}${r.first?row('🚩','첫 함락 보너스','+'+r.first,'grn'):''}
        ${num?`<div class="sc">단계 점수 <b>${nf(r.total)}</b> · 원정 점수 <b>${nf(SAVE.score())}</b></div>`:''}</div><div class="ract">
        <div class="btns"><button class="btn b sm" data-a="map">🗺️ 지도</button><button class="btn b sm" data-a="village">${aimg('up_horn','🏡','bi')} 곰 마을</button></div>
        ${hasNext?`<button class="btn g wide" data-a="next">▶ 다음</button>`:`<button class="btn g wide" data-a="retry">↻ 다시</button>`}
      </div></div></div></div>`,'result')}
    else{
      ui.overlay(`<div class="dim"><div class="card res"><div class="ttl">산적들이 버텼다!</div><div class="body"><div class="rinfo">
        <div class="bigic">${aimg('coon','🦝','big')}</div><div class="left">너구리 ${r.enemies}마리 남음</div>
        <div class="row tip"><span class="ic">${aimg('up_horn','📯')}</span><span class="lb">곰 마을에서 출정 나팔을 사면 곰이 한 마리 더!</span></div>
        ${row(COIN,'얻은 금화는 가져요','+'+r.gold,'grn')}</div><div class="ract">
        <div class="btns"><button class="btn b sm" data-a="map">🗺️ 지도</button><button class="btn b sm" data-a="village">${aimg('up_horn','🏡','bi')} 곰 마을</button></div>
        <button class="btn g wide" data-a="retry">↻ 다시</button>
      </div></div></div></div>`,'result')}
  },
  pause(){const d=SAVE.get();ui.overlay(`<div class="dim"><div class="card pz"><div class="ttl teal">잠깐 멈춤</div><div class="body">
    <button class="btn g wide" data-a="resume">▶ 이어 하기</button>
    <button class="btn b wide2" data-a="retry">↻ 처음부터</button>
    <div class="btns"><button class="rbtn ${d.music?'':'off'}" data-a="music" aria-label="음악">🎵</button><button class="rbtn ${d.sfx?'':'off'}" data-a="sfx" aria-label="소리">🔊</button></div>
    <button class="btn b wide2" data-a="map">🗺️ 지도</button>
  </div></div></div>`,'pause')},
  map(sel){const d=SAVE.get();ui._sel=sel=clamp(sel||d.last||1,1,d.unlocked);
    const POS={1:[110,370],2:[200,235],3:[330,345],4:[290,120],5:[440,250],6:[620,350],7:[690,165],8:[820,330],9:[900,150],10:[1035,225]};
    let nodes='';
    for(const L of LEVELS){const [x,y]=POS[L.id];const boss=L.id===5||L.id===10,lock=L.id>d.unlocked,st=d.stars[L.id]||0;
      nodes+=`<button class="node ${boss?'boss':''} ${lock?'lock':''} ${L.id===sel?'sel':''}" style="left:${x}px;top:${y}px" data-a="${lock?'':'pick'}" data-l="${L.id}" aria-label="${L.id}단계 ${L.name}">
        ${lock?'🔒':boss?`<span class="bi">${L.id===5?aimg('coon_boss','🦝','nb'):'🏰'}</span><span class="bn">${L.id}</span>`:L.id}
        ${!lock&&d.cleared[L.id]?`<span class="nst">${STAR(st>=1)}${STAR(st>=2)}${STAR(st>=3)}</span>`:''}</button>`}
    const path=[1,2,3,4,5,6,7,8,9,10].map(i=>POS[i]).map(([x,y])=>`${x},${y}`).join(' ');
    const L=levelById(sel),img=ART.ok.map;
    ui.overlay(`<div class="dim map"><div class="card mapc"><div class="ttl teal">원정 지도<span class="mgold">${COIN}${nf(d.gold)}</span><span class="mstar">★ ${SAVE.totalStars()}/${LEVELS.length*3}</span></div>
      <div class="mapmain"><div class="mapwrap"><div class="mapbody ${img?'img':''}">${img?`<div class="mapimg" style="background-image:url(${artUrl('map')})"></div>`:''}
        <div class="region f"><span class="rtag">🍁 단풍 숲</span></div><div class="region s"><span class="rtag">🍄 안개 늪</span></div>
        <svg class="mpath" viewBox="0 0 1120 470" width="1120" height="470"><polyline points="${path}" fill="none" stroke="${img?'#fff6dc':'#a07848'}" stroke-width="${img?7:5}" stroke-dasharray="4 12" stroke-linecap="round"/></svg>
        ${nodes}
      </div></div>
      <div class="mapfoot"><button class="rbtn" data-a="home" aria-label="첫 화면">🏠</button><div class="mname">${L.id}단계 · ${L.name}</div><button class="btn g mplay" data-a="play">▶ ${sel}단계</button><button class="btn b sm" data-a="village">${aimg('up_horn','🏡','bi')} 곰 마을</button></div>
    </div></div></div>`,'map')},
  // 곰 마을(강화): 레퍼런스 LONGHOUSE 처럼 칸 넷을 가로로. 금화가 모자라면 회색, 다 올리면 「최고」
  village(back){if(back)ui._vback=back;const d=SAVE.get(),u=upLv();
    const it=k=>{const G=UPG[k],lv=u[k],n=G.cost.length,max=lv>=n,cost=max?0:G.cost[lv],can=!max&&d.gold>=cost;
      return `<div class="up"><div class="upic">${aimg(G.art,G.emo)}</div><div class="upn">${G.name}</div>
        <div class="pips">${Array.from({length:n},(_,i)=>`<i class="${i<lv?'on':''}"></i>`).join('')}</div>
        <div class="upd">${max?G.d(G.val[lv]):G.d(G.val[lv],G.val[lv+1])}</div>
        <button class="price ${can?'can':''} ${max?'max':''}" data-a="${can?'buy':'nobuy'}" data-k="${k}" ${can?'':'aria-disabled="true"'}>${max?'최고 단계':COIN+nf(cost)}</button></div>`};
    ui.overlay(`<div class="dim"><div class="card vil"><div class="ttl brown">곰 마을</div><div class="body">
      <div class="pillg">${COIN}<b id="vgold">${nf(d.gold)}</b></div>
      <div class="ups">${it('bomb')}${it('shield')}${it('giant')}${it('horn')}</div>
      <div class="btns"><button class="btn b sm" data-a="map">🗺️ 지도</button><button class="btn g" data-a="vback">▶ 계속</button></div></div></div></div>`,'village')},
  // 첫 화면: 대표 그림(왼쪽 새총곰 · 오른쪽 요새) 위 가운데에 제목 · 원정 시작 · 금화 · 별 · 곰 마을 · 원정 점수, 오른쪽 아래 음악 · 소리
  // 그림이 아직 · 못 오면 noimg 바탕(불투명 하늘 · 풀밭)이 보이고, 오면 그 위에 그림이 덮인다(뒤 게임 화면이 비치지 않게)
  title(){const d=SAVE.get(),img=ART.ok.title!==false;
    ui.overlay(`<div class="tscr ${img?'':'noimg'}" ${img?`style="background-image:url(${artUrl('title')}),var(--tbg)"`:''}><div class="tcol">
      <div class="tsm">곰돌이</div><div class="tbig">새총 원정대</div>
      <button class="btn g tstart" data-a="start">▶ 원정 시작</button>
      <div class="tpills"><span class="pillg">${COIN}${nf(d.gold)}</span><span class="pillg st">★ ${SAVE.totalStars()} / ${LEVELS.length*3}</span></div>
      <button class="btn b tvil" data-a="village">${aimg('up_horn','🏡','bi')} 곰 마을 강화</button>
      <div class="tbest">🏆 원정 점수 <b>${nf(SAVE.score())}</b>점</div></div>
      <div class="tsnd"><button class="rbtn ${d.music?'':'off'}" data-a="music" aria-label="음악">🎵</button><button class="rbtn ${d.sfx?'':'off'}" data-a="sfx" aria-label="소리">🔊</button></div>
    </div>`,'title')},
};
function refreshArt(){if(game.level){ui.slots();ui.enemies(game.enemiesLeft,false);ui.boss()}
  const c=ui.cur;if(c==='title')ui.title();else if(c==='village')ui.village();else if(c==='map')ui.map(ui._sel);else if(c==='result'&&game.result)ui.result()}
let paused=false;
function startLevel(id){paused=false;loadLevel(id);liveLast=-1;hkRun=true;hk({type:'hk:start'});hkLive()}
function openPause(){if(game.phase==='win'||game.phase==='lose'||ui.cur)return false;paused=true;ui.pause();hk({type:'hk:paused'});return true}
function closePause(){if(ui.cur!=='pause')return false;paused=false;ui.overlay(null);hk({type:'hk:resumed'});return true}
function goTitle(){paused=true;aim.on=false;ui.title()}
function villageBack(){const b=ui._vback;if(b==='result'&&game.result)ui.result();else if(b==='map')ui.map(ui._sel);else ui.title()}
$('ov').addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a||!a.dataset.a)return;const k=a.dataset.a,d=SAVE.get();
  if(k==='nobuy'){snd('click');a.classList.remove('shake');void a.offsetWidth;a.classList.add('shake');return}
  if(k!=='buy')snd('click');
  if(k==='resume')closePause();
  else if(k==='retry')startLevel(game.level.id);
  else if(k==='next')startLevel(game.level.id+1);
  else if(k==='map'){paused=true;ui.map(isNum(game.level)&&game.phase!=='win'?game.level.id:d.last)}
  else if(k==='pick'){const l=+a.dataset.l;if(l===ui._sel)startLevel(l);else ui.map(l)} // 고른 단계를 한 번 더 누르면 바로 시작
  else if(k==='play')startLevel(ui._sel);
  else if(k==='start'){paused=true;ui.map(d.last)}
  else if(k==='home')goTitle();
  else if(k==='village'){paused=true;ui.village(ui.cur==='result'?'result':ui.cur==='map'?'map':'title')}
  else if(k==='vback')villageBack();
  else if(k==='buy'){const G=UPG[a.dataset.k],lv=upLv()[a.dataset.k];if(!G||lv>=G.cost.length||d.gold<G.cost[lv])return;
    d.gold-=G.cost[lv];d.up[a.dataset.k]=lv+1;SAVE.save();applyUp();snd('buy');ui.village();ui.gold(0)}
  else if(k==='music'||k==='sfx'){d[k]=!d[k];SAVE.save();Snd.applyVol();a.classList.toggle('off',!d[k])}});
$('pauseBtn').addEventListener('click',e=>{e.stopPropagation();snd('click');if(ui.cur==='pause')closePause();else openPause()});
$('pauseBtn').addEventListener('pointerdown',e=>e.stopPropagation());
// 키보드: Esc · P 멈춤(아케이드 창 안 Esc 는 헬스키퍼가 정한다)
document.addEventListener('keydown',e=>{const k=e.key;
  if(k==='Escape'){if(ARC&&inFrame){e.preventDefault();hk({type:'hk:esc'});return}if(ui.cur==='pause')closePause();else if(ui.cur==='village')villageBack();else openPause();return}
  if(k==='p'||k==='P'){if(ui.cur==='pause')closePause();else openPause()}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(game.phase==='aim'||game.phase==='flight'||game.phase==='settle'))openPause()});
// 헬스키퍼 창과 주고받기
window.addEventListener('message',e=>{if(e.origin!==HKO||e.source!==window.parent)return;const t=e.data&&e.data.type;
  if(t==='hk:hello')document.documentElement.classList.add('in-hk');
  else if(t==='hk:pause'){if(!openPause())hk({type:'hk:paused'})}
  else if(t==='hk:resume'){if(!closePause())hk({type:'hk:resumed'})}
  else if(t==='hk:restart')goTitle()});
// 날아가는 특수 곰 위 「눌러서 …!」
const SP_HINT={bomb:'눌러서 꿀폭탄!',shield:'눌러서 방패!',giant:'눌러서 돌진!'};
function placeSpHint(){const el=$('sp');const br=game.bear;
  if(!canTap()||paused||game.shotStep<8){el.hidden=true;return}
  const v=new V3().copy(br.body.position);v.y+=1.6;v.project(cam);if(v.z>1){el.hidden=true;return}
  el.hidden=false;el.textContent=SP_HINT[br.type];el.className='p sp-'+br.type[0];el.style.left=clamp((v.x+1)/2*view.w,120,view.w-120)+'px';el.style.top=clamp((1-v.y)/2*view.h,view.u*120,view.h-view.sb-view.u*160)+'px'}

/* ───────── 7. 화면 크기(16:9 기준) ───────── */
const view={w:1280,h:720,sb:0,u:1};
/* 낮은 창(무대 높이 400px 이하 — 가로 휴대폰 · 아케이드 창 안 휴대폰): 아래 SAFE_B px 에는 중요한 단추를 두지 않는다
 * (아케이드 틀이 휴대폰 가로에서 창 아래를 화면 밖으로 밀어낸다). 이때 화면 위 글씨 · 단추는 조금 크게(--u), 카드는 낮은 모양으로(--uc) */
const SHORT_H=400,SAFE_B=60;
const BASE_VFOV=42,BASE_HT=Math.tan(BASE_VFOV/2*DEG)*16/9;
function resize(){
  const W=window.innerWidth,H=window.innerHeight;let w=W,h=H;
  const portrait=W/H<1.2;
  if(portrait){h=Math.round(W*9/16)} // 세로 화면: 16:9 로 줄여 가운데
  stage.style.width=w+'px';stage.style.height=h+'px';stage.style.top=Math.round((H-h)/2)+'px';
  view.w=w;view.h=h;R.setSize(w,h,false);
  const short=h<=SHORT_H,sb=short?SAFE_B:0,u=short?Math.min(w/1024,h/533):Math.min(w/1280,h/720),uc=short?Math.min(w/1240,(h-sb-10)/480):u;
  view.sb=sb;view.u=u;document.documentElement.classList.toggle('short',short);
  document.documentElement.style.setProperty('--sb',sb+'px');document.documentElement.style.setProperty('--uc',uc.toFixed(4));
  const a=w/h;cam.aspect=a;cam.fov=a<16/9?2*Math.atan(BASE_HT/a)/DEG:Math.max(34,2*Math.atan(BASE_HT/a)/DEG); // 넓은 화면은 가로 폭을 16:9 와 같게(위아래를 조금 자름)
  cam.updateProjectionMatrix();
  document.documentElement.style.setProperty('--u',u.toFixed(4));
  $('rot').hidden=!portrait;
}
window.addEventListener('resize',resize);resize();

/* ───────── 8. 카메라 ───────── */
const AIM_POS=new V3(-6.5,5.2,-8.5),AIM_LOOK=new V3(-3.2,2.8,16);
const FORT_POS0=new V3(FX-2.5,4.8,FZ-11.5),FORT_POS=FORT_POS0.clone(),FORT_LOOK=new V3(FX+.6,1.8,FZ);
let introR=14;
// 큰 요새는 조금 물러서서 본다
function setView(k){FORT_POS.copy(FORT_LOOK).add(FORT_POS0.clone().sub(FORT_LOOK).multiplyScalar(k));introR=14*k}
const camP=AIM_POS.clone(),camL=AIM_LOOK.clone();
function camSnap(p,l){camP.copy(p);camL.copy(l);cam.position.copy(camP);cam.lookAt(camL)}
const INTRO_SWEEP=2.6,INTRO_BACK=1.4;
function updateCamera(dt){
  let tp,tl,k=3;
  if(game.phase==='intro'){
    game.introT+=dt;const t=game.introT;
    const a=lerp(.95,.1,smooth(t/INTRO_SWEEP)),Rr=introR;
    const sp=new V3(FX+Math.sin(a)*Rr,5.5-1.2*smooth(t/INTRO_SWEEP),FZ-Math.cos(a)*Rr),sl=new V3(FX,1.8,FZ);
    if(t<INTRO_SWEEP){camSnap(sp,sl);return}
    const u=smooth((t-INTRO_SWEEP)/INTRO_BACK);camSnap(sp.lerp(AIM_POS,u),sl.lerp(AIM_LOOK,u));
    if(t>=INTRO_SWEEP+INTRO_BACK){game.phase='aim';game.aimReadyT=1;setTimeout(()=>{if(game.phase!=='intro')ui.banner(false)},1400);if(game.level.tutorial&&game.shotIdx===0)ui.hint(true)}
    return;
  }
  if(game.phase==='flight'&&game.bear){const p=game.bear.body.position;const pr=clamp((p.z-P0.z)/(FZ-P0.z),0,1);
    tl=new V3(p.x,p.y,p.z).lerp(FORT_LOOK,.25+.4*pr);tp=tl.clone().add(new V3(-1.6,3.4-1*pr,-11+1.5*pr).multiplyScalar(game.bear.type==='giant'?1.4:1));k=4}
  else if(game.phase==='settle'){tp=FORT_POS;tl=FORT_LOOK;k=2.5}
  else if(game.phase==='win'||game.phase==='lose'){tp=FORT_POS;tl=FORT_LOOK;k=2}
  else{tp=AIM_POS;tl=AIM_LOOK;k=3.2;game.aimReadyT=Math.min(1,game.aimReadyT+dt*1.6)}
  const f=1-Math.exp(-dt*k);camP.lerp(tp,f);camL.lerp(tl,f);cam.position.copy(camP);cam.lookAt(camL);
}

/* ───────── 9. 조준 입력 ───────── */
const aim={on:false,id:null,x0:0,y0:0,yaw:0,pow:0,pull:0};
const PULL_UNIT=()=>Math.min(view.w,view.h-view.sb)*.36; // 낮은 창은 아래 가려진 몫을 빼고(끝까지 당길 수 있게)
function aimFromDrag(dx,dy){const u=PULL_UNIT();const L=Math.hypot(dx,dy);
  aim.pull=clamp(L/u,0,1);aim.pow=aim.pull;if(dy<-.5*L)aim.pow=aim.pull=0; // 위로 밀면 안 쏨
  aim.yaw=clamp(dx/u,-1,1)*YAW_RANGE}
const canAim=()=>game.phase==='aim'&&game.aimReadyT>.55&&!paused&&loadedBear;
R.domElement.addEventListener('pointerdown',e=>{
  if(game.phase==='intro'&&game.introT<INTRO_SWEEP){game.introT=INTRO_SWEEP;return} // 훑기 건너뛰기
  if(!paused&&canTap()){game.tapReq=true;return} // 날아가는 특수 곰 발동
  if(!canAim()||aim.on)return;aim.on=true;aim.id=e.pointerId;aim.x0=e.clientX;aim.y0=e.clientY;aim.pull=0;aim.pow=0;aim.yaw=0;
  try{R.domElement.setPointerCapture(e.pointerId)}catch(_){} ui.hint(false);aim.sb=0;snd('stretch',0)});
R.domElement.addEventListener('pointermove',e=>{if(!aim.on||e.pointerId!==aim.id)return;aimFromDrag(e.clientX-aim.x0,e.clientY-aim.y0);
  const sb=Math.floor(aim.pull*6);if(sb>aim.sb){aim.sb=sb;snd('stretch',aim.pull)}else if(sb<aim.sb)aim.sb=sb}); // 더 당길 때마다 끼익
function release(e){if(!aim.on||e.pointerId!==aim.id)return;aim.on=false;
  if(aim.pull>=.15&&canAim())shoot(aim.yaw,aim.pow);aim.pull=0}
R.domElement.addEventListener('pointerup',release);R.domElement.addEventListener('pointercancel',e=>{if(e.pointerId===aim.id){aim.on=false;aim.pull=0}});

function updateSling(dt){
  // 얹힌 곰 · 고무줄 · 궤적
  let bp=P0.clone();
  if(loadedBear){
    loadedBear.userData.pop=Math.min(1,(loadedBear.userData.pop||0)+dt*3);const s=.01+.99*smooth(loadedBear.userData.pop);
    if(aim.on&&aim.pull>0){const d=launchDir(aim.yaw);bp.addScaledVector(d,-aim.pull*1.7);loadedBear.rotation.set(.3*aim.pull,BASE_YAW+aim.yaw,0)}
    else loadedBear.rotation.set(0,BASE_YAW,0);
    loadedBear.position.copy(bp);loadedBear.scale.setScalar(s);
  }
  const back=bp.clone().addScaledVector(launchDir(aim.on?aim.yaw:0),-.45);
  setBand(bands[0],TIPS[0],back);setBand(bands[1],TIPS[1],back);pouch.position.copy(back);pouch.lookAt(TIPS[0].clone().add(TIPS[1]).multiplyScalar(.5));
  // 점선
  if(aim.on&&aim.pull>=.15){const v=launchDir(aim.yaw).multiplyScalar(powerToSpeed(aim.pow));const mm=new THREE.Matrix4();let n=0;
    for(let i=1;i<=DOTS;i++){const t=i*.075;const y=P0.y+v.y*t+.5*G*t*t;if(y<0)break;const s=1-i*.018;
      mm.makeScale(s,s,s).setPosition(P0.x+v.x*t,y,P0.z+v.z*t);dots.setMatrixAt(n++,mm)}
    dots.count=n;dots.instanceMatrix.needsUpdate=true}else dots.count=0;
}
function placeHand(){ // 연습 단계 손가락: 새총 곰 위치에서 아래로 끌기
  if($('hand').hidden)return;const v=P0.clone();v.y-=.3;v.project(cam);const el=$('hand');
  el.style.left=((v.x+1)/2*view.w)+'px';el.style.top=((1-v.y)/2*view.h)+'px'}

/* ───────── 10. 고리 ───────── */
let acc=0,last=performance.now(),hold=false;
const perf={frames:[],steps:[]};
function syncAll(dt){
  for(const b of game.blocks)if(b.alive)syncMesh(b);else if(b.mesh.parent)b.mesh.parent.remove(b.mesh);
  for(const en of game.enemies){if(en.alive){syncMesh(en);continue}
    if(en.dieT>0){en.dieT+=dt;en.dieV.y+=G*dt;en.mesh.position.addScaledVector(en.dieV,dt);en.mesh.rotation.x+=9*dt;en.mesh.rotation.z+=6*dt;
      en.mesh.scale.setScalar(Math.max(.01,1-en.dieT/.9));if(en.dieT>.9){en.dieT=0;if(en.mesh.parent)en.mesh.parent.remove(en.mesh)}}}
  if(game.bear){if(!game.bear.gone)syncMesh(game.bear);else if(game.bear.mesh.parent)disposeTree(game.bear.mesh)}
  if(game.pot)syncMesh(game.pot);
}
function frame(now){
  const dtR=Math.min(.1,(now-last)/1000);last=now;
  if(!paused&&!hold){acc+=dtR;let n=0;while(acc>=DT&&n<4){const t0=performance.now();gameStep();if(TEST)perf.steps.push(performance.now()-t0);acc-=DT;n++}if(n===4)acc=0}
  if(!paused){updateCamera(dtR);updateSling(dtR);syncAll(dtR);fx.update(dtR)}
  placeHand();placeSpHint();
  R.render(S,cam);
  if(TEST)perf.frames.push(dtR*1000);
  requestAnimationFrame(frame);
}
{const lq=Q.get('level');const d0=SAVE.get();
  if(lq==='stress')loadLevel('stress',{skipIntro:TEST});
  else if(lq){if(TEST)loadLevel(clamp(+lq||1,1,LEVELS.length),{skipIntro:true});else startLevel(clamp(+lq||1,1,LEVELS.length))}
  else{loadLevel(d0.last||1,{skipIntro:true});goTitle()} // 주소 없이 열면 첫 화면부터(뒤에는 마지막 단계를 멈춰 둔다)
  if(Q.get('map')==='1'){paused=true;ui.map(d0.last||1)}else if(Q.get('village')==='1'){paused=true;ui.village('title')}}
requestAnimationFrame(t=>{last=t;frame(t)});
Sync.init();
hk({type:'hk:ready'});

/* ───────── 11. 시험 걸이(?test=1) ───────── */
if(TEST){
  const snapshot=()=>[...game.blocks,...game.enemies].map(o=>{const p=o.body.position,q=o.body.quaternion;return [o.alive?1:0,p.x,p.y,p.z,q.x,q.y,q.z,q.w]});
  const hashOf=arr=>{let h=2166136261>>>0;const s=JSON.stringify(arr.map(r=>r.map(v=>Math.round(v*1e6))));for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h.toString(16)};
  const state=()=>({phase:game.phase,level:game.level.id,steps:game.steps,enemies:game.enemies.length,enemiesLeft:game.enemiesLeft,enemiesDown:game.enemies.length-game.enemiesLeft,
    blocks:game.blocks.length,broken:game.broken,gold:game.gold,shotIdx:game.shotIdx,bearsLeft:game.queue.length-game.shotIdx,hash:hashOf(snapshot())});
  const SN=new Map();
  const statics=()=>world.bodies.filter(b=>b.type!==CANNON.Body.DYNAMIC);
  let ALL=null;const allBodies=()=>{if(!ALL||ALL.lv!==game.loadN){ALL=[...statics(),...game.blocks.map(o=>o.body),...game.enemies.map(o=>o.body)];ALL.lv=game.loadN}return ALL}; // 단계를 다시 부를 때마다(같은 단계여도) 새로
  const objs=()=>[...game.blocks,...game.enemies];
  function takeSnap(){const A=allBodies(),ix=b=>A.indexOf(b);
    return {t:world.time,sn:world.stepnumber,steps:game.steps,g:{enemiesLeft:game.enemiesLeft,broken:game.broken,gold:game.gold,shotIdx:game.shotIdx},
      order:world.bodies.map(ix),axis:world.broadphase.axisList.map(ix),
      o:objs().map(o=>{const b=o.body;return {alive:o.alive,inW:o.inWorld,hp:o.hp,crack:o.crack||0,cool:o.cool||0,p:[b.position.x,b.position.y,b.position.z],q:[b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w],
        v:[b.velocity.x,b.velocity.y,b.velocity.z],w:[b.angularVelocity.x,b.angularVelocity.y,b.angularVelocity.z],ss:b.sleepState,tls:b.timeLastSleepy,wa:b.wakeUpAfterNarrowphase}})}}
  function putSnap(s){const A=allBodies();
    if(game.bear){if(!game.bear.gone)world.removeBody(game.bear.body);disposeTree(game.bear.mesh);game.bear=null}
    if(game.pot){world.removeBody(game.pot.body);disposeTree(game.pot.mesh);game.pot=null}
    if(loadedBear){disposeTree(loadedBear);loadedBear=null}
    shotMeshes=[];
    world.time=s.t;world.stepnumber=s.sn;game.steps=s.steps;Object.assign(game,s.g);
    objs().forEach((o,i)=>{const r=s.o[i],b=o.body;o.alive=r.alive;o.hp=r.hp;o.cool=r.cool;
      if(r.inW&&!o.inWorld){world.addBody(b);o.inWorld=true}if(!r.inW&&o.inWorld){world.removeBody(b);o.inWorld=false}
      b.position.set(r.p[0],r.p[1],r.p[2]);b.previousPosition.copy(b.position);b.interpolatedPosition.copy(b.position);
      b.quaternion.set(r.q[0],r.q[1],r.q[2],r.q[3]);b.previousQuaternion.copy(b.quaternion);b.interpolatedQuaternion.copy(b.quaternion);
      b.velocity.set(r.v[0],r.v[1],r.v[2]);b.angularVelocity.set(r.w[0],r.w[1],r.w[2]);b.force.set(0,0,0);b.torque.set(0,0,0);
      b.sleepState=r.ss;b.timeLastSleepy=r.tls;b.wakeUpAfterNarrowphase=r.wa;b.aabbNeedsUpdate=true;b.updateInertiaWorld(true);b.updateAABB();
      if(o.kind==='block'){o.crack=r.crack;o.mesh.material=BLOCKMAT[o.mat][r.crack]}
      if(r.alive){if(!o.mesh.parent)fortG.add(o.mesh);o.mesh.scale.setScalar(1);o.dieT=0}});
    const W=world.bodies;W.length=0;s.order.forEach((k,i)=>{const b=A[k];W.push(b);b.index=i});
    const X=world.broadphase.axisList;X.length=0;s.axis.forEach(k=>X.push(A[k]));
    game.phase='aim';game.result=null;game.shotStep=0;game.quiet=0;game.tapReq=false;game.tapAt=null;ui.overlay(null);loadBearIntoSling();
  }
  window.SF={
    load(id,opts={}){hold=!!opts.hold;paused=false;loadLevel(id,Object.assign({skipIntro:true},opts));return state()},
    fxOff(v){fxOn=!v},
    tap(){if(canTap()){game.tapReq=true;return true}return false},
    // 자동 쏘기용: 판 상태 저장 · 되살리기(물리 몸의 순서 · 넓은 판정 목록 순서까지 그대로 → 처음부터 다시 친 것과 같은 결과)
    snapSave(key){SN.set(key,takeSnap());return key},
    snapDrop(keep){const k=new Set(keep);for(const x of [...SN.keys()])if(!k.has(x))SN.delete(x);return SN.size},
    // key 판에서 후보 쏘기를 하나씩: [[yaw도,힘,누를 걸음|null],...] → 결과(이어서 쏠 수 있으면 key+'.'+i 로 저장)
    tryShots(key,cands){const out=[];cands.forEach((c,i)=>{putSnap(SN.get(key));shoot(c[0]*DEG,c[1],c[2]);let n=0;
      while((game.phase==='flight'||game.phase==='settle')&&n<900){gameStep();n++}
      const st=state();if(game.phase==='aim')SN.set(key+'.'+i,takeSnap());out.push({phase:st.phase,down:st.enemiesDown,left:st.enemiesLeft,broken:st.broken,gold:st.gold,hash:st.hash,steps:n,bossHp:game.enemies.filter(e=>e.boss&&e.alive).reduce((a,e)=>a+e.hp,0)})});return out},
    // 아무렇게나 쏘기 n 판(정해진 씨앗 → 늘 같은 결과): 이긴 판 수 · 남은 곰
    randomRuns(key,n,seed=1){let s=seed>>>0||1;const r=()=>{s=(s*16807)%2147483647;return s/2147483647};const res=[];
      for(let k=0;k<n;k++){putSnap(SN.get(key));while(game.phase==='aim'){const t=game.queue[game.shotIdx];const tap=t==='basic'||r()<.35?null:Math.round(30+r()*60);
          shoot((r()*30-15)*DEG,.35+r()*.5,tap);let m=0;while((game.phase==='flight'||game.phase==='settle')&&m<900){gameStep();m++}}
        res.push({win:game.phase==='win',left:game.phase==='win'?game.queue.length-game.shotIdx:-game.enemiesLeft})}return res},
    // 처음부터 쏘기 순서대로(재현 확인)
    playSeq(id,seq,fx=false){fxOn=fx;hold=true;paused=false;loadLevel(id,{skipIntro:true});const per=[];
      for(const c of seq){if(game.phase!=='aim')break;shoot(c[0]*DEG,c[1],c[2]);let n=0;while((game.phase==='flight'||game.phase==='settle')&&n<900){gameStep();n++}per.push(state().hash)}
      syncAll(0);fxOn=true;return Object.assign(state(),{per,result:game.result})},
    levels(){return LEVELS.map(L=>({id:L.id,name:L.name,bears:L.bears,enemies:L.enemies.length,blocks:L.blocks.length,boss:L.enemies.filter(e=>e[4]).map(e=>e[4]),mats:[...new Set(L.blocks.map(b=>b[0]))],region:L.region||'forest'}))},
    events:()=>game.ev,
    dbg(){const br=game.bear;if(!br)return null;const p=br.body.position;let m=1e9,mm=null;for(const o of game.blocks)if(o.alive){const d=boxDist(o,p);if(d<m){m=d;mm=[o.mat,+o.body.position.x.toFixed(1),+o.body.position.y.toFixed(1),+o.body.position.z.toFixed(1)]}}return [+p.x.toFixed(1),+p.y.toFixed(1),+p.z.toFixed(1),br.charge,br.pierced,+m.toFixed(2),mm,br.body.collisionFilterMask]},save:()=>SAVE.get(),resetSave(){SAVE.reset()},
    hold(v){hold=!!v},
    // 3단계: 강화 · 저장 · 화면 확인용
    setUp(u){testUp=u||null;applyUp();return Object.assign({},UP)},
    setSave(o){SAVE.replace(o);return SAVE.get()},
    show(k,a){paused=true;if(k==='title')ui.title();else if(k==='village')ui.village(a||'title');else if(k==='map')ui.map(a);else if(k==='pause'){paused=false;openPause()}return ui.cur},
    art:()=>Object.assign({},ART.ok),
    textCount:()=>document.querySelectorAll('#fx .fl').length,
    fxTick(dt){fx.update(dt)},
    step(n){for(let i=0;i<n;i++)gameStep();syncAll(0);return state()},
    // 쏘지 않고 sec 초 — 시작 자리에서 가장 많이 · 평균 움직인 거리(m)
    still(sec){const n=Math.round(sec/DT);for(let i=0;i<n;i++)gameStep();syncAll(0);
      const d=[...game.blocks,...game.enemies].map(o=>o.body.position.distanceTo(o.start));
      const rot=[...game.blocks].map(o=>{const q=o.body.quaternion;return 2*Math.acos(Math.min(1,Math.abs(q.w)))/DEG});
      const asleep=world.bodies.filter(b=>b.type===CANNON.Body.DYNAMIC&&b.sleepState===CANNON.Body.SLEEPING).length;
      return {maxMove:Math.max(0,...d),meanMove:d.reduce((a,b)=>a+b,0)/Math.max(1,d.length),maxTiltDeg:Math.max(0,...rot),broken:game.broken,enemiesDown:game.enemies.length-game.enemiesLeft,asleep,dyn:world.bodies.filter(b=>b.type===CANNON.Body.DYNAMIC).length}},
    shoot(yawDeg,power,tapAt=null){return shoot(yawDeg*DEG,power,tapAt)},
    // 이번 곰이 끝날 때까지(최대 sec 초) 걸음
    runShot(sec=14){const t0=performance.now();let n=0,mx=0;const lim=Math.round(sec/DT);
      while((game.phase==='flight'||game.phase==='settle')&&n<lim){const a=performance.now();gameStep();const b=performance.now()-a;if(b>mx)mx=b;n++}
      syncAll(0);return Object.assign(state(),{stepsRun:n,msTotal:performance.now()-t0,msMaxStep:mx})},
    state,snapshot,
    wakeAll(){world.bodies.forEach(b=>b.type===CANNON.Body.DYNAMIC&&b.wakeUp())},
    perf(){return perf},resetPerf(){perf.frames.length=0;perf.steps.length=0},
    aimPreview(yawDeg,pull){aim.on=true;aim.id=-1;aim.yaw=yawDeg*DEG;aim.pull=aim.pow=pull},
    camTo(phase){game.phase=phase},
    moving(){return [...game.blocks.map((o,i)=>['b'+i,o]),...game.enemies.map((o,i)=>['e'+i,o])].filter(([k,o])=>o.alive&&o.body.sleepState!==CANNON.Body.SLEEPING).map(([k,o])=>[k,o.body.sleepState,+o.body.velocity.length().toFixed(3),+o.body.angularVelocity.length().toFixed(3),+o.body.position.y.toFixed(2)])},
  };
}
